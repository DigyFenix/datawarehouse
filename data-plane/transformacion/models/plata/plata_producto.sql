{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    datos->>'ItemCode'                                as producto_codigo,
    trim(datos->>'ItemName')                          as nombre,
    nullif(datos->>'ItmsGrpCod', '')                  as grupo_codigo,
    -- OITB (nombre del grupo) no está en el paquete base SAP: queda null hasta extraerlo.
    null::text                                        as grupo_nombre,
    -- Precio de lista: en SAP B1 vive en ITM1 (listas de precios), no en OITM: null hasta extraerlo.
    null::numeric(18,4)                               as precio_lista,
    nullif(trim(datos->>'InvntryUom'), '')            as unidad_medida,
    case when datos->>'InvntItem' = 'Y' then 'bien' else 'servicio' end as tipo_producto,
    coalesce(datos->>'validFor', 'Y') = 'Y'           as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'oitm') }}

{% else %}

-- La variante lleva la referencia y el estado; la plantilla el nombre y la categoría.
select
    v.empresa_id,
    v.datos->>'product_tmpl_id'                       as producto_codigo,
    {{ odoo_texto('t.datos', 'name') }}               as nombre,
    nullif(t.datos->>'categ_id', '')                  as grupo_codigo,
    -- Nombre de la categoría: `name` es texto plano en product_category (no jsonb).
    coalesce(nullif(trim(c.datos->>'name'), ''), nullif(trim(c.datos->>'complete_name'), ''))
                                                      as grupo_nombre,
    (nullif(t.datos->>'list_price', ''))::numeric(18,4) as precio_lista,
    nullif(t.datos->>'uom_id', '')                    as unidad_medida,
    case when t.datos->>'type' = 'service' then 'servicio' else 'bien' end as tipo_producto,
    coalesce((v.datos->>'active')::boolean, true)      as activo,
    {{ columnas_trazabilidad('v') }}
from {{ source('bronce', 'product_product') }} v
left join {{ source('bronce', 'product_template') }} t
       on t.datos->>'id' = v.datos->>'product_tmpl_id'
      and t.empresa_id   = v.empresa_id
left join {{ source('bronce', 'product_category') }} c
       on c.datos->>'id' = t.datos->>'categ_id'
      and c.empresa_id   = t.empresa_id

{% endif %}
