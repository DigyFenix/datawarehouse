{#
  Dimensión OPCIONAL. Fuerte en SAP B1 (maestro propio); en Odoo el "vendedor" es el usuario
  responsable del documento y no hay maestro comercial, así que la tabla queda vacía y el
  hecho cruza contra el miembro default de Oro.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    datos->>'SlpCode'                                 as vendedor_codigo,
    trim(datos->>'SlpName')                           as nombre,
    coalesce(datos->>'Active', 'Y') = 'Y'             as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'oslp') }}

{% else %}

-- Odoo no tiene maestro de vendedores en el paquete base: el responsable sale de
-- account_move.invoice_user_id y se resuelve contra el miembro default.
select
    cast(null as text)    as empresa_id,
    cast(null as text)    as vendedor_codigo,
    cast(null as text)    as nombre,
    cast(null as boolean) as activo,
    cast(null as text)    as fuente_origen,
    cast(null as timestamptz) as extraido_en,
    '{{ this.name }}'::text as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text as version_proceso
where false

{% endif %}
