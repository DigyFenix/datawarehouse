"""Transformación gobernada Bronce → Plata → Oro, disparada desde el portal.

El portal (plano de control) define en la política de ingesta QUÉ modelos dbt transforman
cada objeto (`metadatos.politica_ingesta.modelos_dbt`, una selección `dbt build --select`).
Este módulo lee esa selección y corre dbt programáticamente (dbtRunner) dentro del worker,
respetando la separación de planos: el portal gobierna, el plano de datos ejecuta.

No genera SQL: los modelos viven en el repo (data-plane/transformacion) y son gobernados;
la política solo elige cuáles se materializan.

AISLAMIENTO POR TENANT: dbt corre contra la base de datos de la organización
(`organizaciones.base_datos_dw`) y recibe el ERP del tenant como var, para que los modelos
de Plata sepan de qué forma viene Bronce. Ver migración 100.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
import structlog

from .config import ConfigPostgres

log = structlog.get_logger()

# Proyecto dbt (montado en el contenedor) y dónde escribir el profiles.yml generado.
PROYECTO_DBT = os.environ.get("DBT_PROJECT_DIR", "/dbt")
PROFILES_DIR = os.environ.get("DBT_PROFILES_DIR", "/tmp/dbt")

# ERP del tenant → forma de leer Bronce en los modelos de Plata.
ERP_POR_MOTOR = {"hana": "sap_b1", "postgres": "odoo"}


def _selector_de_objeto(cfg: ConfigPostgres, objeto: str, organizacion: str) -> str | None:
    """Selección dbt gobernada del objeto (política.modelos_dbt), o None si no hay.

    Se resuelve por (organización, objeto): el mismo objeto existe en varios tenants con
    fuente y modelos distintos, así que filtrar solo por objeto tomaría la política de
    cualquiera de ellos (ver migración 102).
    """
    consulta = """
        select p.modelos_dbt
          from metadatos.politica_ingesta p
          join gobierno.organizaciones o on o.id = p.organizacion_id
         where o.codigo = %s and p.objeto = %s
    """
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(consulta, (organizacion, objeto))
        fila = cur.fetchone()
    if fila is None:
        raise ValueError(f"'{objeto}' no tiene política de ingesta en '{organizacion}'.")
    return (fila[0] or "").strip() or None


def _destino_organizacion(cfg: ConfigPostgres, organizacion: str) -> tuple[str, str]:
    """(base_datos_dw, erp) de la organización. El ERP sale del entorno de su conexión."""
    consulta = """
        select o.base_datos_dw, min(e.motor)
          from gobierno.organizaciones o
          left join gobierno.sociedades s on s.organizacion_id = o.id
          left join gobierno.conexiones c on c.id = s.conexion_id
          left join metadatos.entornos_ejecucion e on e.clave = c.entorno_clave
         where o.codigo = %s
         group by o.base_datos_dw
    """
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(consulta, (organizacion,))
        fila = cur.fetchone()
    if not fila:
        raise ValueError(f"La organización '{organizacion}' no existe.")
    base, motor = fila[0], fila[1]
    if not base:
        raise ValueError(
            f"La organización '{organizacion}' no tiene base de datos de plano de datos "
            "asignada (organizaciones.base_datos_dw)."
        )
    erp = ERP_POR_MOTOR.get(motor or "")
    if not erp:
        raise ValueError(
            f"No puedo determinar el ERP de '{organizacion}' (motor='{motor}'). "
            "Revisa la conexión de sus sociedades."
        )
    return base, erp


def _escribir_profiles(cfg: ConfigPostgres, base_datos: str, target: str) -> None:
    """Genera el profiles.yml de dbt desde el entorno (sin secretos en repo).

    El target apunta a la base del TENANT; los modelos sobreescriben el esquema a
    bronce/plata/oro mediante la macro generate_schema_name.
    """
    contenido = (
        "cresta_dw:\n"
        f"  target: {target}\n"
        "  outputs:\n"
        f"    {target}:\n"
        "      type: postgres\n"
        f"      host: {cfg.host}\n"
        f"      port: {cfg.port}\n"
        f"      dbname: {base_datos}\n"
        f"      user: {cfg.user}\n"
        f"      password: {cfg.password}\n"
        "      schema: plata\n"
        "      threads: 4\n"
    )
    destino = Path(PROFILES_DIR)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "profiles.yml").write_text(contenido, encoding="utf-8")


def transformar_objeto(cfg: ConfigPostgres, objeto: str, organizacion: str) -> dict:
    """Corre `dbt build` con la selección gobernada del objeto, contra la base del tenant."""
    selector = _selector_de_objeto(cfg, objeto, organizacion)
    if not selector:
        raise ValueError(
            f"'{objeto}' no tiene modelos dbt configurados. Defínelos en la política "
            "(campo 'Modelos dbt'), p.ej. 'plata_socio_negocio+'."
        )

    base_datos, erp = _destino_organizacion(cfg, organizacion)
    target = organizacion
    _escribir_profiles(cfg, base_datos, target)

    # Importación diferida: dbt es pesado; solo se carga al transformar.
    from dbt.cli.main import dbtRunner

    argumentos = [
        "build",
        "--select", selector,
        "--project-dir", PROYECTO_DBT,
        "--profiles-dir", PROFILES_DIR,
        "--target", target,
        "--vars", json.dumps({"erp": erp, "organizacion": organizacion}),
    ]
    log.info(
        "transformar.inicio", objeto=objeto, selector=selector,
        organizacion=organizacion, base=base_datos, erp=erp,
    )
    resultado = dbtRunner().invoke(argumentos)

    nodos: list[dict] = []
    if resultado.result is not None:
        for r in getattr(resultado.result, "results", []):
            nodos.append(
                {
                    "nodo": getattr(r.node, "name", str(getattr(r, "node", ""))),
                    "estado": str(getattr(r, "status", "")),
                }
            )

    if not resultado.success:
        fallidos = [n for n in nodos if n["estado"] not in ("success", "pass")]
        detalle = ", ".join(f"{n['nodo']}={n['estado']}" for n in fallidos) or str(resultado.exception)
        raise RuntimeError(f"dbt build falló para '{objeto}' ({organizacion}): {detalle}")

    resumen = {
        "objeto": objeto,
        "organizacion": organizacion,
        "base_datos": base_datos,
        "erp": erp,
        "selector": selector,
        "nodos": len(nodos),
        "detalle": nodos,
    }
    log.info("transformar.ok", **{k: v for k, v in resumen.items() if k != "detalle"})
    return resumen
