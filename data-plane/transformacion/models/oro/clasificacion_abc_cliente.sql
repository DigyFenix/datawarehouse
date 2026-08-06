{#
  CLASIFICACIÓN ABC DE CLIENTES (análisis de Pareto sobre ventas netas), POR AÑO.

  Regla: dentro de cada año se ordenan los clientes por venta neta descendente y se acumula su
  participación.
    A → hasta el 80% acumulado   (los que hacen el negocio)
    B → del 80% al 95%
    C → el resto
    S → sin ventas en el año
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

  - GRANO: una fila por (empresa, AÑO, cliente). Antes era una fila por cliente con los dos
    ámbitos —año en curso e histórico— en columnas, y la tabla no tenía relación con el tiempo:
    al filtrar 2024 se devolvía igual la clasificación del último año procesado. El número era
    plausible y estaba mal. Ahora cada año es una fila y la tabla cuelga de `dim_anio`.

  - El universo es cliente × año, no solo los años en que compró: un catálogo que solo lista a
    quien facturó no sirve para detectar al que dejó de comprar. De ahí sale `es_perdido`.

  - La clase VIGENTE (la del año en curso) se desnormaliza además en `dim_cliente`
    (`clase_abc_actual`), para poder segmentar las ventas por clase desde el panel de campos
    sin filtrado bidireccional. Esta tabla es para el análisis histórico; la columna de la
    dimensión, para el uso diario.
#}
{#- El post_hook desnormaliza la clasificación vigente sobre la dimensión. No puede
    ser un join dentro de la dimensión: los hechos leen la dimensión y esta tabla lee
    los hechos, así que un `ref` desde dim_cliente cerraría un ciclo. -#}
{{ config(
    materialized='table',
    post_hook="update {{ ref('dim_cliente') }} d set clase_abc_actual = c.clase_abc, clase_abc_actual_nombre = c.clase_abc_nombre from {{ this }} c where c.cliente_clave = d.cliente_clave and c.anio = extract(year from current_date)::int"
) }}

{%- set corte_a = var('abc_corte_a', 0.80) -%}
{%- set corte_b = var('abc_corte_b', 0.95) -%}

with ventas_terceros as (
    select
        v.empresa_id,
        v.cliente_clave,
        d.anio                                         as anio,
        v.monto_sin_impuesto                           as monto,
        v.margen                                       as margen
    from {{ ref('hecho_venta_linea') }} v
    join {{ ref('dim_tiempo') }} d on d.tiempo_clave = v.tiempo_clave
    join {{ ref("maestra_cliente") }} c on c.cliente_clave = v.cliente_clave
    -- Solo mercado real: la venta al grupo no compite por precio ni la trabaja un vendedor.
    where coalesce(c.es_intercompania, false) = false
),

agregado as (
    select
        empresa_id,
        anio,
        cliente_clave,
        sum(monto)                                     as venta,
        sum(margen)                                    as margen,
        count(*)                                       as lineas
    from ventas_terceros
    group by 1, 2, 3
),

-- Años con actividad. No se usa el rango del calendario completo: multiplicaría el catálogo
-- por años vacíos anteriores a la primera venta, sin aportar nada.
anios as (
    select distinct empresa_id, anio from ventas_terceros
),

clientes as (
    select empresa_id, cliente_clave
    from {{ ref("maestra_cliente") }}
    where coalesce(es_intercompania, false) = false
      and cliente_clave <> {{ clave_no_definido() }}
),

-- Universo completo: todo cliente vigente en CADA año con actividad, haya facturado o no.
universo as (
    select
        c.empresa_id,
        a.anio,
        c.cliente_clave,
        coalesce(g.venta, 0)::numeric(18,4)            as venta,
        coalesce(g.margen, 0)::numeric(18,4)           as margen,
        coalesce(g.lineas, 0)::bigint                  as lineas
    from clientes c
    join anios a on a.empresa_id = c.empresa_id
    left join agregado g
           on g.empresa_id = c.empresa_id
          and g.cliente_clave = c.cliente_clave
          and g.anio = a.anio
),

-- Pareto DENTRO de cada año: el orden y el acumulado son propios del año.
acumulado as (
    select
        u.*,
        sum(u.venta) over (partition by u.empresa_id, u.anio)                  as total_anio,
        row_number() over (partition by u.empresa_id, u.anio
                           order by u.venta desc, u.cliente_clave)             as ranking,
        sum(u.venta) over (partition by u.empresa_id, u.anio
                           order by u.venta desc, u.cliente_clave
                           rows between unbounded preceding and current row)   as acum
    from universo u
),

-- Historia del cliente, para distinguir «nunca compró» de «dejó de comprar».
historia as (
    select
        empresa_id,
        cliente_clave,
        min(anio) filter (where venta > 0)             as primer_anio_compra,
        max(anio) filter (where venta > 0)             as ultimo_anio_compra
    from universo
    group by 1, 2
)

select
    a.empresa_id,
    a.anio,
    a.anio                                             as anio_clave,
    a.cliente_clave,

    a.ranking::int                                     as ranking,
    a.venta,
    a.margen,
    a.lineas,
    round(case when a.total_anio > 0 then a.venta / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion,
    round(case when a.total_anio > 0 then a.acum / a.total_anio
               else 0 end, 6)::numeric(9,6)            as participacion_acumulada,
    case
        when a.venta <= 0                                          then 'S'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_a }}     then 'A'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_b }}     then 'B'
        else 'C'
    end                                                as clase_abc,
    case
        -- Incluye al cliente cuyo neto del año es 0 o negativo (solo devoluciones).
        when a.venta <= 0                                          then 'S · sin venta neta'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_a }}     then 'A · clave'
        when a.acum / nullif(a.total_anio, 0) <= {{ corte_b }}     then 'B · relevante'
        else 'C · cola larga'
    end                                                as clase_abc_nombre,

    h.primer_anio_compra,
    h.ultimo_anio_compra,
    -- Facturó en algún año anterior y en este no: el dato que dispara una llamada.
    (h.ultimo_anio_compra is not null
     and h.ultimo_anio_compra < a.anio
     and a.venta <= 0)                                 as es_perdido,
    (h.primer_anio_compra = a.anio)                    as es_nuevo,

    -- Trazabilidad (§12). No usa `columnas_trazabilidad()` porque es un agregado: no arrastra
    -- `fuente_origen`/`extraido_en` de una fila de origen concreta.
    '{{ this.name }}'::text                            as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text        as version_proceso
from acumulado a
left join historia h
       on h.empresa_id = a.empresa_id and h.cliente_clave = a.cliente_clave
