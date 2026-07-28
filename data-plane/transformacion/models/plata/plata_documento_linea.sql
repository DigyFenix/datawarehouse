{#
  EL GRANO DEL HECHO: una línea de documento comercial (venta o compra).

  Regla dura: `monto_sin_impuesto_*` es SIEMPRE base imponible. En Odoo eso obliga a filtrar
  `display_type='product'`, porque solo el 44% de las líneas de factura son de producto
  (699 de 1,599 en Iron Network): el resto son líneas de impuesto y de plazo de pago, y
  sumarlas inflaría el hecho.

  El signo de la nota de crédito se aplica aquí igual que en la cabecera, para que ambas
  cuadren entre sí.

  `descuento_pct` NO se acota a 0-100 a propósito: el negocio aplica descuentos muy grandes y
  casos especiales para llegar al monto pactado. Es dato legítimo del ERP, no un error, así que
  se conserva tal cual y no entra a cuarentena.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

{#- El pre_hook desactiva los workers paralelos SOLO para este modelo. Motivo: sobre el
    volumen de Docker Desktop (Windows/WSL2) los workers paralelos de Postgres 16 fallan
    con `FileFallocate(): Interrupted system call`, que se reporta como falta de disco
    aunque haya 942 GB libres. No es un problema de este SQL ni del volumen de datos
    (Bronce pesa 76 MB); en un Postgres sobre Linux nativo se puede quitar. -#}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

{%- set documentos = [
      ('inv1', 'oinv', 'venta',  'factura'),
      ('rin1', 'orin', 'venta',  'nota_credito'),
      ('pch1', 'opch', 'compra', 'factura'),
      ('rpc1', 'orpc', 'compra', 'nota_credito')
   ] -%}

{% for tabla_lin, tabla_cab, flujo, tipo in documentos %}
{%- set signo = -1 if tipo == 'nota_credito' else 1 %}
select
    l.empresa_id,
    l.datos->>'DocEntry'                                      as documento_id,
    (l.datos->>'LineNum')::int                                as linea_numero,
    '{{ flujo }}'::text                                       as flujo,
    '{{ tipo }}'::text                                        as tipo_documento,
    (nullif(c.datos->>'DocDate', ''))::date                   as fecha_documento,
    c.datos->>'CardCode'                                      as socio_codigo,
    nullif(c.datos->>'SlpCode', '-1')                         as vendedor_codigo,
    nullif(l.datos->>'ItemCode', '')                          as producto_codigo,
    nullif(trim(l.datos->>'Dscription'), '')                  as descripcion_linea,
    nullif(trim(l.datos->>'WhsCode'), '')                     as almacen_codigo,
    nullif(trim(l.datos->>'OcrCode'), '')                     as centro_costo_codigo,
    nullif(trim(l.datos->>'AcctCode'), '')                    as cuenta_codigo,
    {{ signo }} * (nullif(l.datos->>'Quantity', ''))::numeric(18,4)   as cantidad,
    nullif(trim(l.datos->>'unitMsr'), '')                     as unidad_medida,
    (nullif(l.datos->>'Price', ''))::numeric(18,4)            as precio_unitario_doc,
    (nullif(l.datos->>'PriceBefDi', ''))::numeric(18,4)       as precio_antes_descuento,
    (nullif(l.datos->>'DiscPrcnt', ''))::numeric(18,6)        as descuento_pct,
    {{ signo }} * (nullif(l.datos->>'TotalFrgn', ''))::numeric(18,4)  as monto_sin_impuesto_doc,
    {{ signo }} * coalesce((nullif(l.datos->>'GTotalFC',''))::numeric(18,4), 0)
                - {{ signo }} * coalesce((nullif(l.datos->>'TotalFrgn',''))::numeric(18,4), 0)
                                                              as monto_impuesto_doc,
    {{ signo }} * (nullif(l.datos->>'GTotalFC', ''))::numeric(18,4)   as monto_con_impuesto_doc,
    {{ signo }} * (nullif(l.datos->>'LineTotal', ''))::numeric(18,4)  as monto_sin_impuesto_local,
    {{ signo }} * coalesce((nullif(l.datos->>'VatSum',''))::numeric(18,4), 0)
                                                              as monto_impuesto_local,
    {{ signo }} * (nullif(l.datos->>'GTotal', ''))::numeric(18,4)     as monto_con_impuesto_local,
    0::numeric(18,4)                                          as monto_descuento_local,
    -- `StockPrice` de SAP B1 es el costo UNITARIO, no el de la línea: el costo de la línea es
    -- StockPrice × Quantity. Verificado contra GrssProfit del propio ERP (doc 1600345:
    -- 20,000 × 10.00 = 200,000 y 230,357.14 − 200,000 = 30,357.14 = GrssProfit). Mapearlo
    -- como costo de línea daba un margen del 95% en vez del 22% real.
    -- El signo se aplica UNA vez (sobre el producto), no a cada factor: de lo contrario en las
    -- notas de crédito los dos negativos se cancelaban y el costo quedaba positivo.
    {{ signo }} * coalesce((nullif(l.datos->>'StockPrice',''))::numeric(18,4), 0)
                * coalesce((nullif(l.datos->>'Quantity',''))::numeric(18,4), 0)
                                                              as costo_local,
    {{ signo }} * coalesce((nullif(l.datos->>'GrssProfit',''))::numeric(18,4), 0)
                                                              as margen_local,
    nullif(trim(c.datos->>'DocCur'), '')                      as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    {{ columnas_trazabilidad('l') }}
from {{ source('bronce', tabla_lin) }} l
join {{ source('bronce', tabla_cab) }} c
     on c.datos->>'DocEntry' = l.datos->>'DocEntry'
    and c.empresa_id         = l.empresa_id
{% if not loop.last %}union all{% endif %}
{% endfor %}

{% else %}

select
    l.empresa_id,
    l.datos->>'move_id'                                       as documento_id,
    (l.datos->>'id')::int                                     as linea_numero,
    case when m.datos->>'move_type' like 'out_%' then 'venta' else 'compra' end as flujo,
    case when m.datos->>'move_type' like '%_refund' then 'nota_credito' else 'factura' end
                                                              as tipo_documento,
    (nullif(m.datos->>'invoice_date', ''))::date              as fecha_documento,
    nullif(m.datos->>'partner_id', '')                        as socio_codigo,
    nullif(m.datos->>'invoice_user_id', '')                   as vendedor_codigo,
    nullif(l.datos->>'product_id', '')                        as producto_codigo,
    nullif(trim(l.datos->>'name'), '')                        as descripcion_linea,
    null::text                                                as almacen_codigo,
    -- analytic_distribution es un jsonb {cuenta: porcentaje}. Explotar por porcentaje
    -- rompería el grano del hecho, así que con más de una cuenta se marca MULTIPLE (v1.1).
    -- `jsonb_typeof` es obligatorio: cuando la línea no tiene analítica, Odoo no guarda un
    -- objeto vacío sino un ESCALAR (false/null), y jsonb_object_keys revienta sobre escalares.
    case
        when jsonb_typeof(l.datos->'analytic_distribution') <> 'object' then null
        when (select count(*) from jsonb_object_keys(l.datos->'analytic_distribution')) > 1
            then 'MULTIPLE'
        else (select k from jsonb_object_keys(l.datos->'analytic_distribution') as t(k) limit 1)
    end                                                       as centro_costo_codigo,
    nullif(l.datos->>'account_id', '')                        as cuenta_codigo,
    {{ signo_odoo('m') }} * coalesce((nullif(l.datos->>'quantity',''))::numeric(18,4), 0)
                                                              as cantidad,
    nullif(l.datos->>'product_uom_id', '')                    as unidad_medida,
    (nullif(l.datos->>'price_unit', ''))::numeric(18,4)       as precio_unitario_doc,
    (nullif(l.datos->>'price_unit', ''))::numeric(18,4)       as precio_antes_descuento,
    (nullif(l.datos->>'discount', ''))::numeric(18,6)         as descuento_pct,
    {{ signo_odoo('m') }} * coalesce((nullif(l.datos->>'price_subtotal',''))::numeric(18,4), 0)
                                                              as monto_sin_impuesto_doc,
    {{ signo_odoo('m') }} * (coalesce((nullif(l.datos->>'price_total',''))::numeric(18,4), 0)
                           - coalesce((nullif(l.datos->>'price_subtotal',''))::numeric(18,4), 0))
                                                              as monto_impuesto_doc,
    {{ signo_odoo('m') }} * coalesce((nullif(l.datos->>'price_total',''))::numeric(18,4), 0)
                                                              as monto_con_impuesto_doc,
    -- `balance` (débito−crédito) ya está en moneda de la compañía y con el signo contable:
    -- en una venta la línea de ingreso es crédito (negativa), así que se invierte para que
    -- las ventas queden positivas como en SAP B1.
    -1 * coalesce((nullif(l.datos->>'balance',''))::numeric(18,4), 0)
                                                              as monto_sin_impuesto_local,
    0::numeric(18,4)                                          as monto_impuesto_local,
    -1 * coalesce((nullif(l.datos->>'balance',''))::numeric(18,4), 0)
                                                              as monto_con_impuesto_local,
    0::numeric(18,4)                                          as monto_descuento_local,
    0::numeric(18,4)                                          as costo_local,
    0::numeric(18,4)                                          as margen_local,
    nullif(l.datos->>'currency_id', '')                       as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    {{ columnas_trazabilidad('l') }}
from {{ source('bronce', 'account_move_line') }} l
join {{ source('bronce', 'account_move') }} m
     on m.datos->>'id' = l.datos->>'move_id'
    and m.empresa_id   = l.empresa_id
-- SOLO líneas de producto, y solo de documentos comerciales.
where l.datos->>'display_type' = 'product'
  and m.datos->>'move_type' in ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')

{% endif %}
