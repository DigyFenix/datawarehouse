"""Contrato agnóstico de una fuente de extracción. Cambiar de ERP = nueva implementación aquí."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class LoteBronze:
    """Un lote crudo listo para aterrizar en bronce, etiquetado con su empresa."""

    empresa_id: str
    objeto: str  # nombre lógico del objeto de origen (p.ej. 'ventas_facturas')
    filas: list[dict[str, object]]
    source_origen: str  # ERP/schema/tabla de origen (trazabilidad, §12)


class FuenteERP(Protocol):
    """Toda fuente ERP read-only implementa este contrato."""

    def probar_conexion(self) -> bool:
        """Verifica conectividad read-only. No modifica el origen."""
        ...

    def extraer(self, empresa_id: str, objeto: str) -> LoteBronze:
        """Extrae un objeto de una empresa. Solo lectura."""
        ...
