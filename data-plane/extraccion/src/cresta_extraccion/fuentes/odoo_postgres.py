"""Fuente Odoo (PostgreSQL directo, read-only).

Regla dura (CLAUDE.md §14): solo lectura. La sesión se abre `read_only` a nivel de
transacción, así que ni un error de programación puede escribir en el ERP.

Odoo se lee por su base de datos y no por su API porque para volumen analítico XML-RPC
es órdenes de magnitud más lento. Requiere que la instalación sea self-hosted (Odoo
Online no expone Postgres).

Particularidades de Odoo 18 que este módulo resuelve (verificadas en vivo):
  - `account_account` NO tiene columnas `code` ni `company_id`: el código vive en
    `code_store` jsonb por compañía y el nombre en `name` jsonb por idioma.
  - Los borradores y cancelados viven en la MISMA tabla que los contabilizados.
  - Solo el 44% de las líneas de factura son de producto (el resto son impuesto y
    plazo de pago).
Los dos últimos se resuelven con filtros del paquete base, no aquí.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
import structlog

log = structlog.get_logger()


@dataclass(frozen=True)
class CampoDescubierto:
    campo: str
    tipo: str
    es_udf: bool
    descripcion_udf: str | None
    tiene_datos: bool | None


def conectar(host: str, puerto: int, usuario: str, clave: str, base_datos: str):  # noqa: ANN201
    """Abre una conexión READ-ONLY a la base de Odoo."""
    if not base_datos:
        raise ValueError(
            "La conexión Odoo no tiene base de datos configurada (conexiones.base_datos)."
        )
    conn = psycopg.connect(
        f"host={host} port={puerto} dbname={base_datos} "
        f"user={usuario} password={clave} connect_timeout=20"
    )
    conn.read_only = True  # garantía a nivel de transacción: nunca escribe en el ERP
    log.info("odoo.conectado", host=host, puerto=puerto, base=base_datos)
    return conn


def _columnas_nativas(conn, esquema: str, tabla: str) -> list[tuple[str, str]]:
    sql = (
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = %s AND table_name = %s ORDER BY ordinal_position"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (esquema, tabla))
        return [(r[0], r[1]) for r in cur.fetchall()]


def columnas_existentes(conn, esquema: str, tabla: str) -> set[str]:
    """Columnas reales de la tabla. Simétrico a sap_b1.columnas_existentes: la extracción
    intersecta lo configurado con lo que la base de la sociedad de verdad tiene."""
    return {c for c, _ in _columnas_nativas(conn, esquema, tabla)}


def _perfilar_no_nulos(
    conn, esquema: str, tabla: str, columnas: list[tuple[str, str]], muestra: int = 100_000
) -> dict[str, bool]:
    """Cuenta no-nulos por columna sobre una muestra, para que el portal sugiera campos."""
    nombres = [c for c, _ in columnas]
    if not nombres:
        return {}
    lista = ", ".join(f'COUNT("{c}")' for c in nombres)
    sql = f'SELECT {lista} FROM (SELECT * FROM "{esquema}"."{tabla}" LIMIT {int(muestra)}) m'
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            fila = cur.fetchone() or []
        return {col: (int(fila[i] or 0) > 0) for i, col in enumerate(nombres)}
    except Exception as e:  # noqa: BLE001 - el perfilado no debe bloquear el descubrimiento
        log.warning("odoo.perfilado.fallo", tabla=tabla, error=str(e))
        return {}


def introspectar(conn, esquema: str, tabla: str) -> list[CampoDescubierto]:
    """Descubre las columnas de una tabla de Odoo + perfilado de datos.

    Odoo no tiene el concepto de campo de usuario de SAP B1: los módulos añaden columnas
    normales. `es_udf` queda en False y la heurística de "campo añadido" se deja al
    diccionario del motor.
    """
    columnas = _columnas_nativas(conn, esquema, tabla)
    if not columnas:
        raise ValueError(f"La tabla {esquema}.{tabla} no existe o no es accesible.")
    tiene = _perfilar_no_nulos(conn, esquema, tabla, columnas)
    resultado = [
        CampoDescubierto(
            campo=nombre, tipo=tipo, es_udf=False, descripcion_udf=None,
            tiene_datos=tiene.get(nombre),
        )
        for nombre, tipo in columnas
    ]
    log.info("odoo.introspeccion.ok", tabla=tabla, columnas=len(resultado))
    return resultado


def _valor_json(v):  # noqa: ANN001, ANN202 - normaliza a JSON-safe para el jsonb de Bronce
    from datetime import date, datetime
    from decimal import Decimal

    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, Decimal):
        return str(v)  # preserva precisión; Plata castea
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None
    if isinstance(v, (dict, list)):
        return v  # jsonb de Odoo (code_store, name, analytic_distribution) pasa tal cual
    return str(v)


def extraer(
    conn, esquema: str, tabla: str, columnas: list[str], filtro: str | None = None
) -> list[dict]:
    """Lee (read-only) las columnas indicadas, con filtro opcional. Devuelve dicts JSON-safe."""
    if not columnas:
        return []
    cols = ", ".join(f'"{c}"' for c in columnas)
    sql = f'SELECT {cols} FROM "{esquema}"."{tabla}"'
    if filtro:
        sql += f" WHERE {filtro}"
    with conn.cursor() as cur:
        cur.execute(sql)
        nombres = [d[0] for d in cur.description]
        filas = [{n: _valor_json(v) for n, v in zip(nombres, fila)} for fila in cur.fetchall()]
    log.info("odoo.extraccion.leida", tabla=tabla, filas=len(filas), columnas=len(columnas))
    return filas
