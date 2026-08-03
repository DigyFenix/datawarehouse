{#
  HECHO DE VENTAS — grano: línea de factura o nota de crédito de venta. Dominio `ventas`.

  Separado de hecho_compra_linea a propósito (ver DISENO-plata-oro.md §3): con una tabla mixta,
  toda medida de Power BI necesitaría un filtro por flujo y arrastrar el campo crudo al lienzo
  mostraría ventas+compras sumadas. Aquí un SUM() simple ya es correcto.

  TODAS las dimensiones se resuelven con LEFT JOIN + miembro No definido: el hecho NUNCA pierde
  una fila, así que el total del modelo siempre cuadra con el de Plata.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

select
    -- ---------- claves dimensionales ----------
    coalesce((to_char(l.fecha_documento, 'YYYYMMDD'))::bigint, {{ clave_no_definido() }})
                                                      as tiempo_clave,
    {{ clave_o_no_definido('dc', 'cliente_clave') }}  as cliente_clave,
    {{ clave_o_no_definido('ds', 'socio_clave') }}    as socio_clave,
    -- ¿A DÓNDE se vende? La dirección de ENTREGA del documento (ShipToCode → CRD1), que es
    -- distinta de quién compra: un cliente puede tener 20 puntos de entrega.
    {{ clave_o_no_definido('ddir', 'direccion_clave') }} as direccion_clave,
    -- Línea sin código de artículo = servicio/flete/gasto → miembro SERVICIO (-2), no
    -- "No definido": es una categoría de negocio real, no un dato faltante.
    case when l.producto_codigo is null then -2
         else {{ clave_o_no_definido('dp', 'producto_clave') }} end as producto_clave,
    {{ clave_o_no_definido('dv', 'vendedor_clave') }} as vendedor_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    {{ clave_o_no_definido('da', 'almacen_clave') }}  as almacen_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,
    {{ clave_o_no_definido('dcu', 'cuenta_clave') }}  as cuenta_clave,
    {{ clave_o_no_definido('dcc', 'centro_costo_clave') }} as centro_costo_clave,
    {{ clave_o_no_definido('dtd', 'tipo_documento_clave') }} as tipo_documento_clave,

    -- ---------- atributos degenerados ----------
    l.empresa_id,
    l.documento_id,                                   -- llave de negocio interna (DocEntry / id)
    cab.documento_numero,                             -- NÚMERO VISIBLE (DocNum / name): el que ve el usuario
    cab.serie_codigo,                                 -- serie de numeración: rastreo en el ERP
    cab.tipo_documento_origen,                        -- ObjType / move_type del ERP
    cab.referencia_externa,                           -- NumAtCard / ref
    l.linea_numero,
    l.tipo_documento,
    l.fecha_documento,

    -- ---------- medidas: TODOS los ejes ----------
    l.cantidad,
    -- DOS ejes de moneda (decisión 2026-08-02): sin sufijo = moneda de PRESENTACIÓN, la que
    -- rige TODO análisis (local ÷ tasa del día del documento; tasa 1 si la sociedad ya
    -- presenta en su moneda; NULL = no consolida). `_doc` = moneda del documento, solo
    -- referencia. El eje local vive en Plata (cuadre y trazabilidad).
    (l.monto_sin_impuesto_local / tp.tasa)::numeric(18,4) as monto_sin_impuesto,
    (l.monto_impuesto_local / tp.tasa)::numeric(18,4) as monto_impuesto,
    (l.monto_con_impuesto_local / tp.tasa)::numeric(18,4) as monto_con_impuesto,
    l.monto_sin_impuesto_doc,
    l.monto_impuesto_doc,
    l.monto_con_impuesto_doc,
    (l.monto_descuento_local / tp.tasa)::numeric(18,4) as monto_descuento,
    l.descuento_pct,
    (l.costo_local / tp.tasa)::numeric(18,4)          as costo,
    (l.margen_local / tp.tasa)::numeric(18,4)         as margen,

    -- Saldo del documento PRORRATEADO por el peso de la línea: así SUM(saldo) a cualquier
    -- corte dimensional reproduce el saldo real del documento sin duplicarlo por línea.
    -- INFORMATIVO — la cartera oficial sale del mayor (plata_partida_cartera); esto responde
    -- "¿cuánto queda pendiente de ESTA factura?" al lado de su monto. Documentos con total 0
    -- se reparten en partes iguales para no perder el saldo.
    -- El peso lleva coalesce a 0: con una línea de monto nulo y otras con dato, la nula caía
    -- al fallback de partes iguales Y las demás se repartían el 100% — el saldo sumaba de más.
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
left join {{ ref('dim_cliente') }} dc
       on dc.cliente_codigo = l.socio_codigo and dc.empresa_id = l.empresa_id
left join {{ ref('dim_socio_negocio') }} ds
       on ds.socio_codigo = l.socio_codigo and ds.empresa_id = l.empresa_id
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = l.empresa_id and tp.fecha = l.fecha_documento
left join {{ ref('dim_direccion') }} ddir
       on  ddir.empresa_id       = l.empresa_id
       and ddir.socio_codigo     = l.socio_codigo
       and ddir.tipo             = 'entrega'
       and ddir.direccion_codigo = cab.direccion_entrega_codigo
left join {{ ref('dim_producto') }} dp
       on dp.producto_codigo = l.producto_codigo and dp.empresa_id = l.empresa_id
left join {{ ref('dim_vendedor') }} dv
       on dv.vendedor_codigo = l.vendedor_codigo and dv.empresa_id = l.empresa_id
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
       on dtd.tipo_documento_codigo = 'venta_' || l.tipo_documento
where l.flujo = 'venta'
