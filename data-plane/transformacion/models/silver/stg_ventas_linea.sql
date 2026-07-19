-- Staging ventas (línea): mapea SAP B1 INV1 (factura) + RIN1 (nota de crédito) al canónico.
-- Grano = línea de documento (CLAUDE.md §8). Signo del monto según tipo de documento.
{{ config(materialized='view') }}

with lineas_factura as (
    select 'factura' as tipo_documento, empresa_id, cast(docentry as text) as documento_codigo,
           linenum as linea_numero, itemcode as item_codigo, quantity as cantidad,
           price as precio_unitario, linetotal as monto_bruto,
           whscode as sucursal_codigo, ocrcode as centro_costo_codigo, cast(acctcode as text) as cuenta_codigo
    from {{ ref('bronze_inv1') }}
),
lineas_nota as (
    select 'nota_credito' as tipo_documento, empresa_id, cast(docentry as text) as documento_codigo,
           linenum as linea_numero, itemcode as item_codigo, quantity as cantidad,
           price as precio_unitario, linetotal as monto_bruto,
           whscode as sucursal_codigo, ocrcode as centro_costo_codigo, cast(acctcode as text) as cuenta_codigo
    from {{ ref('bronze_rin1') }}
)
select
    *,
    (case when tipo_documento = 'nota_credito' then -1 else 1 end) * monto_bruto as monto_linea
from (
    select * from lineas_factura
    union all
    select * from lineas_nota
) u
