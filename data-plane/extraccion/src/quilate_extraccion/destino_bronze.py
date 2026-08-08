"""Escritor a la capa Bronce (Postgres). Aterriza lotes crudos con trazabilidad.

Bronce es dinámico (los campos incluidos los elige el paquete base o el usuario): cada fila
guarda su payload crudo en una columna `datos` jsonb, más columnas de trazabilidad (§12).
Plata mapea de ahí al canónico. La estrategia decide qué se reemplaza al recargar (idempotencia).

AISLAMIENTO POR TENANT: se escribe en la base de datos de la organización (`dw_<codigo>`),
nunca en la base del plano de control. Ver migración 100.
"""

from __future__ import annotations

import psycopg
import structlog
from psycopg.types.json import Json

log = structlog.get_logger()


def _asegurar_tabla(cur, tabla: str) -> None:
    cur.execute(
        f'CREATE TABLE IF NOT EXISTS bronce."{tabla}" ('
        "  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,"
        "  empresa_id text NOT NULL,"
        "  fuente_origen text NOT NULL,"
        "  extraido_en timestamptz NOT NULL DEFAULT now(),"
        "  datos jsonb NOT NULL)"
    )
    cur.execute(f'CREATE INDEX IF NOT EXISTS ix_{tabla}_empresa ON bronce."{tabla}" (empresa_id)')


def escribir(
    dsn_destino: str,
    tabla_origen: str,
    empresa_id: str,
    fuente_origen: str,
    filas: list[dict],
    estrategia: str,
    campo_fecha: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
) -> int:
    """Aterriza el lote en bronce.<tabla> de la base del tenant, con trazabilidad.

    Idempotencia según estrategia:
      - full_replace / versionado / abiertos : borra todo lo de la empresa y reinserta.
      - incremental_ventana                  : borra solo la ventana y reinserta.

    Devuelve filas escritas.
    """
    tabla = tabla_origen.lower()
    with psycopg.connect(dsn_destino) as conn:
        with conn.cursor() as cur:
            _asegurar_tabla(cur, tabla)
            if estrategia == "incremental_ventana" and campo_fecha and fecha_desde:
                # Borra exactamente la misma ventana que se va a reinsertar (recarga limpia).
                if fecha_hasta:
                    cur.execute(
                        f'DELETE FROM bronce."{tabla}" WHERE empresa_id = %s '
                        "AND (datos->>%s) >= %s AND (datos->>%s) < %s",
                        (empresa_id, campo_fecha, fecha_desde, campo_fecha, fecha_hasta),
                    )
                else:
                    cur.execute(
                        f'DELETE FROM bronce."{tabla}" WHERE empresa_id = %s '
                        "AND (datos->>%s) >= %s",
                        (empresa_id, campo_fecha, fecha_desde),
                    )
            else:
                # maestros (full/versionado) y cartera (abiertos): snapshot completo por empresa
                cur.execute(f'DELETE FROM bronce."{tabla}" WHERE empresa_id = %s', (empresa_id,))

            if filas:
                cur.executemany(
                    f'INSERT INTO bronce."{tabla}" (empresa_id, fuente_origen, datos) '
                    "VALUES (%s, %s, %s)",
                    [(empresa_id, fuente_origen, Json(f)) for f in filas],
                )
        conn.commit()
    log.info(
        "bronce.escrito", tabla=tabla, empresa_id=empresa_id, filas=len(filas),
        estrategia=estrategia,
    )
    return len(filas)
