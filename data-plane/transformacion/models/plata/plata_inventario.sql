{#
  INVENTARIO: existencias y valor por (empresa, almacén, producto). FOTO al momento de la
  extracción — no es kardex: el histórico de movimientos no entra en este corte.

  DÓNDE VIVE EL VALOR EN CADA ERP (no es simétrico):
    - SAP B1: OITW trae cantidad Y costo promedio por bodega → valor = OnHand × AvgPrice.
    - Odoo:   las quants solo traen cantidad; el valor vive en stock_valuation_layer
      (sum(value) por producto, sin almacén). Se prorratea a los almacenes por cantidad.
      Con un solo almacén (Iron Network) el prorrateo es exacto.

  Solo ubicaciones internas en Odoo: customer/supplier/inventory son tránsito o ajuste,
  no existencia propia.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    nullif(trim(datos->>'WhsCode'), '')                       as almacen_codigo,
    nullif(trim(datos->>'ItemCode'), '')                      as producto_codigo,
    coalesce((nullif(datos->>'OnHand',''))::numeric(18,4), 0)  as cantidad,
    (nullif(datos->>'AvgPrice',''))::numeric(18,6)            as costo_promedio,
    -- StockValue es el valor contable del ERP (confirmado con Descubrir, con datos);
    -- OnHand × AvgPrice queda de respaldo si algún tenant no lo trae.
    coalesce((nullif(datos->>'StockValue',''))::numeric(18,4),
        round(coalesce((nullif(datos->>'OnHand',''))::numeric(18,4), 0)
            * coalesce((nullif(datos->>'AvgPrice',''))::numeric(18,6), 0), 4))::numeric(18,4)
                                                              as valor,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'oitw') }}

{% else %}

with ubicaciones_internas as (
    select l.empresa_id,
           l.datos->>'id'                                     as ubicacion_id,
           split_part(l.datos->>'complete_name', '/', 1)      as almacen_prefijo
    from {{ source('bronce', 'stock_location') }} l
    where l.datos->>'usage' = 'internal'
),

quants as (
    select
        q.empresa_id,
        -- El código del almacén en plata_almacen es el id de stock_warehouse: se resuelve
        -- por el prefijo del complete_name (WH/Stock/... → WH).
        sw.datos->>'id'                                       as almacen_codigo,
        q.datos->>'product_id'                                as producto_codigo,
        coalesce((nullif(q.datos->>'quantity',''))::numeric(18,4), 0) as cantidad,
        q.fuente_origen,
        q.extraido_en
    from {{ source('bronce', 'stock_quant') }} q
    join ubicaciones_internas u
         on u.ubicacion_id = q.datos->>'location_id'
        and u.empresa_id   = q.empresa_id
    left join {{ source('bronce', 'stock_warehouse') }} sw
         on trim(sw.datos->>'code') = trim(u.almacen_prefijo)
        and sw.empresa_id           = q.empresa_id
),

-- Valor y costo por PRODUCTO desde las capas de valoración.
valoracion as (
    select
        empresa_id,
        datos->>'product_id'                                  as producto_codigo,
        sum(coalesce((nullif(datos->>'value',''))::numeric(18,4), 0))    as valor_producto,
        sum(coalesce((nullif(datos->>'quantity',''))::numeric(18,4), 0)) as cantidad_valorada
    from {{ source('bronce', 'stock_valuation_layer') }}
    group by 1, 2
)

select
    q.empresa_id,
    q.almacen_codigo,
    q.producto_codigo,
    sum(q.cantidad)                                           as cantidad,
    case when coalesce(v.cantidad_valorada, 0) <> 0
         then round(v.valor_producto / v.cantidad_valorada, 6)
    end::numeric(18,6)                                        as costo_promedio,
    -- Prorrateo del valor del producto entre sus almacenes por cantidad. Si la cantidad
    -- total es 0 (p.ej. +10 y −10 en dos bodegas) se reparte en partes IGUALES: repetir el
    -- valor completo en cada fila lo duplicaría al sumar.
    case when sum(sum(q.cantidad)) over (partition by q.empresa_id, q.producto_codigo) <> 0
         then round(v.valor_producto * sum(q.cantidad)
              / sum(sum(q.cantidad)) over (partition by q.empresa_id, q.producto_codigo), 4)
         else round(v.valor_producto
              / count(*) over (partition by q.empresa_id, q.producto_codigo), 4)
    end::numeric(18,4)                                        as valor,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    max(q.fuente_origen)                                      as fuente_origen,
    max(q.extraido_en)                                        as extraido_en,
    '{{ this.name }}'::text                                   as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text                as version_proceso
from quants q
left join valoracion v
       on v.producto_codigo = q.producto_codigo
      and v.empresa_id      = q.empresa_id
group by q.empresa_id, q.almacen_codigo, q.producto_codigo,
         v.valor_producto, v.cantidad_valorada

{% endif %}
