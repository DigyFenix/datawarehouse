{#
  Bodega. Reemplaza el nivel "sucursal" del canónico v1: ninguna sociedad de Cresta usa
  sucursales (BPLId NULL en las 161,439 facturas) pero el almacén está en 97.5% de las líneas.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    datos->>'WhsCode'                                 as almacen_codigo,
    trim(datos->>'WhsName')                           as nombre,
    coalesce(datos->>'Inactive', 'N') = 'N'           as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'owhs') }}

{% else %}

select
    empresa_id,
    datos->>'id'                                      as almacen_codigo,
    coalesce(nullif(trim(datos->>'name'), ''), datos->>'code') as nombre,
    coalesce((datos->>'active')::boolean, true)        as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'stock_warehouse') }}

{% endif %}
