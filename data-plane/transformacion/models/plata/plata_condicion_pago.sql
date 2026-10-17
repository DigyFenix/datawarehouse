{#
  CONDICIÓN DE PAGO — dimensión opcional. Responde "¿se vendió a crédito o de contado?"
  (el "sector" de los tableros comerciales). En Odoo es account_payment_term, referenciada
  por el documento (invoice_payment_term_id). En SAP B1 el maestro es OCTG, que el paquete
  base no extrae: la tabla queda vacía y el hecho cruza contra No definido.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    cast(null as text)    as empresa_id,
    cast(null as text)    as condicion_pago_codigo,
    cast(null as text)    as nombre,
    cast(null as boolean) as activo,
    cast(null as text)    as fuente_origen,
    cast(null as timestamptz) as extraido_en,
    '{{ this.name }}'::text as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text as version_proceso
where false

{% else %}

select
    empresa_id,
    datos->>'id'                                      as condicion_pago_codigo,
    coalesce({{ odoo_texto('datos', 'name') }}, 'Condición ' || (datos->>'id')) as nombre,
    coalesce((datos->>'active')::boolean, true)        as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'account_payment_term') }}

{% endif %}
