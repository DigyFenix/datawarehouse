"""Acceso al metadata-store (Postgres): resuelve la conexión de una sociedad y aterriza los
campos descubiertos en metadatos.campo_ingesta. El portal escribe la config; aquí se lee y se
enriquece con la introspección (§4). Nunca se leen credenciales desde aquí (van en el .env).

MULTI-TENANT: la política de ingesta y el mapeo de campos son PROPIOS DE CADA ORGANIZACIÓN
(el objeto 'clientes' sale de OCRD en SAP B1 y de res_partner en Odoo). Todas las lecturas
se filtran por organización. Ver migración 102.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

from .config import ConfigPostgres


@dataclass(frozen=True)
class OrigenSociedad:
    """Datos para conectar al origen de una sociedad y saber a qué base de datos
    del plano de datos escribir (sin credenciales)."""

    empresa_id: str
    entorno_clave: str
    motor: str
    driver: str
    host: str
    puerto: int
    esquema_origen: str
    secreto_ref: str
    base_datos_origen: str          # BD del ERP en la conexión (Odoo); vacío en HANA
    organizacion_id: int            # tenant dueño de la sociedad
    organizacion_codigo: str
    base_datos_dw: str              # dw_<codigo>: destino de bronce/plata/oro (aislamiento)


def resolver_origen(cfg: ConfigPostgres, empresa_id: str) -> OrigenSociedad:
    """Une sociedad → conexión → entorno → organización.

    Devuelve a dónde conectar (origen) Y a qué base de datos escribir (destino del
    tenant). El aislamiento entre organizaciones-cliente depende de esto: los datos
    de dos clientes nunca comparten base (ver migración 100)."""
    consulta = """
        select s.empresa_id, c.entorno_clave, e.motor, e.driver, c.host, c.puerto,
               s.esquema_origen, c.secreto_ref, coalesce(c.base_datos, ''),
               o.id, o.codigo, o.base_datos_dw
        from gobierno.sociedades s
        join gobierno.conexiones c on c.id = s.conexion_id
        join metadatos.entornos_ejecucion e on e.clave = c.entorno_clave
        join gobierno.organizaciones o on o.id = s.organizacion_id
        where s.empresa_id = %s
    """
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(consulta, (empresa_id,))
        fila = cur.fetchone()
    if not fila:
        raise ValueError(
            f"La sociedad '{empresa_id}' no existe, no tiene conexión asignada, "
            "o no está ligada a una organización en el portal."
        )
    if not fila[11]:
        raise ValueError(
            f"La organización '{fila[10]}' no tiene base de datos de plano de datos "
            "asignada (organizaciones.base_datos_dw). Aprovisiónala antes de extraer."
        )
    return OrigenSociedad(
        empresa_id=fila[0], entorno_clave=fila[1], motor=fila[2], driver=fila[3],
        host=fila[4], puerto=int(fila[5]), esquema_origen=fila[6] or "", secreto_ref=fila[7],
        base_datos_origen=fila[8], organizacion_id=int(fila[9]),
        organizacion_codigo=fila[10], base_datos_dw=fila[11],
    )


def organizacion_id_por_codigo(cfg: ConfigPostgres, codigo: str) -> int:
    """id de la organización por su código. Falla claro si no existe."""
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute("select id from gobierno.organizaciones where codigo = %s", (codigo,))
        fila = cur.fetchone()
    if not fila:
        raise ValueError(f"La organización '{codigo}' no existe.")
    return int(fila[0])


def tablas_de_objeto(cfg: ConfigPostgres, organizacion_id: int, objeto: str) -> list[str]:
    """Tablas nativas de una entidad (política.fuente_objeto, p.ej. 'OINV+INV1' → [OINV, INV1])."""
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(
            "select fuente_objeto from metadatos.politica_ingesta "
            "where organizacion_id = %s and objeto = %s",
            (organizacion_id, objeto),
        )
        fila = cur.fetchone()
    if not fila or not fila[0]:
        return []
    return [t.strip() for t in fila[0].replace("+", ",").split(",") if t.strip()]


def politica_de_objeto(cfg: ConfigPostgres, organizacion_id: int, objeto: str) -> dict | None:
    """Devuelve la política (estrategia, campo_fecha, lookback) del objeto, o None."""
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(
            "select estrategia, campo_fecha, lookback_valor, lookback_unidad, tipo_objeto, "
            "filtro_origen, clave_natural "
            "from metadatos.politica_ingesta "
            "where organizacion_id = %s and objeto = %s",
            (organizacion_id, objeto),
        )
        fila = cur.fetchone()
    if not fila:
        return None
    return {
        "estrategia": fila[0], "campo_fecha": fila[1],
        "lookback_valor": fila[2], "lookback_unidad": fila[3],
        "tipo_objeto": fila[4], "filtro_origen": fila[5], "clave_natural": fila[6],
    }


def campos_incluidos(
    cfg: ConfigPostgres, organizacion_id: int, objeto: str
) -> list[tuple[str, str]]:
    """(tabla_origen, campo_origen) de los campos marcados 'incluido' para el objeto."""
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(
            "select tabla_origen, campo_origen from metadatos.campo_ingesta "
            "where organizacion_id = %s and objeto = %s and incluido = true "
            "order by tabla_origen, id",
            (organizacion_id, objeto),
        )
        return [(r[0], r[1]) for r in cur.fetchall()]


def filtros_de_objeto(
    cfg: ConfigPostgres, organizacion_id: int, objeto: str
) -> list[tuple[str, str, str, str]]:
    """(tabla_origen, campo_origen, operador, valor) de los filtros por campo del objeto.

    Se aplican en el WHERE del ORIGEN (se empuja el filtro al ERP: menos datos viajan y
    Bronce no se ensucia). Son los filtros duros del paquete base, p.ej. en Odoo
    `state = 'posted'` (los borradores viven en la misma tabla) y `company_id = 1`.
    """
    with psycopg.connect(cfg.dsn()) as conn, conn.cursor() as cur:
        cur.execute(
            "select tabla_origen, campo_origen, filtro_op, filtro_valor "
            "from metadatos.campo_ingesta "
            "where organizacion_id = %s and objeto = %s "
            "  and filtro_op is not null and filtro_valor is not null "
            "order by tabla_origen, campo_origen",
            (organizacion_id, objeto),
        )
        return [(r[0], r[1], r[2], r[3]) for r in cur.fetchall()]


def upsert_campos(
    cfg: ConfigPostgres, organizacion_id: int, objeto: str, campos: list[dict]
) -> tuple[int, int]:
    """Aterriza los campos descubiertos. Inserta nuevos; en existentes actualiza los metadatos
    de descubrimiento PERO preserva la decisión del usuario (incluido, mapeo, filtros).
    Devuelve (insertados, actualizados)."""
    sql = """
        insert into metadatos.campo_ingesta
          (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
           canonico_entidad, campo_canonico, transformacion, sugerido, incluido, tiene_datos, origen)
        values (%(organizacion_id)s, %(objeto)s, %(tabla)s, %(campo)s, %(es_udf)s, %(tipo)s,
                %(descripcion)s, %(canonico_entidad)s, %(canonico)s, %(transformacion)s,
                %(sugerido)s, %(incluido)s, %(tiene_datos)s, 'introspeccion')
        on conflict (organizacion_id, objeto, tabla_origen, campo_origen) do update set
          es_udf = excluded.es_udf,
          tipo_origen = excluded.tipo_origen,
          descripcion = coalesce(metadatos.campo_ingesta.descripcion, excluded.descripcion),
          canonico_entidad = excluded.canonico_entidad,
          tiene_datos = excluded.tiene_datos,
          origen = 'introspeccion',
          actualizado_en = now()
        -- incluido, campo_canonico, transformacion y sugerido NO se pisan (respeta lo que tocó el usuario)
        returning (xmax = 0) as insertado
    """
    ins = act = 0
    with psycopg.connect(cfg.dsn()) as conn:
        with conn.cursor() as cur:
            for c in campos:
                cur.execute(sql, {"organizacion_id": organizacion_id, "objeto": objeto, **c})
                if cur.fetchone()[0]:
                    ins += 1
                else:
                    act += 1
        conn.commit()
    return ins, act
