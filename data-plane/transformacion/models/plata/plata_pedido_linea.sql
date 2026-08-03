{#
  PEDIDOS DE VENTA a nivel línea (canónico). El primer objeto del FUNNEL: hasta ahora el
  modelo arrancaba en la factura (resultado); el pedido agrega lo COMPROMETIDO — backlog,
  fill rate y tiempo pedido→factura.

  Homologación clave entre ERPs:
    · cantidad_abierta = lo pendiente de cumplir. SAP B1 lo trae directo (RDR1.OpenQty);
      en Odoo se deriva: cantidad pedida − cantidad facturada (piso 0).
    · Solo pedidos VIGENTES y CONFIRMADOS: SAP excluye cancelados en el ORIGEN
      (CANCELED='N'); Odoo extrae solo state in ('sale','done').
    · Montos: SAP trae la base local directa (LineTotal). Odoo va en la MONEDA DE LA
      ORDEN: la conversión a local usa el tipo de cambio del día más reciente ≤ fecha
      del pedido (mismo criterio que el resto del paquete).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

with moneda_local_erp as (
    select empresa_id, min(moneda_codigo) as moneda_codigo
    from {{ ref('plata_moneda') }}
    where es_local
    group by empresa_id
)

select
    l.empresa_id,
    l.datos->>'DocEntry'                                      as pedido_id,
    c.datos->>'DocNum'                                        as pedido_numero,
    nullif(c.datos->>'Series', '')                            as serie_codigo,
    (l.datos->>'LineNum')::int                                as linea_numero,
    (nullif(c.datos->>'DocDate', ''))::date                   as fecha_pedido,
    (nullif(c.datos->>'DocDueDate', ''))::date                as fecha_entrega,
    nullif(trim(c.datos->>'CardCode'), '')                    as socio_codigo,
    nullif(c.datos->>'SlpCode', '')                           as vendedor_codigo,
    nullif(trim(l.datos->>'ItemCode'), '')                    as producto_codigo,
    nullif(trim(l.datos->>'Dscription'), '')                  as descripcion_linea,
    nullif(trim(l.datos->>'WhsCode'), '')                     as almacen_codigo,
    case when c.datos->>'DocStatus' = 'O' then 'abierto' else 'cerrado' end as estado,
    case when l.datos->>'LineStatus' = 'O' then 'abierta' else 'cerrada' end as estado_linea,
    coalesce((nullif(l.datos->>'Quantity',''))::numeric(18,4), 0)  as cantidad,
    coalesce((nullif(l.datos->>'OpenQty',''))::numeric(18,4), 0)   as cantidad_abierta,
    null::numeric(18,4)                                       as cantidad_entregada,
    coalesce((nullif(l.datos->>'Price',''))::numeric(18,6), 0)     as precio_unitario_doc,
    coalesce((nullif(l.datos->>'DiscPrcnt',''))::numeric(18,6), 0) as descuento_pct,
    coalesce((nullif(l.datos->>'LineTotal',''))::numeric(18,4), 0) as monto_sin_impuesto_local,
    -- TotalFrgn solo se llena en moneda extranjera: en pedido local el eje _doc es el local.
    coalesce(nullif((nullif(l.datos->>'TotalFrgn',''))::numeric(18,4), 0),
             (nullif(l.datos->>'LineTotal',''))::numeric(18,4), 0) as monto_sin_impuesto_doc,
    -- Backlog en moneda local, prorrateado por cantidad (robusto en multi-moneda).
    case when coalesce((nullif(l.datos->>'Quantity',''))::numeric, 0) <> 0
         then round(coalesce((nullif(l.datos->>'LineTotal',''))::numeric(18,4), 0)
                    * coalesce((nullif(l.datos->>'OpenQty',''))::numeric, 0)
                    / (nullif(l.datos->>'Quantity',''))::numeric, 4)
         else 0 end                                           as monto_abierto_local,
    coalesce(nullif(trim(c.datos->>'DocCur'), ''), ml.moneda_codigo) as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    {{ columnas_trazabilidad('l') }}
from {{ source('bronce', 'rdr1') }} l
join {{ source('bronce', 'ordr') }} c
     on c.datos->>'DocEntry' = l.datos->>'DocEntry'
    and c.empresa_id         = l.empresa_id
left join moneda_local_erp ml on ml.empresa_id = l.empresa_id

{% else %}

select
    l.empresa_id,
    l.datos->>'order_id'                                      as pedido_id,
    c.datos->>'name'                                          as pedido_numero,
    null::text                                                as serie_codigo,
    (l.datos->>'id')::int                                     as linea_numero,
    (nullif(c.datos->>'date_order', ''))::date                as fecha_pedido,
    (nullif(c.datos->>'commitment_date', ''))::date           as fecha_entrega,
    nullif(c.datos->>'partner_id', '')                        as socio_codigo,
    nullif(c.datos->>'user_id', '')                           as vendedor_codigo,
    nullif(l.datos->>'product_id', '')                        as producto_codigo,
    nullif(trim(l.datos->>'name'), '')                        as descripcion_linea,
    null::text                                                as almacen_codigo,
    -- El pedido queda 'cerrado' cuando ya no hay nada pendiente de facturar.
    case when c.datos->>'invoice_status' = 'invoiced' then 'cerrado' else 'abierto' end as estado,
    case when coalesce((nullif(l.datos->>'product_uom_qty',''))::numeric, 0)
              - coalesce((nullif(l.datos->>'qty_invoiced',''))::numeric, 0) > 0
         then 'abierta' else 'cerrada' end                    as estado_linea,
    coalesce((nullif(l.datos->>'product_uom_qty',''))::numeric(18,4), 0) as cantidad,
    greatest(coalesce((nullif(l.datos->>'product_uom_qty',''))::numeric(18,4), 0)
             - coalesce((nullif(l.datos->>'qty_invoiced',''))::numeric(18,4), 0), 0)
                                                              as cantidad_abierta,
    coalesce((nullif(l.datos->>'qty_delivered',''))::numeric(18,4), 0) as cantidad_entregada,
    coalesce((nullif(l.datos->>'price_unit',''))::numeric(18,6), 0)    as precio_unitario_doc,
    coalesce((nullif(l.datos->>'discount',''))::numeric(18,6), 0)      as descuento_pct,
    -- Conversión a local con la tasa vigente al día del pedido (1 si la orden va en local).
    round(coalesce((nullif(l.datos->>'price_subtotal',''))::numeric(18,4), 0)
          * coalesce(tc.tasa, 1), 4)                          as monto_sin_impuesto_local,
    coalesce((nullif(l.datos->>'price_subtotal',''))::numeric(18,4), 0) as monto_sin_impuesto_doc,
    round(
        case when coalesce((nullif(l.datos->>'product_uom_qty',''))::numeric, 0) <> 0
             then coalesce((nullif(l.datos->>'price_subtotal',''))::numeric(18,4), 0)
                  * coalesce(tc.tasa, 1)
                  * greatest(coalesce((nullif(l.datos->>'product_uom_qty',''))::numeric, 0)
                             - coalesce((nullif(l.datos->>'qty_invoiced',''))::numeric, 0), 0)
                  / (nullif(l.datos->>'product_uom_qty',''))::numeric
             else 0 end, 4)                                   as monto_abierto_local,
    coalesce(nullif(trim(rc.datos->>'name'), ''), c.datos->>'currency_id') as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    {{ columnas_trazabilidad('l') }}
from {{ source('bronce', 'sale_order_line') }} l
join {{ source('bronce', 'sale_order') }} c
     on c.datos->>'id' = l.datos->>'order_id'
    and c.empresa_id   = l.empresa_id
left join {{ source('bronce', 'res_currency') }} rc
       on rc.datos->>'id' = c.datos->>'currency_id'
      and rc.empresa_id   = c.empresa_id
left join lateral (
    -- Última tasa conocida a la fecha del pedido, solo si la orden NO va en moneda local.
    select t.tasa
    from {{ ref('plata_tipo_cambio') }} t
    join {{ ref('plata_moneda') }} m
      on m.empresa_id = l.empresa_id and m.moneda_codigo = nullif(trim(rc.datos->>'name'), '')
    where t.empresa_id = l.empresa_id
      and t.moneda_codigo = nullif(trim(rc.datos->>'name'), '')
      and t.fecha <= (nullif(c.datos->>'date_order', ''))::date
      and not m.es_local
    order by t.fecha desc
    limit 1
) tc on true

{% endif %}
