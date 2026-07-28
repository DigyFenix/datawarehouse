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

## Uso

### Descubrir campos (introspección) — implementado
Introspecta el origen de una sociedad (columnas nativas de `SYS.TABLE_COLUMNS` + UDFs de `CUFD` +
perfilado de no-nulos) y llena `metadata.campo_ingesta`. Resuelve host/puerto/esquema desde el
metadata-store (conexiones + sociedades) y las credenciales desde el `.env` (`<REF>_USER`/`_PASSWORD`).

```bash
python -m venv .venv && ./.venv/Scripts/python -m pip install hdbcli "psycopg[binary]" pydantic pydantic-settings structlog
# .env cargado; POSTGRES_HOST=localhost si se corre desde el host (fuera de Docker)
PYTHONPATH=src python -m cresta_extraccion.main descubrir --sociedad proavisa --objeto clientes --tabla OCRD
```
- `--tabla` es opcional: si se omite, se toman las tablas de la política del objeto (`fuente_objeto`).
- No pisa la decisión del usuario (`incluido`); solo enriquece metadatos y `tiene_datos`.

### Extraer a Bronze — Fase siguiente
```bash
python -m cresta_extraccion.main extraer --empresas proavisa,loreto --dominio ventas   # (pendiente)
```
