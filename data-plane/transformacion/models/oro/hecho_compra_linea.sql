{#
  HECHO DE COMPRAS — grano: línea de factura o nota de crédito de compra. Dominio `compras`.
  Usa dim_proveedor (no dim_cliente) y no lleva vendedor: son dimensiones distintas por proceso.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

select
    coalesce((to_char(l.fecha_documento, 'YYYYMMDD'))::bigint, {{ clave_no_definido() }})
                                                      as tiempo_clave,
    {{ clave_o_no_definido('dpr', 'proveedor_clave') }} as proveedor_clave,
    {{ clave_o_no_definido('ds', 'socio_clave') }}    as socio_clave,
    -- Línea sin código de artículo = servicio/flete/gasto → miembro SERVICIO (-2).
    case when l.producto_codigo is null then -2
         else {{ clave_o_no_definido('dp', 'producto_clave') }} end as producto_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    {{ clave_o_no_definido('da', 'almacen_clave') }}  as almacen_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,
    {{ clave_o_no_definido('dcu', 'cuenta_clave') }}  as cuenta_clave,
    {{ clave_o_no_definido('dcc', 'centro_costo_clave') }} as centro_costo_clave,
    {{ clave_o_no_definido('dtd', 'tipo_documento_clave') }} as tipo_documento_clave,

    l.empresa_id,
    l.documento_id,                                   -- llave de negocio interna (DocEntry / id)
    cab.documento_numero,                             -- NÚMERO VISIBLE (DocNum / name): el que ve el usuario
    cab.serie_codigo,                                 -- serie de numeración: rastreo en el ERP
    cab.tipo_documento_origen,                        -- ObjType / move_type del ERP
    cab.referencia_externa,                           -- NumAtCard / ref (nº de factura del proveedor)
    l.linea_numero,
    l.tipo_documento,
    l.fecha_documento,

    l.cantidad,
    -- DOS ejes de moneda (ver hecho_venta_linea): sin sufijo = PRESENTACIÓN (rige todo);
    -- `_doc` = moneda del documento, referencia. El eje local vive en Plata.
    (l.monto_sin_impuesto_local / tp.tasa)::numeric(18,4) as monto_sin_impuesto,
    (l.monto_impuesto_local / tp.tasa)::numeric(18,4) as monto_impuesto,
    (l.monto_con_impuesto_local / tp.tasa)::numeric(18,4) as monto_con_impuesto,
    l.monto_sin_impuesto_doc,
    l.monto_impuesto_doc,
    l.monto_con_impuesto_doc,
    (l.monto_descuento_local / tp.tasa)::numeric(18,4) as monto_descuento,
    l.descuento_pct,

    -- Saldo prorrateado por línea, mismo criterio que hecho_venta_linea (informativo:
    -- la cartera oficial sale del mayor).
    -- Peso con coalesce a 0 — mismo motivo que en hecho_venta_linea.
    (coalesce(
        cab.saldo_documento_local * coalesce(l.monto_con_impuesto_local, 0)
            / nullif(sum(coalesce(l.monto_con_impuesto_local, 0))
                     over (partition by l.empresa_id, l.documento_id, l.tipo_documento), 0),
        cab.saldo_documento_local
            / count(*) over (partition by l.empresa_id, l.documento_id, l.tipo_documento)
    ) / tp.tasa)::numeric(18,4)                       as saldo_pendiente,
    cab.estado_pago,

    l.proceso_transformacion,
    l.version_proceso
from {{ ref('plata_documento_linea') }} l
join {{ ref('plata_documento_comercial') }} cab
     on  cab.empresa_id     = l.empresa_id
     and cab.documento_id   = l.documento_id
     and cab.flujo          = l.flujo
     and cab.tipo_documento = l.tipo_documento
left join {{ ref('dim_proveedor') }} dpr
       on dpr.proveedor_codigo = l.socio_codigo and dpr.empresa_id = l.empresa_id
left join {{ ref('dim_socio_negocio') }} ds
       on ds.socio_codigo = l.socio_codigo and ds.empresa_id = l.empresa_id
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = l.empresa_id and tp.fecha = l.fecha_documento
left join {{ ref('dim_producto') }} dp
       on dp.producto_codigo = l.producto_codigo and dp.empresa_id = l.empresa_id
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = l.empresa_id
left join {{ ref('dim_almacen') }} da
       on da.almacen_codigo = l.almacen_codigo and da.empresa_id = l.empresa_id
left join {{ ref('dim_moneda') }} dm
       on dm.moneda_codigo = l.moneda_documento and dm.empresa_id = l.empresa_id
left join {{ ref('dim_cuenta') }} dcu
       on dcu.cuenta_codigo = l.cuenta_codigo and dcu.empresa_id = l.empresa_id
left join {{ ref('dim_centro_costo') }} dcc
       on dcc.centro_costo_codigo = l.centro_costo_codigo and dcc.empresa_id = l.empresa_id
left join {{ ref('dim_tipo_documento') }} dtd
       on dtd.tipo_documento_codigo = 'compra_' || l.tipo_documento
where l.flujo = 'compra'
