{#
  HECHO DE PEDIDOS DE VENTA — grano: línea de pedido confirmado. Dominio `ventas`.

  Lo que agrega al modelo: el COMPROMISO antes del resultado. Responde backlog (pedido y no
  cumplido), fill rate (cuánto de lo pedido se convirtió) y ritmo de captura de pedidos —
  nada de eso existe en el hecho de facturas.

  `es_abierta` es la bandera del backlog vivo: línea abierta CON cantidad pendiente.
  La fecha de entrega prometida va como relación INACTIVA al calendario (USERELATIONSHIP
  en Power BI), igual que el vencimiento en cartera.
#}
{{ config(materialized='table') }}

select
    {{ clave_tiempo('p.fecha_pedido') }}
                                                      as tiempo_clave,
    {{ clave_tiempo('p.fecha_entrega') }}
                                                      as tiempo_vencimiento_clave,
    {{ clave_o_no_definido('dc', 'cliente_clave') }}  as cliente_clave,
    {{ clave_o_no_definido('ds', 'socio_clave') }}    as socio_clave,
    {{ clave_o_no_definido('dp', 'producto_clave') }} as producto_clave,
    {{ clave_o_no_definido('dv', 'vendedor_clave') }} as vendedor_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    {{ clave_o_no_definido('da', 'almacen_clave') }}  as almacen_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,

    p.empresa_id,
    p.pedido_id,
    p.pedido_numero,
    p.serie_codigo,
    p.linea_numero,
    p.fecha_pedido,
    p.fecha_entrega,
    p.estado,
    p.estado_linea,
    (p.estado_linea = 'abierta' and p.cantidad_abierta > 0) as es_abierta,
    p.cantidad,
    p.cantidad_abierta,
    p.cantidad_entregada,
    p.precio_unitario_doc,
    p.descuento_pct,
    -- Sin sufijo = moneda de PRESENTACIÓN (÷ tasa del día del pedido); _doc = referencia.
    (p.monto_sin_impuesto_local / tp.tasa)::numeric(18,4) as monto_sin_impuesto,
    p.monto_sin_impuesto_doc,
    (p.monto_abierto_local / tp.tasa)::numeric(18,4)  as monto_abierto,
    p.descripcion_linea,

    p.proceso_transformacion,
    p.version_proceso
from {{ ref('plata_pedido_linea') }} p
left join {{ ref('dim_cliente') }} dc
       on dc.cliente_codigo = p.socio_codigo and dc.empresa_id = p.empresa_id
left join {{ ref('dim_socio_negocio') }} ds
       on ds.socio_codigo = p.socio_codigo and ds.empresa_id = p.empresa_id
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = p.empresa_id and tp.fecha = p.fecha_pedido
left join {{ ref('dim_producto') }} dp
       on dp.producto_codigo = p.producto_codigo and dp.empresa_id = p.empresa_id
left join {{ ref('dim_vendedor') }} dv
       on dv.vendedor_codigo = p.vendedor_codigo and dv.empresa_id = p.empresa_id
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = p.empresa_id
left join {{ ref('dim_almacen') }} da
       on da.almacen_codigo = p.almacen_codigo and da.empresa_id = p.empresa_id
left join {{ ref('dim_moneda') }} dm
       on dm.moneda_codigo = p.moneda_documento and dm.empresa_id = p.empresa_id
