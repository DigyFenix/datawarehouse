{#
  AGING de cartera por rango. Va aparte de `metrica_valor` porque necesita el desglose por rango
  y por socio, que es como se usa: la pregunta real no es "cuánto me deben" sino "quién me debe
  y desde cuándo".

  Rangos definidos en el catálogo (§9): corriente, 1-30, 31-60, 61-90, +90.
  Se agrega `sin_vencimiento` para las partidas del mayor que no traen fecha de vencimiento
  (asientos manuales y ajustes), que de otro modo desaparecerían del reporte.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

select
    c.empresa_id,
    'cobrar'                                          as tipo_cartera,
    c.fecha_corte,
    c.rango_aging,
    dc.cliente_clave                                  as socio_clave,
    dc.cliente_codigo                                 as socio_codigo,
    dc.nombre                                         as socio_nombre,
    count(*)                                          as partidas,
    sum(c.saldo_pendiente)::numeric(18,4)             as saldo_local,
    sum(c.saldo_pendiente_doc)::numeric(18,4)         as saldo_doc
from {{ ref('hecho_cartera_cobrar') }} c
join {{ ref('dim_cliente') }} dc on dc.cliente_clave = c.cliente_clave
group by 1, 2, 3, 4, 5, 6, 7

union all

select
    p.empresa_id,
    'pagar',
    p.fecha_corte,
    p.rango_aging,
    dp.proveedor_clave,
    dp.proveedor_codigo,
    dp.nombre,
    count(*),
    -- El mayor deja la deuda en negativo (acreedor); para el reporte de aging se muestra el
    -- valor absoluto, que es cómo lo lee tesorería.
    abs(sum(p.saldo_pendiente))::numeric(18,4),
    abs(sum(p.saldo_pendiente_doc))::numeric(18,4)
from {{ ref('hecho_cartera_pagar') }} p
join {{ ref('dim_proveedor') }} dp on dp.proveedor_clave = p.proveedor_clave
group by 1, 2, 3, 4, 5, 6, 7
