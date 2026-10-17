{#
  CONDICIÓN DE PAGO del documento (crédito / contado / N días): el "sector" de los tableros
  comerciales. account_payment_term en Odoo; en SAP B1 (OCTG) no se extrae aún → No definido.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as condicion_pago_clave,
    d.empresa_id,
    d.condicion_pago_codigo,
    d.nombre,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_condicion_pago') }} d
join {{ ref('llave_condicion_pago') }} k
     on k.empresa_id = d.empresa_id and k.condicion_pago_codigo = d.condicion_pago_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    true,
    {{ columnas_vigencia() }}
