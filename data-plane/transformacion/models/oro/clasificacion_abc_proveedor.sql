{#
  CLASIFICACIÓN ABC DE PROVEEDORES (Pareto sobre compras netas).
  Espejo de clasificacion_abc_cliente — mismas decisiones (calculada en el warehouse, un solo
  grano por (empresa, proveedor), ámbitos año/histórico como columnas, excluye intercompañía,
  clase 'S' para el proveedor sin compras). Diferencia: el hecho de compras no lleva margen,
  así que aquí no hay columnas de margen.
#}
{{ config(materialized='table') }}

{%- set corte_a = var('abc_corte_a', 0.80) -%}
{%- set corte_b = var('abc_corte_b', 0.95) -%}

with compras_terceros as (
    select
        v.empresa_id,
        v.proveedor_clave,
        d.anio                                         as anio,
        v.monto_sin_impuesto                     as monto
    from {{ ref('hecho_compra_linea') }} v
    join {{ ref('dim_tiempo') }} d on d.tiempo_clave = v.tiempo_clave
    join {{ ref('dim_proveedor') }} c on c.proveedor_clave = v.proveedor_clave
    where coalesce(c.es_intercompania, false) = false
),

agregado as (
    select
        empresa_id,
        proveedor_clave,
        sum(monto)                                                            as compra_historico,
        count(*)                                                              as lineas_historico,
        max(anio)                                                             as ultimo_anio_compra,
        sum(monto) filter (where anio = date_part('year', current_date))       as compra_anio,
        count(*)   filter (where anio = date_part('year', current_date))       as lineas_anio
    from compras_terceros
    group by 1, 2
),

universo as (
    select
        c.empresa_id,
        c.proveedor_clave,
        coalesce(g.compra_historico, 0)::numeric(18,4)  as compra_historico,
        coalesce(g.lineas_historico, 0)::bigint         as lineas_historico,
        coalesce(g.compra_anio, 0)::numeric(18,4)       as compra_anio,
        coalesce(g.lineas_anio, 0)::bigint              as lineas_anio,
        g.ultimo_anio_compra
    from {{ ref('dim_proveedor') }} c
    left join agregado g
           on g.empresa_id = c.empresa_id and g.proveedor_clave = c.proveedor_clave
    where c.es_vigente
      and coalesce(c.es_intercompania, false) = false
      and c.proveedor_clave <> {{ clave_no_definido() }}
),

acumulado as (
    select
        u.*,
        sum(u.compra_historico) over (partition by u.empresa_id)               as total_historico,
        sum(u.compra_anio)      over (partition by u.empresa_id)               as total_anio,
        row_number() over (partition by u.empresa_id
                           order by u.compra_historico desc, u.proveedor_clave) as ranking_historico,
        row_number() over (partition by u.empresa_id
                           order by u.compra_anio desc, u.proveedor_clave)      as ranking_anio,
        sum(u.compra_historico) over (partition by u.empresa_id
                           order by u.compra_historico desc, u.proveedor_clave
                           rows between unbounded preceding and current row)    as acum_historico,
        sum(u.compra_anio) over (partition by u.empresa_id
                           order by u.compra_anio desc, u.proveedor_clave
                           rows between unbounded preceding and current row)    as acum_anio
    from universo u
)

select
    a.empresa_id,
    a.proveedor_clave,

    -- ---------- ámbito HISTÓRICO ----------
    a.ranking_historico::int                           as ranking_historico,
    a.compra_historico,
    a.lineas_historico,
    round(case when a.total_historico > 0 then a.compra_historico / a.total_historico
               else 0 end, 6)::numeric(9,6)            as participacion_historico,
    round(case when a.total_historico > 0 then a.acum_historico / a.total_historico
               else 0 end, 6)::numeric(9,6)            as participacion_acumulada_historico,
    case
        when a.compra_historico <= 0                                                 then 'S'
        when a.acum_historico / nullif(a.total_historico, 0) <= {{ corte_a }}         then 'A'
        when a.acum_historico / nullif(a.total_historico, 0) <= {{ corte_b }}         then 'B'
        else 'C'
    end                                                as clase_abc_historico,

    -- ---------- ámbito AÑO EN CURSO ----------
    a.ranking_anio::int                                as ranking_anio,
    a.compra_anio,
    a.lineas_anio,
    round(case when a.total_anio > 0 then a.compra_anio / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion_anio,
    round(case when a.total_anio > 0 then a.acum_anio / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion_acumulada_anio,
    case
        when a.compra_anio <= 0                                            then 'S'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_a }}        then 'A'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_b }}        then 'B'
        else 'C'
    end                                                as clase_abc_anio,

    case
        when a.compra_anio <= 0                                            then 'S · sin compra neta'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_a }}        then 'A · crítico'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_b }}        then 'B · relevante'
        else 'C · cola larga'
    end                                                as clase_abc_anio_nombre,

    a.ultimo_anio_compra,
    -- Proveedor al que se le compró antes pero no en el año en curso.
    (a.compra_historico > 0 and a.compra_anio <= 0)     as inactivo_en_anio,

    '{{ this.name }}'::text                            as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text        as version_proceso
from acumulado a
