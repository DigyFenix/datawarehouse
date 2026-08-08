"""Actualización COMPLETA de una organización: extracción ERP → Bronce y build a Oro.

Por qué existe: el portal extrae **por objeto y por sociedad** (un botón por par), que es lo
correcto para corregir algo puntual pero inviable para el refresco periódico — Grupo Cresta son
10 sociedades × 18 objetos = 180 corridas a mano. `correr.py` ya resolvía la mitad de abajo
(el build dbt); esto resuelve la de arriba y las encadena en el orden que exige el cuadre.

Lee TODO de la base de control, igual que el worker y que `correr.py`: sociedades activas,
objetos con política activa, conexión, ERP y base del tenant. No recibe listas por argumento —
lo que está en el portal es lo que se extrae (el portal es la fuente de verdad).

Uso (desde el host):
    docker exec quilate-worker python3 /dbt/herramientas/actualizar.py <codigo_org> [opciones]

    <codigo_org>      código de la organización (gobierno.organizaciones.codigo)

    --solo-extraer    extrae y NO corre dbt
    --solo-build      salta la extracción y corre el build (equivale a correr.py)
    --sociedad X      limita a una sociedad (repetible)
    --objeto Y        limita a un objeto (repetible)
    --desde / --hasta ventana ISO yyyy-mm-dd que sobreescribe el lookback de la política
    --threads N       paralelismo de dbt (por defecto el del profiles)
    --forzar-build    corre el build aunque alguna extracción haya fallado

REGLA DE SEGURIDAD: si una extracción falla, el build NO corre. Un Oro construido sobre un
Bronce incompleto cuadra contra sí mismo y no contra el ERP — es exactamente el error que el
control de cuadre existe para atrapar, y correrlo igual lo enmascara. `--forzar-build` está
para cuando el fallo es de un objeto que no alimenta el cuadre y se asume a conciencia.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import psycopg

from quilate_extraccion.config import cargar_postgres
from quilate_extraccion.extraccion import extraer_objeto
from quilate_extraccion.transformacion import (
    PROFILES_DIR,
    PROYECTO_DBT,
    _destino_organizacion,
    _escribir_profiles,
    _vars_transformacion,
)


def _sociedades(cfg, organizacion: str) -> list[str]:
    """Sociedades activas de la organización, en orden estable."""
    consulta = """
        select s.empresa_id
          from gobierno.sociedades s
          join gobierno.organizaciones o on o.id = s.organizacion_id
         where o.codigo = %s and s.activo
         order by s.empresa_id
    """
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(consulta, (organizacion,))
        return [f[0] for f in cur.fetchall()]


def _objetos(cfg, organizacion: str) -> list[str]:
    """Objetos con política de ingesta activa, en orden estable."""
    consulta = """
        select p.objeto
          from metadatos.politica_ingesta p
          join gobierno.organizaciones o on o.id = p.organizacion_id
         where o.codigo = %s and p.activo
         order by p.objeto
    """
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(consulta, (organizacion,))
        return [f[0] for f in cur.fetchall()]


def _parse(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Actualiza una organización: ERP → Bronce → Oro")
    p.add_argument("organizacion", help="código de la organización")
    p.add_argument("--solo-extraer", action="store_true")
    p.add_argument("--solo-build", action="store_true")
    p.add_argument("--sociedad", action="append", help="limita a esta sociedad (repetible)")
    p.add_argument("--objeto", action="append", help="limita a este objeto (repetible)")
    p.add_argument("--desde", help="inicio de ventana ISO yyyy-mm-dd")
    p.add_argument("--hasta", help="fin de ventana ISO EXCLUSIVO yyyy-mm-dd")
    p.add_argument("--threads", help="paralelismo de dbt")
    p.add_argument("--forzar-build", action="store_true")
    return p.parse_args(argv)


def _extraer_todo(cfg, args: argparse.Namespace) -> tuple[int, list[tuple[str, str, str]]]:
    """Devuelve (filas totales, fallos). Un fallo no aborta el recorrido: se registra y sigue,
    para que una corrida deje el diagnóstico completo en vez del primer error."""
    sociedades = args.sociedad or _sociedades(cfg, args.organizacion)
    objetos = args.objeto or _objetos(cfg, args.organizacion)
    if not sociedades:
        raise ValueError(f"'{args.organizacion}' no tiene sociedades activas.")
    if not objetos:
        raise ValueError(f"'{args.organizacion}' no tiene objetos con política activa.")

    total_pares = len(sociedades) * len(objetos)
    print(f"\nEXTRACCIÓN · {args.organizacion} · {len(sociedades)} sociedades × "
          f"{len(objetos)} objetos = {total_pares} corridas", flush=True)

    filas_totales = 0
    fallos: list[tuple[str, str, str]] = []
    hecho = 0
    for sociedad in sociedades:
        for objeto in objetos:
            hecho += 1
            marca = f"[{hecho}/{total_pares}] {sociedad}/{objeto}"
            inicio = time.monotonic()
            try:
                resumen = extraer_objeto(cfg, sociedad, objeto, args.desde, args.hasta)
            except Exception as e:  # noqa: BLE001 — CLI: registrar el par y continuar
                fallos.append((sociedad, objeto, str(e)))
                print(f"{marca} · FALLA · {e}", flush=True)
                continue
            filas = int(resumen.get("filas", 0) or 0)
            filas_totales += filas
            print(f"{marca} · {filas} filas · {time.monotonic() - inicio:.1f}s", flush=True)

    print(f"\nExtracción terminada · {filas_totales} filas · {len(fallos)} fallos", flush=True)
    for sociedad, objeto, error in fallos:
        print(f"  FALLA {sociedad}/{objeto}: {error}", flush=True)
    return filas_totales, fallos


def _build(cfg, args: argparse.Namespace) -> int:
    base_datos, erp = _destino_organizacion(cfg, args.organizacion)
    variables = _vars_transformacion(cfg, args.organizacion, erp)
    _escribir_profiles(cfg, base_datos, args.organizacion)
    print(f"\nBUILD · org={args.organizacion} · base={base_datos} · erp={erp} · "
          f"sociedades={len(variables['sociedades'])} · nits={len(variables['nits_grupo'])}",
          flush=True)

    from dbt.cli.main import dbtRunner

    argumentos = [
        "build",
        "--project-dir", PROYECTO_DBT,
        "--profiles-dir", PROFILES_DIR,
        "--target", args.organizacion,
        "--vars", json.dumps(variables),
    ]
    if args.threads:
        argumentos += ["--threads", args.threads]

    resultado = dbtRunner().invoke(argumentos)
    return 0 if resultado.success else 1


def main(argv: list[str] | None = None) -> int:
    args = _parse(argv)
    if args.solo_extraer and args.solo_build:
        print("ERROR: --solo-extraer y --solo-build se excluyen.", file=sys.stderr)
        return 2

    cfg = cargar_postgres()
    fallos: list[tuple[str, str, str]] = []

    if not args.solo_build:
        _, fallos = _extraer_todo(cfg, args)
        if args.solo_extraer:
            return 1 if fallos else 0

    if fallos and not args.forzar_build:
        print(f"\nBUILD OMITIDO: {len(fallos)} extracciones fallaron. Un Oro construido sobre "
              "un Bronce incompleto cuadra contra sí mismo, no contra el ERP. Corregí los "
              "fallos y volvé a correr, o usá --forzar-build si los asumís.", file=sys.stderr)
        return 1

    return _build(cfg, args)


if __name__ == "__main__":
    raise SystemExit(main())
