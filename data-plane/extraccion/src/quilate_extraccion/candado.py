"""Candado de carga: una sola extracción/transformación a la vez por servidor.

Sin él, la carga diaria del programador y un «Extraer» lanzado desde el portal pueden
coincidir: doble consulta al ERP del cliente y DELETE/INSERT cruzados en Bronce.
Es un advisory lock de sesión en la base de control: se libera solo si el proceso muere.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from .config import ConfigPostgres

# Clave fija: un servidor por cliente, así que basta un candado para todo el servidor.
_CLAVE = "quilate:carga"


class CargaEnCurso(RuntimeError):
    """Ya hay una extracción o transformación corriendo en este servidor."""


@contextmanager
def candado_carga(cfg: ConfigPostgres) -> Iterator[None]:
    """Toma el candado o falla de inmediato (no espera: quien llega segundo se entera y no
    apila corridas). @raises CargaEnCurso"""
    with psycopg.connect(cfg.dsn(), autocommit=True) as conn:
        tomado = conn.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (_CLAVE,)).fetchone()
        if not tomado or not tomado[0]:
            raise CargaEnCurso("Hay una carga en curso en este servidor; reintenta cuando termine.")
        try:
            yield
        finally:
            conn.execute("SELECT pg_advisory_unlock(hashtext(%s))", (_CLAVE,))
