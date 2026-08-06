{#
  CLASIFICACIÓN ABC DE PROVEEDORES (Pareto sobre compras netas), POR AÑO.

  Espejo del ABC de clientes sobre el flujo de compra, con dos diferencias de fondo:
    · no lleva margen (la compra no lo tiene),
    · «inactivo» sustituye a «perdido»: un proveedor al que se dejó de comprar no es una
      pérdida, es un cambio de abastecimiento — pero saberlo importa igual, porque una
      relación que se apaga suele venir con una concentración que crece en otro lado.

  Ver `clasificacion_abc_cliente` para el razonamiento del grano por año y de por qué se
  excluye la intercompañía. La clase vigente se desnormaliza en `dim_proveedor`
  (`clase_abc_actual`) para segmentar las compras sin filtrado bidireccional.
#}
{#- El post_hook desnormaliza la clasificación vigente sobre la dimensión. No puede
    ser un join dentro de la dimensión: los hechos leen la dimensión y esta tabla lee
    los hechos, así que un `ref` desde dim_proveedor cerraría un ciclo. -#}
{{ config(
    materialized='table',
    post_hook="update {{ ref('dim_proveedor') }} d set clase_abc_actual = c.clase_abc, clase_abc_actual_nombre = c.clase_abc_nombre from {{ this }} c where c.proveedor_clave = d.proveedor_clave and c.anio = extract(year from current_date)::int"
) }}

{%- set corte_a = var('abc_corte_a', 0.80) -%}
{%- set corte_b = var('abc_corte_b', 0.95) -%}

with compras_terceros as (
    select
        v.empresa_id,
        v.proveedor_clave,
        d.anio                                         as anio,
        v.monto_sin_impuesto                           as monto
    from {{ ref('hecho_compra_linea') }} v
    join {{ ref('dim_tiempo') }} d on d.tiempo_clave = v.tiempo_clave
    join {{ ref("maestra_proveedor") }} c on c.proveedor_clave = v.proveedor_clave
    where coalesce(c.es_intercompania, false) = false
),

agregado as (
    select
        empresa_id,
        anio,
        proveedor_clave,
        sum(monto)                                     as compra,
        count(*)                                       as lineas
    from compras_terceros
    group by 1, 2, 3
),

anios as (
    select distinct empresa_id, anio from compras_terceros
),

proveedores as (
    select empresa_id, proveedor_clave
    from {{ ref("maestra_proveedor") }}
    where coalesce(es_intercompania, false) = false
      and proveedor_clave <> {{ clave_no_definido() }}
),

universo as (
    select
        p.empresa_id,
        a.anio,
        p.proveedor_clave,
        coalesce(g.compra, 0)::numeric(18,4)           as compra,
        coalesce(g.lineas, 0)::bigint                  as lineas
    from proveedores p
    join anios a on a.empresa_id = p.empresa_id
    left join agregado g
           on g.empresa_id = p.empresa_id
          and g.proveedor_clave = p.proveedor_clave
          and g.anio = a.anio
),

acumulado as (
    select
        u.*,
        sum(u.compra) over (partition by u.empresa_id, u.anio)                 as total_anio,
        row_number() over (partition by u.empresa_id, u.anio
                           order by u.compra desc, u.proveedor_clave)          as ranking,
        sum(u.compra) over (partition by u.empresa_id, u.anio
                           order by u.compra desc, u.proveedor_clave
                           rows between unbounded preceding and current row)   as acum
    from universo u
),

historia as (
    select
        empresa_id,
        proveedor_clave,
        min(anio) filter (where compra > 0)            as primer_anio_compra,
        max(anio) filter (where compra > 0)            as ultimo_anio_compra
    from universo
    group by 1, 2
)

select
    a.empresa_id,
    a.anio,
    a.anio                                             as anio_clave,
    a.proveedor_clave,

    a.ranking::int                                     as ranking,
    a.compra,
    a.lineas,
    round(case when a.total_anio > 0 then a.compra / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion,
    round(case when a.total_anio > 0 then a.acum / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion_acumulada,
    case
        when a.compra <= 0                                         then 'S'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_a }}     then 'A'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_b }}     then 'B'
        else 'C'
    end                                                as clase_abc,
    case
        when a.compra <= 0                                         then 'S · sin compra neta'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_a }}     then 'A · crítico'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_b }}     then 'B · relevante'
        else 'C · cola larga'
    end                                                as clase_abc_nombre,

    h.primer_anio_compra,
    h.ultimo_anio_compra,
    (h.ultimo_anio_compra is not null
     and h.ultimo_anio_compra < a.anio
     and a.compra <= 0)                                as es_inactivo,
    (h.primer_anio_compra = a.anio)                    as es_nuevo,

    '{{ this.name }}'::text                            as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text        as version_proceso
from acumulado a
left join historia h
       on h.empresa_id = a.empresa_id and h.proveedor_clave = a.proveedor_clave
