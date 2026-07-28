-- Métrica: Devoluciones = suma de notas de crédito por devolución del período (§9).
-- El monto de NC es negativo en el hecho; se devuelve en positivo.
{{ config(materialized='table') }}

select
    empresa_id,
    to_char(fecha_documento, 'YYYY-MM') as anio_mes,
    -sum(monto_linea)                   as devoluciones
from {{ ref('fct_ventas_facturacion') }}
where tipo_documento = 'nota_credito'
group by empresa_id, to_char(fecha_documento, 'YYYY-MM')
