# Grupo Cresta — Objetos read-only requeridos en HANA (SAP B1)

Lo que necesito que expongas por **cada sociedad** (`SBOPROAVISA_`, `SBOLORETO_`, …) para arrancar
Fase 1. En un schema dedicado read-only (p.ej. `DW_READONLY`), con **al menos** las columnas
indicadas. La spec por campo está en `data-plane/mapeos/sap_b1/mapeo_ventas.yml` y `mapeo_maestros.yml`.

> Regla (CLAUDE.md §14): **solo lectura**. No tocar tablas base fuera de estos objetos aprobados.
> El `empresa_id` lo asigna la extracción según la BD de origen — no lo pongas en el objeto.

## Por qué table functions y no solo vistas

La ventana de datos (cuánto hacia atrás traer) se administra **desde el portal** por objeto
(`metadata.politica_ingesta`). Para que el filtro corra **en el origen** (menos I/O y transferencia),
los objetos con ventana se exponen como **table functions parametrizadas por fecha**: reciben
`p_fecha_desde` y devuelven solo lo necesario. El extractor calcula
`p_fecha_desde = hoy − lookback` (según la política) y la pasa. Los maestros y CxC no llevan ventana
de fecha (ver estrategia de cada uno) y pueden ser vistas simples.

HANA soporta esto con `CREATE FUNCTION … RETURNS TABLE (…) AS BEGIN RETURN SELECT … END;`
(table function). En Odoo/Postgres el equivalente es `CREATE FUNCTION … RETURNS TABLE (…)`.

## Objetos del primer corte (order-to-cash)

Cada objeto corresponde a una fila de `metadata.politica_ingesta` (columna `fuente_objeto`).

### Hechos con ventana móvil — table functions parametrizadas por fecha

| Objeto (política) | `fuente_objeto` | Origen SAP | Firma | Columnas mínimas | Filtro interno |
|-------------------|-----------------|-----------|-------|------------------|----------------|
| `ventas_facturas`      | `DW_READONLY.TF_FACTURAS(p_fecha_desde DATE)`  | `OINV`+`INV1` | recibe `p_fecha_desde` | DocEntry, DocNum, CardCode, SlpCode, DocDate, DocDueDate, DocCur, DocTotal, PaidToDate, DocStatus, CANCELED, **LineNum, ItemCode, Quantity, Price, LineTotal, WhsCode, OcrCode, AcctCode** | `DocDate >= p_fecha_desde` |
| `ventas_notas_credito` | `DW_READONLY.TF_NOTASCRED(p_fecha_desde DATE)` | `ORIN`+`RIN1` | recibe `p_fecha_desde` | (mismas que TF_FACTURAS) | `DocDate >= p_fecha_desde` |

> El grano del hecho es la **línea** (§8): las funciones devuelven cabecera **unida a sus líneas**
> (una fila por línea). Si prefieres exponer cabecera y líneas por separado, dímelo y ajusto el
> mapeo a dos objetos (`*_cab` / `*_lin`) con la misma ventana.

### CxC / Aging — todos los documentos abiertos (sin ventana)

| Objeto (política) | `fuente_objeto` | Origen SAP | Firma | Columnas mínimas | Filtro interno |
|-------------------|-----------------|-----------|-------|------------------|----------------|
| `cxc` | `DW_READONLY.TF_CXC()` (o vista `V_DW_CXC`) | `OINV`+`ORIN` | sin parámetro | DocEntry, DocNum, CardCode, DocDate, DocDueDate, DocCur, DocTotal, PaidToDate, DocStatus | `DocStatus = 'O'` |

> **Importante:** CxC trae **todos los abiertos sin filtro de fecha**, para que una factura antigua
> aún pendiente siga pesando en el Saldo CxC y el Aging. Es un conjunto acotado (solo lo abierto).

### Maestros — vistas simples

La estrategia (reemplazo total vs versionado) se resuelve **aguas abajo** (dbt), no en el origen; el
origen solo entrega el catálogo completo actual.

| Objeto (política) | `fuente_objeto` | Origen SAP | Columnas mínimas | Filtro | Estrategia |
|-------------------|-----------------|-----------|------------------|--------|-----------|
| `clientes`      | `DW_READONLY.V_DW_CLIENTES`     | `OCRD` | CardCode, CardName, LicTradNum, (región), validFor | `CardType='C'` | **versionado** (nombre/región) |
| `items`         | `DW_READONLY.V_DW_ITEMS`        | `OITM` | ItemCode, ItemName, ItmsGrpCod, SalUnitMsr, validFor | — | full_replace |
| `vendedores`    | `DW_READONLY.V_DW_VENDEDORES`   | `OSLP` | SlpCode, SlpName, Active | — | full_replace |
| `centros_costo` | `DW_READONLY.V_DW_CENTROSCOSTO` | `OOCR` | OcrCode, OcrName | — | full_replace |
| `cuentas`       | `DW_READONLY.V_DW_CUENTAS`      | `OACT` | AcctCode, AcctName, GroupMask | — | full_replace |

> **`clientes` es versionado (SCD2):** un cambio en `nombre` o `region` abre una nueva versión con su
> rango de vigencia; los hechos toman el valor vigente a la fecha del documento. Cambios en otras
> columnas no generan versión. Las columnas que disparan versión se administran en el portal
> (`politica_ingesta.columnas_versionado`), así que la **vista debe exponerlas siempre**; el versionado
> lo calcula dbt, no el origen.

## Notas

- Si algún campo (p.ej. región del cliente) es un UDF (`U_*`) o vive en otra tabla, indícamelo y
  ajusto el mapeo.
- **Ventana por defecto:** 12 meses para los hechos (configurable por objeto en el portal). Se pasa a
  las table functions como `p_fecha_desde`.

## Qué falta de tu lado

1. Usuario HANA **read-only** dedicado (`HANA_USER`/`HANA_PASSWORD` van a mi `.env`, no al repo).
2. Estos objetos creados en `SBOPROAVISA_` y `SBOLORETO_` (piloto): 2 table functions de hechos,
   1 de CxC (o vista) y 5 vistas de maestros.
3. Confirmar el schema donde los expones (`DW_READONLY` u otro).

Con eso implemento el extractor Python (Bronze) y el pipeline dbt ya probado toma el relevo. La
ventana, la estrategia y el horario ya se administran desde el portal (módulo Ingesta).
