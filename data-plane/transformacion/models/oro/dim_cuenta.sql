{#
  `cuenta_codigo`         = llave de negocio interna del ERP (AcctCode en SAP B1, id en Odoo).
  `cuenta_codigo_visible` = el código que el CONTADOR reconoce (FormatCode en SAP B1,
                            code_store en Odoo 18). Es el que va en los reportes.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as cuenta_clave,
    d.empresa_id,
    d.cuenta_codigo,
    d.cuenta_codigo_visible,
    d.nombre,
    d.tipo_cuenta,
    d.es_cartera_cobrar,
    d.es_cartera_pagar,
    d.activa,
    {{ columnas_vigencia() }}
from {{ ref('plata_cuenta') }} d
join {{ ref('llave_cuenta') }} k
     on k.empresa_id = d.empresa_id and k.cuenta_codigo = d.cuenta_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, null,
    {{ nombre_no_definido() }}, 'otro', false, false, true,
    {{ columnas_vigencia() }}
