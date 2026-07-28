-- Hecho de cobros / cuentas por cobrar. Se deriva de facturas ABIERTAS (SAP B1: DocStatus='O').
-- saldo_pendiente = total del documento - pagado a la fecha. Base de Saldo CxC y Aging.
{{ config(materialized='table') }}

select
    d.empresa_id,
    d.documento_codigo,
    coalesce(d.socio_negocio_codigo, 'DESCONOCIDO') as socio_negocio_codigo,
    d.fecha_documento,
    d.fecha_vencimiento,
    d.moneda,
    d.total_bruto                        as monto_original,
    (d.total_bruto - d.saldo_pagado)     as saldo_pendiente
from {{ ref('silver_documento_venta') }} d
where d.tipo_documento = 'factura'
  and d.estado_documento = 'O'
  and d.cancelado = 'N'
  and (d.total_bruto - d.saldo_pagado) > 0
