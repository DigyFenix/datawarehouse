{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}
{%- set moneda_local = var('moneda_local', 'GTQ') -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    trim(datos->>'CurrCode')                          as moneda_codigo,
    trim(datos->>'CurrName')                          as nombre,
    trim(datos->>'CurrCode') = '{{ moneda_local }}'    as es_local,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'ocrn') }}

{% else %}

select
    empresa_id,
    trim(datos->>'name')                              as moneda_codigo,
    trim(datos->>'name')                              as nombre,
    trim(datos->>'name') = '{{ moneda_local }}'        as es_local,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'res_currency') }}

{% endif %}
