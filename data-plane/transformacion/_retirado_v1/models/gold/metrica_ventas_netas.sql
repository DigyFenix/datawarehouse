-- Métrica: Ventas Netas = Ventas Brutas - Devoluciones (§9).
-- Se compone de las dos métricas base para garantizar consistencia (una sola definición).
{{ config(materialized='table') }}

with base as (
    select empresa_id, to_char(fecha_documento, 'YYYY-MM') as anio_mes,
           sum(case when tipo_documento = 'factura'      then monto_linea else 0 end)  as ventas_brutas,
           sum(case when tipo_documento = 'nota_credito' then -monto_linea else 0 end) as devoluciones
    from {{ ref('fct_ventas_facturacion') }}
    group by empresa_id, to_char(fecha_documento, 'YYYY-MM')
)
select
    empresa_id,
    anio_mes,
    ventas_brutas,
    devoluciones,
    (ventas_brutas - devoluciones) as ventas_netas
from base
