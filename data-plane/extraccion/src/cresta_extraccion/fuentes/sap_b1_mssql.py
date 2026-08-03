"""Fuente SAP Business One / SQL SERVER (read-only). Espejo de sap_b1.py (HANA).

Mismo ERP, otro motor: los nombres de tablas y columnas SAP son CANÓNICOS entre HANA y SQL
Server (OINV, CRD1, CUFD, WTSum…), así que la política, los campos y todo dbt sirven tal
cual. Diferencias que concentra este módulo:

  - Driver `pymssql` en vez de `hdbcli`.
  - En SQL Server SAP usa una BASE DE DATOS por sociedad (no un schema como HANA): el
    `esquema_origen` de la sociedad guarda el nombre de la base (SBO_XXX) y aquí se consulta
    [base].dbo.[tabla].
  - Introspección con INFORMATION_SCHEMA en vez de SYS.TABLE_COLUMNS (CUFD es igual: tabla SAP).
  - `SET QUOTED_IDENTIFIER ON` al conectar: los filtros que arma la extracción citan columnas
    con comillas dobles ("DocDate" >= ...), la sintaxis portable entre ambos motores.

Regla dura (CLAUDE.md §14): solo lectura por la vía aprobada. Nunca escribir en el ERP.
"""

from __future__ import annotations

import structlog

from .sap_b1 import CampoDescubierto, _valor_json

log = structlog.get_logger()

# Tipos no agregables/perfilables de SQL Server (equivalente a TIPOS_LOB de HANA).
TIPOS_LOB = {"TEXT", "NTEXT", "IMAGE", "XML", "VARBINARY", "SQL_VARIANT", "GEOGRAPHY", "GEOMETRY"}


def conectar(host: str, puerto: int, usuario: str, clave: str):  # noqa: ANN201 - conexión pymssql
    """Conecta a SQL Server read-only. La base de la sociedad se califica por consulta
    ([base].dbo.[tabla]), así que la conexión no fija database."""
    import pymssql  # import perezoso: solo si se usa la fuente SQL Server

    conn = pymssql.connect(
        server=host, port=str(puerto), user=usuario, password=clave,
        login_timeout=20, timeout=0, autocommit=True,
    )
    with conn.cursor() as cur:
        # Los filtros de la extracción citan columnas con comillas dobles (sintaxis portable).
        cur.execute("SET QUOTED_IDENTIFIER ON")
    log.info("mssql.conectado", host=host, puerto=puerto)
    return conn


def _columnas_nativas(conn, base: str, tabla: str) -> list[tuple[str, str]]:
    """(nombre, tipo) de todas las columnas de la tabla, en orden. Incluye UDFs (U_*)."""
    sql = (
        f"SELECT COLUMN_NAME, DATA_TYPE FROM [{base}].INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = %s AND TABLE_SCHEMA = 'dbo' ORDER BY ORDINAL_POSITION"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (tabla,))
        return [(r[0], r[1]) for r in cur.fetchall()]


def columnas_existentes(conn, esquema: str, tabla: str) -> set[str]:
    """Columnas reales de la tabla en ESTA base. Mismo contrato que sap_b1.columnas_existentes:
    la extracción intersecta lo configurado con lo que la sociedad de verdad tiene (los UDF
    varían por sociedad, y las instalaciones SQL Server suelen ser versiones SAP más viejas
    con menos columnas — la intersección absorbe ambos casos)."""
    return {c for c, _ in _columnas_nativas(conn, esquema, tabla)}


def _descripciones_udf(conn, base: str, tabla: str) -> dict[str, str]:
    """{ 'U_'+AliasID : Descr } de los campos de usuario definidos para la tabla (CUFD)."""
    sql = f"SELECT [AliasID], [Descr] FROM [{base}].dbo.[CUFD] WHERE [TableID] = %s"
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (tabla,))
            return {f"U_{r[0]}": (r[1] or "") for r in cur.fetchall()}
    except Exception as e:  # noqa: BLE001 - CUFD puede no ser accesible; se sigue sin UDF desc
        log.warning("cufd.no_accesible", tabla=tabla, error=str(e))
        return {}


def _perfilar_no_nulos(
    conn, base: str, tabla: str, columnas: list[tuple[str, str]], muestra: int = 100_000
) -> dict[str, bool]:
    """Cuenta no-nulos por columna sobre una muestra (TOP en vez de LIMIT)."""
    perfilables = [c for c, tipo in columnas if tipo.upper() not in TIPOS_LOB]
    if not perfilables:
        return {}
    lista = ", ".join(f"COUNT([{c}])" for c in perfilables)
    sql = f"SELECT {lista} FROM (SELECT TOP {int(muestra)} * FROM [{base}].dbo.[{tabla}]) t"
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            fila = cur.fetchone() or []
        return {col: (int(fila[i] or 0) > 0) for i, col in enumerate(perfilables)}
    except Exception as e:  # noqa: BLE001 - si el perfilado falla, no se bloquea el descubrimiento
        log.warning("perfilado.fallo", tabla=tabla, error=str(e))
        return {}


def extraer(conn, esquema: str, tabla: str, columnas: list[str], filtro: str | None = None) -> list[dict]:
    """Lee (read-only) las columnas indicadas, con filtro opcional. Mismo contrato que HANA:
    filas como dicts JSON-safe para bronce.<tabla>.datos (jsonb)."""
    if not columnas:
        return []
    cols = ", ".join(f"[{c}]" for c in columnas)
    sql = f"SELECT {cols} FROM [{esquema}].dbo.[{tabla}]"
    if filtro:
        sql += f" WHERE {filtro}"
    with conn.cursor() as cur:
        cur.execute(sql)
        nombres = [d[0] for d in cur.description]
        filas = [{n: _valor_json(v) for n, v in zip(nombres, fila)} for fila in cur.fetchall()]
    log.info("extraccion.leida", tabla=tabla, filas=len(filas), columnas=len(columnas))
    return filas


def introspectar(conn, esquema: str, tabla: str) -> list[CampoDescubierto]:
    """Descubre columnas: nativas + UDFs (con descripción de CUFD) + perfilado de datos."""
    columnas = _columnas_nativas(conn, esquema, tabla)
    if not columnas:
        raise ValueError(f"La tabla {esquema}.dbo.{tabla} no existe o no es accesible para el usuario.")
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
                tiene_datos=tiene.get(nombre),
            )
        )
    log.info("introspeccion.ok", tabla=tabla, columnas=len(resultado),
             udfs=sum(1 for c in resultado if c.es_udf))
    return resultado
