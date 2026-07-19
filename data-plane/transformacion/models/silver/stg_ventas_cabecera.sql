-- Staging ventas (cabecera): mapea SAP B1 OINV (factura) + ORIN (nota de crédito) al canónico.
-- Aquí ocurre la traducción de nombres SAP -> canónico (costura agnóstica, CLAUDE.md §6).
-- El signo del total se ajusta por tipo de documento (factura +, nota de crédito -).
{{ config(materialized='view') }}

with facturas as (
    select
        empresa_id,
        'factura'                as tipo_documento,
        cast(docentry as text)   as documento_codigo,
        cast(docnum as text)     as documento_numero,
        cardcode                 as socio_negocio_codigo,
        cast(slpcode as text)    as vendedor_codigo,
        docdate                  as fecha_documento,
        docduedate               as fecha_vencimiento,
        doccur                   as moneda,
        doctotal                 as total_bruto,
        paidtodate               as saldo_pagado,
        docstatus                as estado_documento,
        canceled                 as cancelado
    from {{ ref('bronze_oinv') }}
),
notas as (
    select
        empresa_id,
        'nota_credito'           as tipo_documento,
        cast(docentry as text)   as documento_codigo,
        cast(docnum as text)     as documento_numero,
        cardcode                 as socio_negocio_codigo,
        cast(slpcode as text)    as vendedor_codigo,
        docdate                  as fecha_documento,
        docduedate               as fecha_vencimiento,
        doccur                   as moneda,
        doctotal                 as total_bruto,
        paidtodate               as saldo_pagado,
        docstatus                as estado_documento,
        canceled                 as cancelado
    from {{ ref('bronze_orin') }}
)
select
    *,
    case when tipo_documento = 'nota_credito' then -1 else 1 end as signo,
    (case when tipo_documento = 'nota_credito' then -1 else 1 end) * total_bruto as total_documento
from (
    select * from facturas
    union all
    select * from notas
) u
