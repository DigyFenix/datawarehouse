-- Hecho de ventas/facturación. Grano = línea de documento (§8).
-- Incluye facturas y notas de crédito (monto con signo). Excluye cancelados.
-- Las claves de dimensión son naturales (empresa_id + código); si el código no cruza,
-- se resuelve al miembro default 'DESCONOCIDO'.
{{ config(materialized='table') }}

select
    l.empresa_id,
    l.tipo_documento,
    l.documento_codigo,
    l.linea_numero,
    l.fecha_documento,
    coalesce(l.socio_negocio_codigo, 'DESCONOCIDO') as socio_negocio_codigo,
    coalesce(l.item_codigo, 'DESCONOCIDO')          as item_codigo,
    coalesce(l.vendedor_codigo, 'DESCONOCIDO')      as vendedor_codigo,
    coalesce(l.sucursal_codigo, 'DESCONOCIDO')      as sucursal_codigo,
    coalesce(l.centro_costo_codigo, 'DESCONOCIDO')  as centro_costo_codigo,
    coalesce(l.cuenta_codigo, 'DESCONOCIDO')        as cuenta_codigo,
    l.cantidad,
    l.precio_unitario,
    l.monto_linea,
    l.estado_documento,
    l.cancelado
from {{ ref('silver_linea_documento_venta') }} l
where l.cancelado = 'N'
