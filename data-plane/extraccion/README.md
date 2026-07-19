# extraccion — ELT read-only ERP → Bronze

Extractores **read-only** que aterrizan datos crudos del ERP en el esquema `bronze` de Postgres,
etiquetando cada fila con `empresa_id`. **Motor agnóstico**; lo específico de SAP B1 vive en
`fuentes/sap_b1.py`. Odoo se añade como otra fuente sin tocar el resto.

## Principios (CLAUDE.md §6, §11, §14)

- **Nunca** escribe en el ERP ni consulta tablas base fuera de la vía aprobada (vistas read-only
  dedicadas en HANA — a confirmar por fuente en Fase 1).
- Config y credenciales **solo** desde `.env` (`pydantic-settings`), nunca hardcodeadas ni en logs.
- Multi-empresa: itera sobre los schemas HANA de las sociedades configuradas; cada fila queda
  con su `empresa_id`. Piloto Fase 1: `proavisa` + `loreto`.

## Estado

**Fase 0 = esqueleto** (config + contratos + conectores base, sin lógica de extracción real).
La extracción de objetos SAP B1 (`OINV/INV1/ORCT/OCRD/OITM/...`) se implementa en **Fase 1**.

## Estructura

```
src/cresta_extraccion/
  config.py         # settings desde .env (pydantic-settings)
  destino_bronze.py # escritor a Postgres/bronze
  fuentes/
    base.py         # interfaz de fuente (contrato agnóstico)
    sap_b1.py       # fuente SAP B1 / HANA (esqueleto; se llena en Fase 1)
  main.py           # orquestador CLI (esqueleto)
```

## Uso (cuando esté implementado)

```bash
pip install -e ".[dev]"
python -m cresta_extraccion.main --empresas proavisa,loreto --dominio ventas
```
