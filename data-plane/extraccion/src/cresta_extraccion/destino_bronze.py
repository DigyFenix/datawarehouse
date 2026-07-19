"""Escritor a la capa Bronze (Postgres). ESQUELETO — se implementa en Fase 1.

Aterriza lotes crudos en `bronze`, preservando trazabilidad (source_origen, extraido_en).
"""

from __future__ import annotations

from .config import ConfigPostgres
from .fuentes.base import LoteBronze


class DestinoBronze:
    def __init__(self, config: ConfigPostgres) -> None:
        self._config = config

    def escribir(self, lote: LoteBronze) -> int:  # noqa: D102 - Fase 1
        """Inserta el lote en bronze.<objeto> con columnas de trazabilidad. Devuelve filas escritas."""
        raise NotImplementedError("Escritura a Bronze: implementar en Fase 1")
