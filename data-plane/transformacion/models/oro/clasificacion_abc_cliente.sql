{#
  CLASIFICACIÓN ABC DE CLIENTES (análisis de Pareto sobre ventas netas).

  Regla: se ordenan los clientes por venta neta descendente y se acumula su participación.
    A → hasta el 80% acumulado   (los que hacen el negocio)
    B → del 80% al 95%
    C → el resto
    S → sin ventas en el ámbito
  Los cortes son parámetros (`abc_corte_a`, `abc_corte_b`) para ajustarlos por tenant sin
  tocar el modelo.

  DECISIONES QUE IMPORTAN:

  - Se calcula EN EL WAREHOUSE, no en DAX. Así el mismo ABC lo ve Power BI, un reporte y el
    futuro agente: una sola definición (§9). Un ABC calculado en DAX cambia con cada filtro y
    dos personas obtienen clases distintas del mismo cliente — el problema que este producto
    existe para evitar.

  - Se EXCLUYE la venta intercompañía. En proavisa el grupo pesa muchísimo; incluirlo pone a
    las empresas hermanas como clase A y esconde a los clientes reales, que son los que el
    comercial puede trabajar.

  - GRANO: una fila por (empresa, cliente). Los dos ámbitos temporales —año en curso e
    histórico— van como COLUMNAS, no como filas. Con dos filas por cliente la clase ABC no
    puede filtrar el hecho de ventas en Power BI sin filtrado bidireccional, y eso vuelve
    ambiguo el modelo: el mismo cliente sería A en un ámbito y C en el otro dentro del mismo
    visual. Con una fila por cliente la relación es 1:1 con la dimensión Cliente y la clase se
    usa como cualquier atributo.

  - Los clientes sin ventas también salen (clase 'S'): un catálogo que solo lista a quien
    compró no sirve para detectar al que dejó de comprar.
#}
{{ config(materialized='table') }}

{%- set corte_a = var('abc_corte_a', 0.80) -%}
{%- set corte_b = var('abc_corte_b', 0.95) -%}

with ventas_terceros as (
    select
        v.empresa_id,
        v.cliente_clave,
        d.anio                                         as anio,
        v.monto_sin_impuesto_local                     as monto,
        v.margen_local                                 as margen
    from {{ ref('hecho_venta_linea') }} v
    join {{ ref('dim_tiempo') }} d on d.tiempo_clave = v.tiempo_clave
    join {{ ref('dim_cliente') }} c on c.cliente_clave = v.cliente_clave
    -- Solo mercado real: la venta al grupo no compite por precio ni la trabaja un vendedor.
    where coalesce(c.es_intercompania, false) = false
),

-- Un solo agregado con los dos ámbitos en columnas separadas.
agregado as (
    select
        empresa_id,
        cliente_clave,
        sum(monto)                                                            as venta_historico,
        sum(margen)                                                           as margen_historico,
        count(*)                                                              as lineas_historico,
        max(anio)                                                             as ultimo_anio_compra,
        sum(monto) filter (where anio = date_part('year', current_date))       as venta_anio,
        sum(margen) filter (where anio = date_part('year', current_date))      as margen_anio,
        count(*)    filter (where anio = date_part('year', current_date))      as lineas_anio
    from ventas_terceros
    group by 1, 2
),

-- Universo completo: todo cliente vigente y no intercompañía, con o sin ventas.
universo as (
    select
        c.empresa_id,
        c.cliente_clave,
        coalesce(g.venta_historico, 0)::numeric(18,4)   as venta_historico,
        coalesce(g.margen_historico, 0)::numeric(18,4)  as margen_historico,
        coalesce(g.lineas_historico, 0)::bigint         as lineas_historico,
        coalesce(g.venta_anio, 0)::numeric(18,4)        as venta_anio,
        coalesce(g.margen_anio, 0)::numeric(18,4)       as margen_anio,
        coalesce(g.lineas_anio, 0)::bigint              as lineas_anio,
        g.ultimo_anio_compra
    from {{ ref('dim_cliente') }} c
    left join agregado g
           on g.empresa_id = c.empresa_id and g.cliente_clave = c.cliente_clave
    where c.es_vigente
      and coalesce(c.es_intercompania, false) = false
      and c.cliente_clave <> {{ clave_no_definido() }}
),

-- Pareto de cada ámbito por separado: el orden y el acumulado no son los mismos.
acumulado as (
    select
        u.*,
        sum(u.venta_historico) over (partition by u.empresa_id)                as total_historico,
        sum(u.venta_anio)      over (partition by u.empresa_id)                as total_anio,
        row_number() over (partition by u.empresa_id
                           order by u.venta_historico desc, u.cliente_clave)   as ranking_historico,
        row_number() over (partition by u.empresa_id
                           order by u.venta_anio desc, u.cliente_clave)        as ranking_anio,
        sum(u.venta_historico) over (partition by u.empresa_id
                           order by u.venta_historico desc, u.cliente_clave
                           rows between unbounded preceding and current row)   as acum_historico,
        sum(u.venta_anio) over (partition by u.empresa_id
                           order by u.venta_anio desc, u.cliente_clave
                           rows between unbounded preceding and current row)   as acum_anio
    from universo u
)

select
    a.empresa_id,
    a.cliente_clave,

    -- ---------- ámbito HISTÓRICO (todo lo que hay en el hecho) ----------
    a.ranking_historico::int                           as ranking_historico,
    a.venta_historico,
    a.margen_historico,
    a.lineas_historico,
    round(case when a.total_historico > 0 then a.venta_historico / a.total_historico
               else 0 end, 6)::numeric(9,6)            as participacion_historico,
    round(case when a.total_historico > 0 then a.acum_historico / a.total_historico
               else 0 end, 6)::numeric(9,6)            as participacion_acumulada_historico,
    case
        when a.venta_historico <= 0                                                  then 'S'
        when a.acum_historico / nullif(a.total_historico, 0) <= {{ corte_a }}         then 'A'
        when a.acum_historico / nullif(a.total_historico, 0) <= {{ corte_b }}         then 'B'
        else 'C'
    end                                                as clase_abc_historico,

    -- ---------- ámbito AÑO EN CURSO ----------
    a.ranking_anio::int                                as ranking_anio,
    a.venta_anio,
    a.margen_anio,
    a.lineas_anio,
    round(case when a.total_anio > 0 then a.venta_anio / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion_anio,
    round(case when a.total_anio > 0 then a.acum_anio / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion_acumulada_anio,
    case
        when a.venta_anio <= 0                                             then 'S'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_a }}        then 'A'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_b }}        then 'B'
        else 'C'
    end                                                as clase_abc_anio,

    -- Etiqueta legible de la clase del año (la que se usa por defecto en los visuales).
    case
        -- Incluye al cliente cuyo neto del año es 0 o negativo (solo devoluciones).
        when a.venta_anio <= 0                                             then 'S · sin venta neta'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_a }}        then 'A · clave'
        when a.acum_anio / nullif(a.total_anio, 0) <= {{ corte_b }}        then 'B · relevante'
        else 'C · cola larga'
    end                                                as clase_abc_anio_nombre,

    a.ultimo_anio_compra,
    -- Cliente que facturó antes y no en el año en curso: el dato que dispara una llamada.
    (a.venta_historico > 0 and a.venta_anio <= 0)       as perdido_en_anio,

    -- Trazabilidad (§12). No usa `columnas_trazabilidad()` porque es un agregado: no arrastra
    -- `fuente_origen`/`extraido_en` de una fila de origen concreta.
    '{{ this.name }}'::text                            as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text        as version_proceso
from acumulado a
