{#
  HECHO DE PAGOS RECIBIDOS (cobros) — grano: un documento de pago. Dominio `tesoreria`.

  Separado de hecho_pago_efectuado por el mismo motivo que ventas/compras: con una tabla mixta
  toda medida necesitaría filtrar por tipo y arrastrar el monto sumaría cobros + pagos.

  INFORMATIVO para flujo de caja y comportamiento de cobro; el saldo de cartera sigue saliendo
  del mayor (hecho_cartera_cobrar), donde el pago ya impactó como partida conciliada.
#}
{{ config(materialized='table') }}

select
    {{ clave_tiempo('p.fecha_pago') }}
                                                      as tiempo_clave,
    {{ clave_o_no_definido('dc', 'cliente_clave') }}  as cliente_clave,
    {{ clave_o_no_definido('ds', 'socio_clave') }}    as socio_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,

    p.empresa_id,
    p.pago_id,                                        -- llave de negocio interna (DocEntry / id)
    p.pago_numero,                                    -- número visible (DocNum / name)
    p.serie_codigo,                                   -- serie de numeración: rastreo en el ERP
    p.contraparte,                                    -- cliente | cuenta_contable (tesorería)
    p.fecha_pago,
    p.medio_pago,
    p.referencia,
    p.estado,

    -- Sin sufijo = moneda de PRESENTACIÓN (local ÷ tasa del día del pago); _doc = referencia.
    (p.monto_local / tp.tasa)::numeric(18,4)          as monto,
    p.monto_doc,
    p.tipo_cambio,

    p.proceso_transformacion,
    p.version_proceso
from {{ ref('plata_pago') }} p
left join {{ ref('dim_cliente') }} dc
       on dc.cliente_codigo = p.socio_codigo and dc.empresa_id = p.empresa_id
left join {{ ref('dim_socio_negocio') }} ds
       on ds.socio_codigo = p.socio_codigo and ds.empresa_id = p.empresa_id
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = p.empresa_id and tp.fecha = p.fecha_pago
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = p.empresa_id
left join {{ ref('dim_moneda') }} dm
       on dm.moneda_codigo = p.moneda_documento and dm.empresa_id = p.empresa_id
where p.tipo_pago = 'recibido'
