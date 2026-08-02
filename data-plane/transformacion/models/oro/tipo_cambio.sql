{#
  TIPO DE CAMBIO en Oro — grano: (empresa, fecha, moneda). Dominio `finanzas`.
  Tasa = moneda local por 1 unidad de la moneda. INFORMATIVO: los hechos no se reconvierten.
#}
{{ config(materialized='table') }}

select
    coalesce((to_char(t.fecha, 'YYYYMMDD'))::bigint, {{ clave_no_definido() }})
                                                      as tiempo_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,

    t.empresa_id,
    t.fecha,
    t.moneda_codigo,
    t.tasa,

    t.proceso_transformacion,
    t.version_proceso
from {{ ref('plata_tipo_cambio') }} t
left join {{ ref('dim_moneda') }} dm
       on dm.moneda_codigo = t.moneda_codigo and dm.empresa_id = t.empresa_id
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = t.empresa_id
