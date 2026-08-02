{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}
{%- set moneda_local = var('moneda_local', 'GTQ') -%}
{#- SAP B1 Guatemala usa 'QTZ' como código del quetzal (no el ISO 'GTQ'). Ambos son la misma
    moneda local: sin el alias, es_local quedaba false para TODAS las monedas del tenant y
    cualquier medida "solo moneda local" devolvía vacío. La lista es configurable por si otro
    tenant trae su propio código no-ISO. -#}
{%- set codigos_local = var('codigos_moneda_local',
        ['GTQ', 'QTZ'] if moneda_local == 'GTQ' else [moneda_local]) -%}
{%- set lista_local = "'" ~ codigos_local | join("', '") ~ "'" -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    trim(datos->>'CurrCode')                          as moneda_codigo,
    trim(datos->>'CurrName')                          as nombre,
    trim(datos->>'CurrCode') in ({{ lista_local }})    as es_local,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'ocrn') }}

{% else %}

select
    empresa_id,
    trim(datos->>'name')                              as moneda_codigo,
    trim(datos->>'name')                              as nombre,
    trim(datos->>'name') in ({{ lista_local }})        as es_local,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'res_currency') }}

{% endif %}
