-- Canónico: línea de documento de venta VÁLIDA (grano del hecho, §8).
-- Solo líneas de documentos que pasaron calidad (no en cuarentena). Denormaliza contexto de cabecera.
{{ config(materialized='table') }}

select
    l.empresa_id,
    l.tipo_documento,
    l.documento_codigo,
    l.linea_numero,
    d.fecha_documento,
    d.fecha_vencimiento,
    d.socio_negocio_codigo,
    d.vendedor_codigo,
    d.moneda,
    l.item_codigo,
    l.sucursal_codigo,
    l.centro_costo_codigo,
    l.cuenta_codigo,
    l.cantidad,
    l.precio_unitario,
    l.monto_linea,
    d.estado_documento,
    d.cancelado
from {{ ref('stg_ventas_linea') }} l
inner join {{ ref('silver_documento_venta') }} d
    on  d.empresa_id = l.empresa_id
    and d.tipo_documento = l.tipo_documento
    and d.documento_codigo = l.documento_codigo
