{#
  SERIE DIARIA DE VENTAS — un registro por (empresa, día) SIN HUECOS entre la primera y la
  última venta de cada empresa.

  Por qué existe si el hecho ya tiene el detalle: las tendencias, medias móviles y el
  forecasting futuro necesitan una serie CONTINUA — un día sin ventas es un CERO, no una fila
  ausente. Densificarla aquí evita que cada consumidor (Power BI, agente, un script de DS)
  resuelva los huecos por su cuenta y obtenga curvas distintas.

  Los montos son NETOS y también se publican brutos/devoluciones por separado (la devolución
  va en valor absoluto, como en metrica_valor).
#}
{{ config(materialized='table') }}

with ventas_dia as (
    select
        empresa_id,
        fecha_documento                                                     as fecha,
        -- En moneda de PRESENTACIÓN (los hechos ya la traen sin sufijo): la serie diaria
        -- existe para tendencias del grupo y debe ser consolidable entre monedas.
        sum(monto_sin_impuesto) filter (where tipo_documento = 'factura')   as ventas_brutas,
        abs(sum(monto_sin_impuesto) filter (where tipo_documento = 'nota_credito'))
                                                                            as devoluciones,
        sum(monto_sin_impuesto)                                             as ventas_netas,
        sum(costo)                                                          as costo,
        sum(margen)                                                         as margen,
        sum(cantidad) filter (where tipo_documento = 'factura')             as cantidad_vendida,
        count(distinct documento_id) filter (where tipo_documento = 'factura')
                                                                            as documentos,
        count(distinct cliente_clave) filter (where tipo_documento = 'factura')
                                                                            as clientes_activos
    from {{ ref('hecho_venta_linea') }}
    group by 1, 2
),

rango as (
    select empresa_id, min(fecha) as desde, max(fecha) as hasta
    from ventas_dia
    group by 1
),

-- Serie continua por empresa: cada día del rango existe, con o sin ventas.
calendario as (
    select r.empresa_id, d.fecha::date as fecha
    from rango r
    cross join lateral generate_series(r.desde, r.hasta, interval '1 day') d(fecha)
)

select
    c.empresa_id,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    c.fecha,
    (to_char(c.fecha, 'YYYYMMDD'))::bigint            as tiempo_clave,
    coalesce(v.ventas_brutas, 0)::numeric(18,4)       as ventas_brutas,
    coalesce(v.devoluciones, 0)::numeric(18,4)        as devoluciones,
    coalesce(v.ventas_netas, 0)::numeric(18,4)        as ventas_netas,
    coalesce(v.costo, 0)::numeric(18,4)               as costo,
    coalesce(v.margen, 0)::numeric(18,4)              as margen,
    coalesce(v.cantidad_vendida, 0)::numeric(18,4)    as cantidad_vendida,
    coalesce(v.documentos, 0)::int                    as documentos,
    coalesce(v.clientes_activos, 0)::int              as clientes_activos,
    v.fecha is null or coalesce(v.documentos, 0) = 0  as es_dia_sin_venta,

    -- Trazabilidad (§12). Agregado: no arrastra fuente/extraído de una fila concreta.
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from calendario c
left join ventas_dia v on v.empresa_id = c.empresa_id and v.fecha = c.fecha
left join {{ ref('dim_organizacion') }} dorg on dorg.empresa_id = c.empresa_id
