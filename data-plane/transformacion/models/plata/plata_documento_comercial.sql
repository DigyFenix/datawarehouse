{#
  Cabecera del documento comercial: VENTA Y COMPRA en la misma tabla, discriminadas por `flujo`.

  La unificación ocurre SOLO aquí (Plata = costura agnóstica): SAP B1 trae los documentos en
  4 tablas y Odoo en 1, así que unificar evita duplicar el mapeo. En Oro se separa por proceso
  de negocio (hecho_venta_linea / hecho_compra_linea) para que Power BI y el agente no puedan
  mezclar totales.

  REGLAS DE NEGOCIO QUE VIVEN AQUÍ (no en el mapeo):
    - signo: nota de crédito ⇒ negativo, en un solo lugar.
    - exclusión de borradores y cancelados (ya filtrados en el origen por el paquete base).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

{%- set documentos = [
      ('oinv', 'venta',  'factura'),
      ('orin', 'venta',  'nota_credito'),
      ('opch', 'compra', 'factura'),
      ('orpc', 'compra', 'nota_credito')
   ] -%}

{% for tabla, flujo, tipo in documentos %}
{%- set signo = -1 if tipo == 'nota_credito' else 1 %}
select
    empresa_id,
    datos->>'DocEntry'                                        as documento_id,
    datos->>'DocNum'                                          as documento_numero,
    '{{ flujo }}'::text                                       as flujo,
    '{{ tipo }}'::text                                        as tipo_documento,
    datos->>'ObjType'                                         as tipo_documento_origen,
    null::text                                                as documento_referencia,
    nullif(trim(datos->>'NumAtCard'), '')                     as referencia_externa,
    datos->>'CardCode'                                        as socio_codigo,
    nullif(datos->>'SlpCode', '-1')                           as vendedor_codigo,
    (nullif(datos->>'DocDate', ''))::date                     as fecha_documento,
    (nullif(datos->>'DocDueDate', ''))::date                  as fecha_vencimiento,
    (nullif(datos->>'TaxDate', ''))::date                     as fecha_registro,
    nullif(trim(datos->>'DocCur'), '')                        as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    (nullif(datos->>'DocRate', ''))::numeric(18,6)            as tipo_cambio,
    -- Montos: TODOS los ejes. `DocTotal` de SAP B1 está en moneda LOCAL y `DocTotalFC` en
    -- la del documento; la base sin impuesto se obtiene restando el IVA.
    {{ signo }} * ((nullif(datos->>'DocTotalFC',''))::numeric(18,4)
                 - coalesce((nullif(datos->>'VatSumFC',''))::numeric(18,4), 0))
                                                              as total_sin_impuesto_doc,
    {{ signo }} * coalesce((nullif(datos->>'VatSumFC',''))::numeric(18,4), 0)
                                                              as total_impuesto_doc,
    {{ signo }} * (nullif(datos->>'DocTotalFC',''))::numeric(18,4)
                                                              as total_con_impuesto_doc,
    {{ signo }} * ((nullif(datos->>'DocTotal',''))::numeric(18,4)
                 - coalesce((nullif(datos->>'VatSum',''))::numeric(18,4), 0))
                                                              as total_sin_impuesto_local,
    {{ signo }} * coalesce((nullif(datos->>'VatSum',''))::numeric(18,4), 0)
                                                              as total_impuesto_local,
    {{ signo }} * (nullif(datos->>'DocTotal',''))::numeric(18,4)
                                                              as total_con_impuesto_local,
    {{ signo }} * coalesce((nullif(datos->>'DiscSum',''))::numeric(18,4), 0)
                                                              as total_descuento_local,
    -- INFORMATIVO: la cartera NO se calcula de aquí (ver plata_partida_cartera).
    {{ signo }} * ((nullif(datos->>'DocTotal',''))::numeric(18,4)
                 - coalesce((nullif(datos->>'PaidToDate',''))::numeric(18,4), 0))
                                                              as saldo_documento_local,
    case datos->>'DocStatus' when 'O' then 'abierto' when 'C' then 'cerrado' else 'otro' end
                                                              as estado,
    case datos->>'DocStatus' when 'O' then 'no_pagado' else 'pagado' end as estado_pago,
    datos->>'CreateDate'                                      as creado_en,
    datos->>'UpdateDate'                                      as actualizado_en,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', tabla) }}
{% if not loop.last %}union all{% endif %}
{% endfor %}

{% else %}

-- Odoo: un solo origen. `move_type` da flujo y tipo; los asientos manuales ('entry') NO son
-- documentos comerciales (no tienen líneas de producto ni total facturado) y se excluyen:
-- entran a la cartera por el mayor, que es donde corresponde.
select
    empresa_id,
    datos->>'id'                                              as documento_id,
    datos->>'name'                                            as documento_numero,
    case when datos->>'move_type' like 'out_%' then 'venta' else 'compra' end as flujo,
    case when datos->>'move_type' like '%_refund' then 'nota_credito' else 'factura' end
                                                              as tipo_documento,
    datos->>'move_type'                                       as tipo_documento_origen,
    nullif(datos->>'reversed_entry_id', '')                   as documento_referencia,
    nullif(trim(datos->>'ref'), '')                           as referencia_externa,
    nullif(datos->>'partner_id', '')                          as socio_codigo,
    nullif(datos->>'invoice_user_id', '')                     as vendedor_codigo,
    (nullif(datos->>'invoice_date', ''))::date                as fecha_documento,
    (nullif(datos->>'invoice_date_due', ''))::date            as fecha_vencimiento,
    (nullif(datos->>'date', ''))::date                        as fecha_registro,
    nullif(datos->>'currency_id', '')                         as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    -- Odoo no guarda la tasa: se deduce de local/documento cuando ambos existen.
    case when coalesce((nullif(datos->>'amount_total',''))::numeric, 0) <> 0
         then round(abs((nullif(datos->>'amount_total_signed',''))::numeric
                      / (nullif(datos->>'amount_total',''))::numeric), 6)
    end::numeric(18,6)                                        as tipo_cambio,
    -- En Odoo los *_signed ya vienen con el signo correcto de la nota de crédito y en
    -- moneda de la compañía; los sin sufijo están en moneda del documento y en positivo.
    case when datos->>'move_type' like '%_refund' then -1 else 1 end
        * (nullif(datos->>'amount_untaxed', ''))::numeric(18,4)  as total_sin_impuesto_doc,
    case when datos->>'move_type' like '%_refund' then -1 else 1 end
        * (nullif(datos->>'amount_tax', ''))::numeric(18,4)      as total_impuesto_doc,
    case when datos->>'move_type' like '%_refund' then -1 else 1 end
        * (nullif(datos->>'amount_total', ''))::numeric(18,4)    as total_con_impuesto_doc,
    (nullif(datos->>'amount_untaxed_signed', ''))::numeric(18,4) as total_sin_impuesto_local,
    (nullif(datos->>'amount_total_signed', ''))::numeric(18,4)
      - (nullif(datos->>'amount_untaxed_signed', ''))::numeric(18,4) as total_impuesto_local,
    (nullif(datos->>'amount_total_signed', ''))::numeric(18,4)   as total_con_impuesto_local,
    0::numeric(18,4)                                          as total_descuento_local,
    (nullif(datos->>'amount_residual', ''))::numeric(18,4)     as saldo_documento_local,
    case when coalesce((nullif(datos->>'amount_residual',''))::numeric, 0) <> 0
         then 'abierto' else 'cerrado' end                    as estado,
    datos->>'payment_state'                                   as estado_pago,
    datos->>'create_date'                                     as creado_en,
    datos->>'write_date'                                      as actualizado_en,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'account_move') }}
where datos->>'move_type' in ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')

{% endif %}
