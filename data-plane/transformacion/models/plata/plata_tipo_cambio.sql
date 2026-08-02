{#
  TIPOS DE CAMBIO — una tasa por (empresa, fecha, moneda), en la convención
  "moneda local por 1 unidad de la moneda extranjera" (la de SAP B1).

  INFORMATIVO/ANALÍTICO: los importes de los hechos NO se reconvierten con estas tasas
  (decisión C1 — el ERP ya convirtió cada documento con su tasa del día). Esta tabla sirve
  para consultar la tasa, graficar su evolución y hacer conversiones ad-hoc en análisis.

  Odoo guarda la tasa INVERSA (unidades de la moneda por 1 de la moneda de la compañía):
  se invierte aquí para que ambos ERPs signifiquen lo mismo.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    (nullif(datos->>'RateDate', ''))::date                    as fecha,
    trim(datos->>'Currency')                                  as moneda_codigo,
    (nullif(datos->>'Rate', ''))::numeric(18,6)               as tasa,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'ortt') }}
where coalesce((nullif(datos->>'Rate',''))::numeric, 0) <> 0

{% else %}

select
    r.empresa_id,
    (nullif(r.datos->>'name', ''))::date                      as fecha,
    coalesce(nullif(trim(rc.datos->>'name'), ''), r.datos->>'currency_id')
                                                              as moneda_codigo,
    round(1 / (nullif(r.datos->>'rate', ''))::numeric, 6)::numeric(18,6) as tasa,
    {{ columnas_trazabilidad('r') }}
from {{ source('bronce', 'res_currency_rate') }} r
left join {{ source('bronce', 'res_currency') }} rc
       on rc.datos->>'id' = r.datos->>'currency_id'
      and rc.empresa_id   = r.empresa_id
where coalesce((nullif(r.datos->>'rate',''))::numeric, 0) <> 0

{% endif %}
