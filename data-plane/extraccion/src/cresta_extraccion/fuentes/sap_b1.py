"""Fuente SAP Business One / HANA (read-only). Introspección + (Fase siguiente) extracción.

Regla dura (CLAUDE.md §14): solo lectura por la vía aprobada (usuario read-only). Nunca escribir
en el ERP. La introspección lee metadatos del sistema (SYS.TABLE_COLUMNS) y las definiciones de
campos de usuario (CUFD), y perfila qué columnas tienen datos.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

log = structlog.get_logger()


# Tipos que no admiten COUNT/agregación en HANA (se excluyen del perfilado; tiene_datos = None).
TIPOS_LOB = {
    "BLOB", "CLOB", "NCLOB", "TEXT", "BINTEXT", "ARRAY",
    "ST_GEOMETRY", "ST_POINT", "ST_MEMORY_LOB",
}


@dataclass(frozen=True)
class CampoDescubierto:
    campo: str
    tipo: str
    es_udf: bool
    descripcion_udf: str | None  # descripción de CUFD si es UDF; None si nativo
    tiene_datos: bool | None      # None = no perfilable (tipo LOB)


def conectar(host: str, puerto: int, usuario: str, clave: str):  # noqa: ANN201 - tipo hdbcli
    """Conecta a HANA read-only. Intenta cifrado y cae a no-cifrado (redes internas de SAP B1)."""
    from hdbcli import dbapi  # import perezoso: solo si se usa la fuente HANA

    intentos = (
        {"encrypt": True, "sslValidateCertificate": False},
        {"encrypt": False},
    )
    ultimo: Exception | None = None
    for opciones in intentos:
        try:
            conn = dbapi.connect(address=host, port=puerto, user=usuario, password=clave, **opciones)
            log.info("hana.conectado", host=host, puerto=puerto, cifrado=opciones.get("encrypt"))
            return conn
        except Exception as e:  # noqa: BLE001 - se reintenta con la otra opción
            ultimo = e
    raise ConnectionError(f"No se pudo conectar a HANA {host}:{puerto}: {ultimo}")


def _columnas_nativas(conn, esquema: str, tabla: str) -> list[tuple[str, str]]:
    """(nombre, tipo) de todas las columnas de la tabla, en orden. Incluye UDFs (U_*)."""
    sql = (
        "SELECT COLUMN_NAME, DATA_TYPE_NAME FROM SYS.TABLE_COLUMNS "
        "WHERE SCHEMA_NAME = ? AND TABLE_NAME = ? ORDER BY POSITION"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (esquema, tabla))
        return [(r[0], r[1]) for r in cur.fetchall()]


def columnas_existentes(conn, esquema: str, tabla: str) -> set[str]:
    """Columnas reales de la tabla en ESTE esquema. Los campos se configuran por organización,
    pero los UDF varían por sociedad (U_* de Proavisa no existen en Loreto): la extracción
    intersecta lo configurado con lo que el schema de la sociedad de verdad tiene."""
    return {c for c, _ in _columnas_nativas(conn, esquema, tabla)}


def _descripciones_udf(conn, esquema: str, tabla: str) -> dict[str, str]:
    """{ 'U_'+AliasID : Descr } de los campos de usuario definidos para la tabla (CUFD)."""
    sql = f'SELECT "AliasID", "Descr" FROM "{esquema}"."CUFD" WHERE "TableID" = ?'
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (tabla,))
            return {f"U_{r[0]}": (r[1] or "") for r in cur.fetchall()}
    except Exception as e:  # noqa: BLE001 - CUFD puede no ser accesible; se sigue sin UDF desc
        log.warning("cufd.no_accesible", tabla=tabla, error=str(e))
        return {}


def _perfilar_no_nulos(
    conn, esquema: str, tabla: str, columnas: list[tuple[str, str]], muestra: int = 100_000
) -> dict[str, bool]:
    """Cuenta no-nulos por columna sobre una muestra. Excluye tipos LOB (no agregables).
    Devuelve solo las columnas perfilables; las omitidas quedan como 'desconocido' (None) arriba."""
    perfilables = [c for c, tipo in columnas if tipo.upper() not in TIPOS_LOB]
    if not perfilables:
        return {}
    lista = ", ".join(f'COUNT("{c}")' for c in perfilables)
    sql = f'SELECT {lista} FROM (SELECT * FROM "{esquema}"."{tabla}" LIMIT {int(muestra)})'
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            fila = cur.fetchone() or []
        return {col: (int(fila[i] or 0) > 0) for i, col in enumerate(perfilables)}
    except Exception as e:  # noqa: BLE001 - si el perfilado falla, no se bloquea el descubrimiento
        log.warning("perfilado.fallo", tabla=tabla, error=str(e))
        return {}


def _valor_json(v):  # noqa: ANN001, ANN202 - normaliza a JSON-safe para jsonb de Bronze
    from datetime import date, datetime
    from decimal import Decimal

    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, Decimal):
        return str(v)  # preserva precisión; Silver castea
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None  # binarios/LOB no van a Bronze json
    return str(v)


def extraer(conn, esquema: str, tabla: str, columnas: list[str], filtro: str | None = None) -> list[dict]:
    """Lee (read-only) las columnas indicadas de la tabla, con filtro opcional. Devuelve filas
    como dicts JSON-safe (para aterrizar en bronce.<tabla>.datos jsonb)."""
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
    log.info("extraccion.leida", tabla=tabla, filas=len(filas), columnas=len(columnas))
    return filas


def introspectar(conn, esquema: str, tabla: str) -> list[CampoDescubierto]:
    """Descubre las columnas de una tabla: nativas + UDFs (con descripción) + perfilado de datos."""
    columnas = _columnas_nativas(conn, esquema, tabla)
    if not columnas:
        raise ValueError(f"La tabla {esquema}.{tabla} no existe o no es accesible para el usuario.")
    udf_desc = _descripciones_udf(conn, esquema, tabla)
    tiene = _perfilar_no_nulos(conn, esquema, tabla, columnas)

    resultado: list[CampoDescubierto] = []
    for nombre, tipo in columnas:
        es_udf = nombre.startswith("U_")
        resultado.append(
            CampoDescubierto(
                campo=nombre,
                tipo=tipo,
                es_udf=es_udf,
                descripcion_udf=udf_desc.get(nombre) if es_udf else None,
                tiene_datos=tiene.get(nombre),  # None si no se pudo perfilar (LOB)
            )
        )
    log.info("introspeccion.ok", tabla=tabla, columnas=len(resultado),
             udfs=sum(1 for c in resultado if c.es_udf))
    return resultado
