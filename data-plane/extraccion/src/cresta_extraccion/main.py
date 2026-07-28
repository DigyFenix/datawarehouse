"""Orquestador CLI de extracción / descubrimiento.

Comandos:
  descubrir   Introspecta el origen de una sociedad y llena metadatos.campo_ingesta.
              python -m cresta_extraccion.main descubrir --sociedad proavisa --objeto clientes [--tabla OCRD]

  (extraer)   Extracción read-only ERP -> Bronze (Fase siguiente).
"""

from __future__ import annotations

import argparse
import sys

import structlog

from .config import cargar_postgres
from .extraccion import extraer_objeto
from .introspeccion import descubrir
from .transformacion import transformar_objeto

log = structlog.get_logger()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extracción / descubrimiento read-only ERP -> Bronze")
    sub = p.add_subparsers(dest="comando", required=True)

    d = sub.add_parser("descubrir", help="Introspecta el origen y llena campo_ingesta")
    d.add_argument("--sociedad", required=True, help="empresa_id de la sociedad (p.ej. proavisa)")
    d.add_argument("--objeto", required=True, help="entidad/política (p.ej. clientes)")
    d.add_argument("--tabla", action="append", help="tabla(s) de origen; repite para varias. Si se omite, se toman de la política")

    e = sub.add_parser("extraer", help="Extrae read-only ERP -> Bronce (campos incluidos)")
    e.add_argument("--sociedad", required=True, help="empresa_id de la sociedad")
    e.add_argument("--objeto", required=True, help="entidad/política (p.ej. clientes)")
    e.add_argument("--desde", help="Inicio de ventana ISO (yyyy-mm-dd). Sobreescribe el lookback de la política")
    e.add_argument("--hasta", help="Fin de ventana ISO EXCLUSIVO (yyyy-mm-dd)")

    t = sub.add_parser("transformar", help="Corre dbt build (Bronce->Plata->Oro) gobernado por la política")
    t.add_argument("--objeto", required=True, help="entidad/política (p.ej. clientes)")
    t.add_argument("--organizacion", required=True, help="tenant destino (p.ej. grupocresta)")

    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.comando == "descubrir":
        cfg = cargar_postgres()
        try:
            resumen = descubrir(cfg, args.sociedad, args.objeto, args.tabla)
        except Exception as e:  # noqa: BLE001 - CLI: reportar claro y salir con error
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        print(
            f"OK · {resumen['objeto']} @ {resumen['empresa_id']} · tablas={resumen['tablas']} · "
            f"descubiertos={resumen['descubiertos']} (insertados={resumen['insertados']}, "
            f"actualizados={resumen['actualizados']}) · sugeridos={resumen['sugeridos']} · "
            f"con_datos={resumen['con_datos']}"
        )
        return 0
    if args.comando == "extraer":
        cfg = cargar_postgres()
        try:
            resumen = extraer_objeto(
                cfg, args.sociedad, args.objeto, args.desde, args.hasta
            )
        except Exception as e:  # noqa: BLE001
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        ventana = ""
        if resumen.get("fecha_desde"):
            ventana = f" · ventana={resumen['fecha_desde']}→{resumen.get('fecha_hasta') or 'hoy'}"
        print(
            f"OK · {resumen['objeto']} @ {resumen['empresa_id']} ({resumen['organizacion']}"
            f"/{resumen['motor']}) → {resumen['base_datos_dw']} · "
            f"estrategia={resumen['estrategia']}{ventana} · "
            f"tablas={resumen['tablas']} · filas={resumen['filas']}"
        )
        return 0
    if args.comando == "transformar":
        cfg = cargar_postgres()
        try:
            resumen = transformar_objeto(cfg, args.objeto, args.organizacion)
        except Exception as e:  # noqa: BLE001
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        print(
            f"OK · {resumen['objeto']} @ {resumen['organizacion']} ({resumen['erp']}) → "
            f"{resumen['base_datos']} · selector={resumen['selector']} · nodos={resumen['nodos']}"
        )
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
