"""Orquestador de extracción read-only ERP → Bronce.

Para una sociedad + entidad: resuelve la conexión y el tenant, lee la política y los campos
INCLUIDOS, extrae read-only del origen y aterriza en `bronce.<tabla>` de la base de datos de
la organización. No escribe en el ERP ni consulta más de lo incluido (§14).

Soporta dos motores de origen:
  - `hana`    → SAP Business One (una base por sociedad; empresa_id viene de la CONEXIÓN)
  - `postgres`→ Odoo (una base, varias compañías; empresa_id se filtra por COLUMNA)
"""

from __future__ import annotations

from datetime import date, timedelta

import structlog

from .catalogo import (
    ConfigPostgres,
    campos_incluidos,
    filtros_de_objeto,
    politica_de_objeto,
    resolver_origen,
    tablas_de_objeto,
)
from .config import credenciales_origen
from .destino_bronze import escribir
from .fuentes import odoo_postgres, sap_b1

log = structlog.get_logger()

MOTORES = {"hana", "postgres"}

# Tamaño del lote al encadenar la tabla hija por la clave del padre. Evita un IN
# con decenas de miles de literales, que algunos motores rechazan o resuelven mal.
_LOTE_CLAVES = 900


def _fecha_desde(valor: int, unidad: str) -> str:
    hoy = date.today()
    if unidad == "dias":
        return (hoy - timedelta(days=valor)).isoformat()
    # meses (resta de meses sin dependencias externas)
    total = hoy.year * 12 + (hoy.month - 1) - valor
    y, m = divmod(total, 12)
    dia = min(hoy.day, 28)
    return date(y, m + 1, dia).isoformat()


def _literal(valor: str) -> str:
    """Cita un valor para el WHERE. Los numéricos van sin comillas; el resto escapado."""
    v = (valor or "").strip()
    try:
        float(v)
        return v
    except ValueError:
        return "'" + v.replace("'", "''") + "'"


def _clausulas_filtro(filtros: list[tuple[str, str, str, str]], tabla: str) -> list[str]:
    """Filtros duros del paquete base para una tabla, empujados al ORIGEN."""
    permitidos = {"=", "<>", "!=", ">", ">=", "<", "<=", "in", "not in", "like", "is", "is not"}
    clausulas: list[str] = []
    for t, campo, op, valor in filtros:
        if t.lower() != tabla.lower():
            continue
        operador = (op or "").strip().lower()
        if operador not in permitidos:
            log.warning("filtro.operador_no_permitido", tabla=tabla, campo=campo, op=op)
            continue
        if operador in ("in", "not in"):
            partes = [_literal(x) for x in valor.split(",") if x.strip()]
            if not partes:
                continue
            clausulas.append(f'"{campo}" {operador.upper()} ({", ".join(partes)})')
        elif operador in ("is", "is not"):
            # solo NULL / NOT NULL tienen sentido aquí
            if valor.strip().lower() not in ("null",):
                continue
            clausulas.append(f'"{campo}" {operador.upper()} NULL')
        else:
            clausulas.append(f'"{campo}" {operador.upper()} {_literal(valor)}')
    return clausulas


def extraer_objeto(
    cfg: ConfigPostgres,
    empresa_id: str,
    objeto: str,
    desde: str | None = None,
    hasta: str | None = None,
) -> dict:
    """Extrae la entidad `objeto` de la sociedad `empresa_id` a Bronce del tenant.

    `desde`/`hasta` (ISO yyyy-mm-dd) sobreescriben la ventana de la política. Se usan para
    cargas de modelado acotadas y reproducibles (p.ej. un mes concreto para cuadrar contra
    los reportes del ERP). Si no se pasan, la ventana sale del `lookback` de la política.
    """
    origen = resolver_origen(cfg, empresa_id)
    if origen.motor not in MOTORES:
        raise NotImplementedError(
            f"Extracción para motor '{origen.motor}' no implementada (soportados: {sorted(MOTORES)})."
        )
    if not origen.esquema_origen:
        raise ValueError(f"La sociedad '{empresa_id}' no tiene esquema de origen configurado.")

    politica = politica_de_objeto(cfg, origen.organizacion_id, objeto)
    if not politica:
        raise ValueError(f"'{objeto}' no tiene política de ingesta.")
    tablas = tablas_de_objeto(cfg, origen.organizacion_id, objeto)
    incluidos = campos_incluidos(cfg, origen.organizacion_id, objeto)
    if not incluidos:
        raise ValueError(f"'{objeto}' no tiene columnas incluidas. Márcalas en Campos primero.")
    filtros = filtros_de_objeto(cfg, origen.organizacion_id, objeto)

    estrategia = politica["estrategia"]
    campo_fecha = politica["campo_fecha"]
    fecha_desde = desde
    fecha_hasta = hasta
    if estrategia == "incremental_ventana" and campo_fecha and not fecha_desde:
        if politica["lookback_valor"]:
            fecha_desde = _fecha_desde(
                politica["lookback_valor"], politica["lookback_unidad"] or "meses"
            )

    usuario, clave_acceso = credenciales_origen(origen.secreto_ref)
    if origen.motor == "hana":
        fuente = sap_b1
        conn = sap_b1.conectar(origen.host, origen.puerto, usuario, clave_acceso)
    else:
        fuente = odoo_postgres
        conn = odoo_postgres.conectar(
            origen.host, origen.puerto, usuario, clave_acceso, origen.base_datos_origen
        )

    dsn_destino = cfg.dsn(origen.base_datos_dw)
    # La clave de encadenamiento puede llamarse distinto en el padre y en la hija:
    #   SAP B1 : DocEntry → DocEntry            (misma columna)
    #   Odoo   : account_move.id → account_move_line.move_id
    # Formato de la política: "campo" o "campo_padre>campo_hija".
    _clave = (politica.get("clave_natural") or "").strip()
    if ">" in _clave:
        clave_padre, clave_hija = (x.strip() for x in _clave.split(">", 1))
    else:
        clave_padre = clave_hija = _clave
    del clave_acceso  # la credencial ya se usó: fuera del alcance del resto
    try:
        total = 0
        detalle: dict[str, int] = {}
        claves_padre: list | None = None

        for indice, tabla in enumerate(tablas):
            cols = [campo for (t, campo) in incluidos if t.lower() == tabla.lower()]
            if not cols:
                continue

            es_padre = indice == 0
            clausulas = _clausulas_filtro(filtros, tabla)

            if es_padre:
                # Escotilla del paquete base: condición que no se expresa como campo/valor
                # (p.ej. la cartera de SAP B1: "BalDueDeb" <> "BalDueCred").
                if politica.get("filtro_origen"):
                    clausulas.append(f'({politica["filtro_origen"]})')
                if estrategia == "incremental_ventana" and campo_fecha and fecha_desde:
                    clausulas.append(f'"{campo_fecha}" >= {_literal(fecha_desde)}')
                    if fecha_hasta:
                        clausulas.append(f'"{campo_fecha}" < {_literal(fecha_hasta)}')
                elif estrategia == "abiertos" and origen.motor == "hana" and campo_fecha is None:
                    pass  # la apertura la define filtro_origen (saldo del mayor)

                filtro = " AND ".join(clausulas) if clausulas else None
                filas = fuente.extraer(conn, origen.esquema_origen, tabla, cols, filtro)
                if clave_padre:
                    vistas = {f.get(clave_padre) for f in filas if f.get(clave_padre) is not None}
                    claves_padre = sorted(vistas)
            else:
                # Tabla hija (líneas del documento / cabecera del asiento): NO lleva el campo
                # de fecha, así que se encadena por la clave del padre. Sin esto, filtrar por
                # "DocDate" contra INV1 falla (la columna no existe ahí) y quitar el filtro
                # traería las 254,246 líneas históricas en vez de las del período.
                if not clave_padre:
                    raise ValueError(
                        f"'{objeto}' tiene varias tablas pero la política no define "
                        "clave_natural: no puedo encadenar la tabla hija con la principal."
                    )
                filas = []
                if claves_padre:
                    base = list(clausulas)
                    for i in range(0, len(claves_padre), _LOTE_CLAVES):
                        lote = claves_padre[i:i + _LOTE_CLAVES]
                        literales = ", ".join(_literal(str(k)) for k in lote)
                        filtro = " AND ".join(base + [f'"{clave_hija}" IN ({literales})'])
                        filas.extend(
                            fuente.extraer(conn, origen.esquema_origen, tabla, cols, filtro)
                        )

            n = escribir(
                dsn_destino, tabla, empresa_id, f"{origen.esquema_origen}.{tabla}", filas,
                # La hija se reemplaza completa por empresa: su recorte lo define el padre.
                estrategia if es_padre else "full_replace",
                campo_fecha if es_padre else None,
                fecha_desde if es_padre else None,
                fecha_hasta if es_padre else None,
            )
            total += n
            detalle[tabla] = n
    finally:
        conn.close()

    resumen = {
        "objeto": objeto,
        "empresa_id": empresa_id,
        "organizacion": origen.organizacion_codigo,
        "base_datos_dw": origen.base_datos_dw,
        "motor": origen.motor,
        "estrategia": estrategia,
        "tablas": detalle,
        "filas": total,
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
    }
    log.info("extraer.ok", **resumen)
    return resumen
