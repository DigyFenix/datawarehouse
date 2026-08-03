"""Orquestador de descubrimiento de campos (introspección auto-descriptiva).

Para una sociedad + entidad: resuelve la conexión, conecta read-only a HANA, introspecta las
tablas de origen, enriquece con el diccionario base (auto-mapeo 1:1 + sugerencias + descripción
en español) y aterriza el resultado en metadatos.campo_ingesta. Respeta la decisión del usuario
(no pisa 'incluido'). No mueve datos de negocio: solo metadatos de columnas.
"""

from __future__ import annotations

import structlog

from . import diccionario
from .catalogo import ConfigPostgres, resolver_origen, tablas_de_objeto, upsert_campos
from .config import credenciales_origen
from .fuentes import odoo_postgres, sap_b1, sap_b1_mssql

log = structlog.get_logger()

MOTORES = {"hana", "sqlserver", "postgres"}


def descubrir(
    cfg: ConfigPostgres, empresa_id: str, objeto: str, tablas: list[str] | None = None
) -> dict:
    """Descubre y persiste los campos de `objeto` usando la conexión de la sociedad `empresa_id`.

    `tablas` permite forzar las tablas de origen; si no, se leen de la política del objeto.
    Devuelve un resumen { tablas, insertados, actualizados, sugeridos }.
    """
    origen = resolver_origen(cfg, empresa_id)
    if origen.motor not in MOTORES:
        raise NotImplementedError(
            f"Introspección para motor '{origen.motor}' no implementada (soportados: {sorted(MOTORES)})."
        )
    if not origen.esquema_origen:
        raise ValueError(f"La sociedad '{empresa_id}' no tiene esquema de origen configurado.")

    tablas_obj = tablas or tablas_de_objeto(cfg, origen.organizacion_id, objeto)
    if not tablas_obj:
        raise ValueError(
            f"No sé qué tablas leer para '{objeto}'. Créale la política (fuente en origen) "
            "o pásame --tabla."
        )

    usuario, clave = credenciales_origen(origen.secreto_ref)
    if origen.motor == "hana":
        fuente = sap_b1
        conn = sap_b1.conectar(origen.host, origen.puerto, usuario, clave)
    elif origen.motor == "sqlserver":
        # SAP sobre SQL Server: mismo ERP, otro motor. esquema_origen = BASE de la sociedad.
        fuente = sap_b1_mssql
        conn = sap_b1_mssql.conectar(origen.host, origen.puerto, usuario, clave)
    else:
        fuente = odoo_postgres
        conn = odoo_postgres.conectar(
            origen.host, origen.puerto, usuario, clave, origen.base_datos_origen
        )
    try:
        campos_bd: list[dict] = []
        for tabla in tablas_obj:
            entidad_canonica = diccionario.canonico_de_tabla(tabla)
            descubiertos = fuente.introspectar(conn, origen.esquema_origen, tabla)
            for c in descubiertos:
                base = diccionario.entrada(tabla, c.campo)
                canonico, transformacion, sugerido, desc_base = base or (None, "directo", False, None)
                # descripción: diccionario (nativo) → CUFD (UDF) → None
                descripcion = desc_base or c.descripcion_udf
                campos_bd.append(
                    {
                        "tabla": tabla,
                        "campo": c.campo,
                        "es_udf": c.es_udf,
                        "tipo": c.tipo,
                        "descripcion": descripcion,
                        "canonico_entidad": entidad_canonica,
                        "canonico": canonico,
                        "transformacion": transformacion,
                        # sugerido = lo que recomienda el diccionario del motor
                        "sugerido": sugerido,
                        # incluido por default: solo lo sugerido con mapeo canónico (lo esencial de Silver)
                        "incluido": bool(sugerido and canonico),
                        "tiene_datos": c.tiene_datos,
                    }
                )
        ins, act = upsert_campos(cfg, origen.organizacion_id, objeto, campos_bd)
    finally:
        conn.close()

    resumen = {
        "objeto": objeto,
        "empresa_id": empresa_id,
        "tablas": tablas_obj,
        "descubiertos": len(campos_bd),
        "insertados": ins,
        "actualizados": act,
        "sugeridos": sum(1 for c in campos_bd if c["sugerido"]),
        "con_datos": sum(1 for c in campos_bd if c["tiene_datos"]),
    }
    log.info("descubrir.ok", **resumen)
    return resumen
