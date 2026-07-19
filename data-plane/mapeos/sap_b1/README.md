# Mapeo SAP Business One → canónico

Traduce los objetos de **SAP Business One** a las entidades del modelo canónico
(`../../canonico/`). Es la implementación del contrato para el ERP SAP B1. Bronze contiene los
objetos SAP crudos; Silver aplica **este** mapeo para producir el canónico agnóstico
(`CLAUDE.md` §6: Silver = costura agnóstica).

> **Objetos SAP son canónicos del ERP:** no se renombran `OINV`, `INV1`, etc. (`CLAUDE.md` §13).
> El nombre físico SAP nunca se expone al agente; vive solo aquí y en Bronze.

## Alcance (primer corte order-to-cash)

| Entidad canónica | Objeto(s) SAP B1 | Nota |
|------------------|------------------|------|
| `documento_venta` (factura) | `OINV` (cabecera) | Facturas de deudores |
| `linea_documento_venta` (factura) | `INV1` (líneas) | |
| `documento_venta` (nota de crédito) | `ORIN` (cabecera) | NC de deudores → signo negativo |
| `linea_documento_venta` (nota de crédito) | `RIN1` (líneas) | |
| `documento_cobro` (CxC) | `OINV` abiertas (`DocStatus='O'`) | Saldo = `DocTotal - PaidToDate`; aging por `DocDueDate` |
| `socio_negocio` | `OCRD` | Solo clientes (`CardType='C'`) |
| `item` | `OITM` | |
| `vendedor` | `OSLP` | |
| `organizacion` (empresa→sucursal) | por `empresa_id` + `INV1.WhsCode`/sucursal | Sucursal a nivel línea |
| `centro_costo` | `OINV`/`INV1.OcrCode` + `OOCR` | Dim a nivel línea |
| `cuenta` | `INV1.AcctCode` + `OACT` | Dim a nivel línea |
| `tiempo` | derivado de fechas | Calendario generado en dbt |

## Detalle por entidad

Ver los archivos `mapeo_*.yml` de esta carpeta. Cada uno lista, por campo canónico, el objeto y
columna SAP de origen y la transformación. **Esta es la especificación de las vistas read-only
que deben exponerse desde HANA** (una vista por objeto, con al menos estas columnas).

## Convenciones de transformación

- **empresa_id:** no viene de SAP; lo asigna la extracción según la BD HANA de origen
  (ver `organizaciones/grupocresta/config/empresas.md`). Toda fila Bronze/Silver lo lleva.
- **Signo del monto:** facturas (`OINV/INV1`) positivo; notas de crédito (`ORIN/RIN1`) negativo.
  Se valida en calidad (`CLAUDE.md` §10).
- **Documentos cancelados:** `OINV.CANCELED = 'Y'` se excluyen de ventas activas.
- **CxC (saldo abierto):** `OINV` con `DocStatus = 'O'`; `saldo_pendiente = DocTotal - PaidToDate`.
- **Tipos:** montos `numeric(18,4)`; fechas SAP (`DocDate`, `DocDueDate`) → `date`.
