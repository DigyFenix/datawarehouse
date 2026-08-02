{#
  HECHO DE PAGOS EFECTUADOS (a proveedores) — grano: un documento de pago. Dominio `tesoreria`.
  Espejo de hecho_pago_recibido con dim_proveedor; ver las decisiones allí.
#}
{{ config(materialized='table') }}

select
    coalesce((to_char(p.fecha_pago, 'YYYYMMDD'))::bigint, {{ clave_no_definido() }})
                                                      as tiempo_clave,
    {{ clave_o_no_definido('dpr', 'proveedor_clave') }} as proveedor_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,

    p.empresa_id,
    p.pago_id,
    p.pago_numero,
    p.serie_codigo,                                   -- serie de numeración: rastreo en el ERP
    p.contraparte,                                    -- proveedor | cuenta_contable (tesorería)
    p.fecha_pago,
    p.medio_pago,
    p.referencia,
    p.estado,

    p.monto_local,
    p.monto_doc,
    p.tipo_cambio,

    p.proceso_transformacion,
    p.version_proceso
from {{ ref('plata_pago') }} p
left join {{ ref('dim_proveedor') }} dpr
       on dpr.proveedor_codigo = p.socio_codigo and dpr.empresa_id = p.empresa_id
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = p.empresa_id
left join {{ ref('dim_moneda') }} dm
       on dm.moneda_codigo = p.moneda_documento and dm.empresa_id = p.empresa_id
where p.tipo_pago = 'efectuado'
