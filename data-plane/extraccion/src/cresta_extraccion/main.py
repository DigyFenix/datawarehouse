"""Orquestador CLI de extracción. ESQUELETO — la lógica real llega en Fase 1.

Uso previsto:
    python -m cresta_extraccion.main --empresas proavisa,loreto --dominio ventas
"""

from __future__ import annotations

import argparse

import structlog

log = structlog.get_logger()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extracción read-only ERP -> Bronze")
    p.add_argument("--empresas", required=True, help="empresa_id separadas por coma (p.ej. proavisa,loreto)")
    p.add_argument("--dominio", required=True, choices=["ventas", "tesoreria", "datos_maestros"])
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    empresas = [e.strip() for e in args.empresas.split(",") if e.strip()]
    log.info("extraccion.inicio", empresas=empresas, dominio=args.dominio)
    # Fase 1: instanciar FuenteSapB1 + DestinoBronze y ejecutar el ELT read-only.
    raise NotImplementedError("Orquestación de extracción: implementar en Fase 1")


if __name__ == "__main__":
    raise SystemExit(main())
