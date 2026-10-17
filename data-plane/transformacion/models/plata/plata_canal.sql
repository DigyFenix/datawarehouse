{#
  CANAL COMERCIAL — dimensión opcional. En Odoo es el equipo de ventas (crm_team) que lleva
  el documento (account_move.team_id); en SAP B1 no hay un maestro equivalente en el paquete
  base, así que la tabla queda vacía y el hecho cruza contra el miembro No definido.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    cast(null as text)    as empresa_id,
    cast(null as text)    as canal_codigo,
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
    datos->>'id'                                      as canal_codigo,
    coalesce({{ odoo_texto('datos', 'name') }}, 'Equipo ' || (datos->>'id')) as nombre,
    coalesce((datos->>'active')::boolean, true)        as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'crm_team') }}

{% endif %}
