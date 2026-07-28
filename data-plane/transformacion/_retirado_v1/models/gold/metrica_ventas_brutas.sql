-- Métrica: Ventas Brutas = suma de facturas activas del período (§9).
-- Grano de salida: empresa + mes. La certificación/versión vive en el metadata-store.
{{ config(materialized='table') }}

select
    empresa_id,
    to_char(fecha_documento, 'YYYY-MM') as anio_mes,
    sum(monto_linea)                    as ventas_brutas
from {{ ref('fct_ventas_facturacion') }}
where tipo_documento = 'factura'
group by empresa_id, to_char(fecha_documento, 'YYYY-MM')
