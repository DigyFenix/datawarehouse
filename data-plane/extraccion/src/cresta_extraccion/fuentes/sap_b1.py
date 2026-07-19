"""Fuente SAP Business One / HANA (read-only). ESQUELETO — se implementa en Fase 1.

Regla dura (CLAUDE.md §14): solo lectura vía la vía aprobada (vistas read-only dedicadas en
HANA, a confirmar en Fase 1). Nunca escribir en el ERP ni tocar tablas base fuera de esa vía.
"""

from __future__ import annotations

from ..config import ConfigHana
from .base import LoteBronze


class FuenteSapB1:
    """Extrae objetos de una BD HANA de SAP B1 (una por sociedad).

    En Fase 1 se implementa la lectura de los objetos del corte order-to-cash
    (facturas/NC, CxC, maestros) a través de la vía read-only aprobada.
    """

    def __init__(self, config: ConfigHana) -> None:
        self._config = config

    def probar_conexion(self) -> bool:  # noqa: D102 - Fase 1
        raise NotImplementedError("Conexión HANA read-only: implementar en Fase 1")

    def extraer(self, empresa_id: str, objeto: str) -> LoteBronze:  # noqa: D102 - Fase 1
        raise NotImplementedError("Extracción SAP B1: implementar en Fase 1")
