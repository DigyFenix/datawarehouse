# Grupo Cresta — Vistas read-only requeridas en HANA (SAP B1)

Lo que necesito que expongas por **cada sociedad** (`SBOPROAVISA_`, `SBOLORETO_`, …) para arrancar
Fase 1. Una **vista read-only** por objeto, en un schema dedicado (p.ej. `DW_READONLY`), con **al
menos** las columnas indicadas. La spec por campo está en
`data-plane/mapeos/sap_b1/mapeo_ventas.yml` y `mapeo_maestros.yml`.

> Regla (CLAUDE.md §14): solo lectura. No tocar tablas base fuera de estas vistas aprobadas.
> El `empresa_id` lo asigna la extracción según la BD de origen — no lo pongas en la vista.

## Vistas del primer corte (order-to-cash)

| Vista sugerida | Objeto SAP | Columnas mínimas | Filtro sugerido |
|----------------|-----------|------------------|-----------------|
| `V_DW_FACTURAS`      | `OINV` | DocEntry, DocNum, CardCode, SlpCode, DocDate, DocDueDate, DocCur, DocTotal, PaidToDate, DocStatus, CANCELED | — |
| `V_DW_FACTURAS_LIN`  | `INV1` | DocEntry, LineNum, ItemCode, Quantity, Price, LineTotal, WhsCode, OcrCode, AcctCode | — |
| `V_DW_NOTASCRED`     | `ORIN` | (mismas que OINV) | — |
| `V_DW_NOTASCRED_LIN` | `RIN1` | (mismas que INV1) | — |
| `V_DW_CLIENTES`      | `OCRD` | CardCode, CardName, LicTradNum, (región), validFor | `CardType='C'` |
| `V_DW_ITEMS`         | `OITM` | ItemCode, ItemName, ItmsGrpCod, SalUnitMsr, validFor | — |
| `V_DW_VENDEDORES`    | `OSLP` | SlpCode, SlpName, Active | — |
| `V_DW_CENTROSCOSTO`  | `OOCR` | OcrCode, OcrName | — |
| `V_DW_CUENTAS`       | `OACT` | AcctCode, AcctName, GroupMask | — |

Notas:
- **CxC / saldo por cobrar** se deriva de `V_DW_FACTURAS` con `DocStatus='O'`
  (saldo = `DocTotal - PaidToDate`, vencimiento = `DocDueDate`); no requiere vista aparte.
- Si algún campo (p.ej. región del cliente) es un UDF (`U_*`) o vive en otra tabla, indícamelo y
  ajusto el mapeo.
- **Ventana de datos:** para el piloto basta con el último ejercicio o los últimos N meses; dímelo
  y lo parametrizo en la extracción.

## Qué falta de tu lado

1. Usuario HANA **read-only** dedicado (`HANA_USER`/`HANA_PASSWORD` van a mi `.env`, no al repo).
2. Estas vistas creadas en `SBOPROAVISA_` y `SBOLORETO_` (piloto).
3. Confirmar el schema donde las expones.

Con eso implemento el extractor Python (Bronze) y el pipeline dbt ya probado toma el relevo.
