{#
  Uso OPUESTO entre los dos clientes, y por eso el miembro default de Oro es obligatorio:
    Proavisa (SAP B1)  : centro de costo en 253,752 de 254,246 líneas (99.8%)
    Iron Network (Odoo): 1 línea de 2,923
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    datos->>'PrcCode'                                 as centro_costo_codigo,
    trim(datos->>'PrcName')                           as nombre,
    coalesce(datos->>'Locked', 'N') = 'N'             as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'oprc') }}

{% else %}

select
    empresa_id,
    datos->>'id'                                      as centro_costo_codigo,
    trim(datos->>'name')                              as nombre,
    coalesce((datos->>'active')::boolean, true)        as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'account_analytic_account') }}

{% endif %}
