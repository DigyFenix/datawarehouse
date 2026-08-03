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

-- SAP B1 solo llena los campos FC (*FC) en documentos de moneda EXTRANJERA: en un documento
-- QTZ vienen en 0. Como en moneda local el monto "en moneda del documento" ES el local, el
-- eje _doc se resuelve con la moneda funcional del ERP — sin esto, el 99.9% de los documentos
-- reportaba 0 en moneda original.
with moneda_local_erp as (
    select empresa_id, min(moneda_codigo) as moneda_codigo
    from {{ ref('plata_moneda') }}
    where es_local
    group by empresa_id
)

{% for tabla, flujo, tipo in documentos %}
{%- set signo = -1 if tipo == 'nota_credito' else 1 %}
{%- set es_fc = "nullif(trim(d.datos->>'DocCur'), '') is distinct from ml.moneda_codigo" %}
select
    d.empresa_id,
    d.datos->>'DocEntry'                                      as documento_id,
    d.datos->>'DocNum'                                        as documento_numero,
    '{{ flujo }}'::text                                       as flujo,
    '{{ tipo }}'::text                                        as tipo_documento,
    d.datos->>'ObjType'                                       as tipo_documento_origen,
    -- Serie de numeración del ERP: con DocNum + Series + ObjType el documento se
    -- rastrea sin ambigüedad en SAP B1 (el DocNum se repite entre series).
    nullif(trim(d.datos->>'Series'), '')                      as serie_codigo,
    null::text                                                as documento_referencia,
    nullif(trim(d.datos->>'NumAtCard'), '')                   as referencia_externa,
    -- Dirección de ENTREGA del documento: referencia a CRD1 (CardCode+'S'+Address).
    nullif(trim(d.datos->>'ShipToCode'), '')                  as direccion_entrega_codigo,
    d.datos->>'CardCode'                                      as socio_codigo,
    nullif(d.datos->>'SlpCode', '-1')                         as vendedor_codigo,
    (nullif(d.datos->>'DocDate', ''))::date                   as fecha_documento,
    (nullif(d.datos->>'DocDueDate', ''))::date                as fecha_vencimiento,
    (nullif(d.datos->>'TaxDate', ''))::date                   as fecha_registro,
    nullif(trim(d.datos->>'DocCur'), '')                      as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    (nullif(d.datos->>'DocRate', ''))::numeric(18,6)          as tipo_cambio,
    -- Montos: TODOS los ejes. `DocTotal` de SAP B1 está en moneda LOCAL y `DocTotalFC` en
    -- la del documento (solo en moneda extranjera); la base sin impuesto resta el IVA.
    -- RETENCIÓN (WTSum): DocTotal llega NETO de retención (DocTotal = base + IVA − WTSum;
    -- verificado al centavo en Proavisa El Salvador, retención del 1%). La retención es un
    -- fenómeno de COBRO, no una reducción de la venta: la base y el "con impuesto" la suman
    -- de vuelta para que cuadren con las líneas y con el negocio.
    {{ signo }} * (case when {{ es_fc }}
        then (nullif(d.datos->>'DocTotalFC',''))::numeric(18,4)
           - coalesce((nullif(d.datos->>'VatSumFC',''))::numeric(18,4), 0)
           + coalesce((nullif(d.datos->>'WTSumFC',''))::numeric(18,4), 0)
        else (nullif(d.datos->>'DocTotal',''))::numeric(18,4)
           - coalesce((nullif(d.datos->>'VatSum',''))::numeric(18,4), 0)
           + coalesce((nullif(d.datos->>'WTSum',''))::numeric(18,4), 0) end)
                                                              as total_sin_impuesto_doc,
    {{ signo }} * (case when {{ es_fc }}
        then coalesce((nullif(d.datos->>'VatSumFC',''))::numeric(18,4), 0)
        else coalesce((nullif(d.datos->>'VatSum',''))::numeric(18,4), 0) end)
                                                              as total_impuesto_doc,
    {{ signo }} * (case when {{ es_fc }}
        then (nullif(d.datos->>'DocTotalFC',''))::numeric(18,4)
           + coalesce((nullif(d.datos->>'WTSumFC',''))::numeric(18,4), 0)
        else (nullif(d.datos->>'DocTotal',''))::numeric(18,4)
           + coalesce((nullif(d.datos->>'WTSum',''))::numeric(18,4), 0) end)
                                                              as total_con_impuesto_doc,
    {{ signo }} * ((nullif(d.datos->>'DocTotal',''))::numeric(18,4)
                 - coalesce((nullif(d.datos->>'VatSum',''))::numeric(18,4), 0)
                 + coalesce((nullif(d.datos->>'WTSum',''))::numeric(18,4), 0))
                                                              as total_sin_impuesto_local,
    {{ signo }} * coalesce((nullif(d.datos->>'VatSum',''))::numeric(18,4), 0)
                                                              as total_impuesto_local,
    {{ signo }} * ((nullif(d.datos->>'DocTotal',''))::numeric(18,4)
                 + coalesce((nullif(d.datos->>'WTSum',''))::numeric(18,4), 0))
                                                              as total_con_impuesto_local,
    {{ signo }} * coalesce((nullif(d.datos->>'DiscSum',''))::numeric(18,4), 0)
                                                              as total_descuento_local,
    -- INFORMATIVO: la cartera NO se calcula de aquí (ver plata_partida_cartera).
    {{ signo }} * ((nullif(d.datos->>'DocTotal',''))::numeric(18,4)
                 - coalesce((nullif(d.datos->>'PaidToDate',''))::numeric(18,4), 0))
                                                              as saldo_documento_local,
    case d.datos->>'DocStatus' when 'O' then 'abierto' when 'C' then 'cerrado' else 'otro' end
                                                              as estado,
    case d.datos->>'DocStatus' when 'O' then 'no_pagado' else 'pagado' end as estado_pago,
    d.datos->>'CreateDate'                                    as creado_en,
    d.datos->>'UpdateDate'                                    as actualizado_en,
    {{ columnas_trazabilidad('d') }}
from {{ source('bronce', tabla) }} d
left join moneda_local_erp ml
       on ml.empresa_id = d.empresa_id
{% if not loop.last %}union all{% endif %}
{% endfor %}

{% else %}

-- Odoo: un solo origen. `move_type` da flujo y tipo; los asientos manuales ('entry') NO son
-- documentos comerciales (no tienen líneas de producto ni total facturado) y se excluyen:
-- entran a la cartera por el mayor, que es donde corresponde.
select
    m.empresa_id,
    m.datos->>'id'                                            as documento_id,
    m.datos->>'name'                                          as documento_numero,
    case when m.datos->>'move_type' like 'out_%' then 'venta' else 'compra' end as flujo,
    case when m.datos->>'move_type' like '%_refund' then 'nota_credito' else 'factura' end
                                                              as tipo_documento,
    m.datos->>'move_type'                                     as tipo_documento_origen,
    -- Serie: el prefijo de numeración (INV/2026/...); si no se extrajo, se deduce del name.
    coalesce(nullif(trim(m.datos->>'sequence_prefix'), ''),
             nullif(split_part(m.datos->>'name', '/', 1), '')) as serie_codigo,
    nullif(m.datos->>'reversed_entry_id', '')                 as documento_referencia,
    nullif(trim(m.datos->>'ref'), '')                         as referencia_externa,
    -- Dirección de ENTREGA: en Odoo es un res_partner hijo (partner_shipping_id).
    nullif(trim(m.datos->>'partner_shipping_id'), '')         as direccion_entrega_codigo,
    nullif(m.datos->>'partner_id', '')                        as socio_codigo,
    nullif(m.datos->>'invoice_user_id', '')                   as vendedor_codigo,
    (nullif(m.datos->>'invoice_date', ''))::date              as fecha_documento,
    (nullif(m.datos->>'invoice_date_due', ''))::date          as fecha_vencimiento,
    (nullif(m.datos->>'date', ''))::date                      as fecha_registro,
    -- `currency_id` es un id numérico: se traduce al código ('GTQ') con res_currency.
    -- Sin la traducción, el join a dim_moneda no casa nunca y todo cae al miembro -1.
    coalesce(nullif(trim(rc.datos->>'name'), ''), m.datos->>'currency_id')
                                                              as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    -- Odoo no guarda la tasa: se deduce de local/documento cuando ambos existen.
    case when coalesce((nullif(m.datos->>'amount_total',''))::numeric, 0) <> 0
         then round(abs((nullif(m.datos->>'amount_total_signed',''))::numeric
                      / (nullif(m.datos->>'amount_total',''))::numeric), 6)
    end::numeric(18,6)                                        as tipo_cambio,
    -- En Odoo los *_signed ya vienen con el signo correcto de la nota de crédito y en
    -- moneda de la compañía; los sin sufijo están en moneda del documento y en positivo.
    case when m.datos->>'move_type' like '%_refund' then -1 else 1 end
        * (nullif(m.datos->>'amount_untaxed', ''))::numeric(18,4)  as total_sin_impuesto_doc,
    case when m.datos->>'move_type' like '%_refund' then -1 else 1 end
        * (nullif(m.datos->>'amount_tax', ''))::numeric(18,4)      as total_impuesto_doc,
    case when m.datos->>'move_type' like '%_refund' then -1 else 1 end
        * (nullif(m.datos->>'amount_total', ''))::numeric(18,4)    as total_con_impuesto_doc,
    -- OJO con los *_signed: su signo es la PERSPECTIVA DE LA COMPAÑÍA (venta positiva, compra
    -- negativa). La convención canónica es factura POSITIVA y NC negativa EN AMBOS FLUJOS —la
    -- misma de SAP B1—, así que en compra se invierte. Sin esto, "Compras netas" del tenant
    -- Odoo salía negativa y la de SAP positiva: el mismo indicador con signo distinto por ERP.
    case when m.datos->>'move_type' like 'out_%' then 1 else -1 end
        * (nullif(m.datos->>'amount_untaxed_signed', ''))::numeric(18,4) as total_sin_impuesto_local,
    case when m.datos->>'move_type' like 'out_%' then 1 else -1 end
        * ((nullif(m.datos->>'amount_total_signed', ''))::numeric(18,4)
         - (nullif(m.datos->>'amount_untaxed_signed', ''))::numeric(18,4)) as total_impuesto_local,
    case when m.datos->>'move_type' like 'out_%' then 1 else -1 end
        * (nullif(m.datos->>'amount_total_signed', ''))::numeric(18,4) as total_con_impuesto_local,
    0::numeric(18,4)                                          as total_descuento_local,
    -- `amount_residual` está en MONEDA DEL DOCUMENTO y positivo incluso en NC; el local con
    -- signo es `amount_residual_signed` (perspectiva compañía: compra negativa → se invierte
    -- con el mismo factor que los totales). El fallback al residual crudo cubre bronce viejo
    -- sin el campo — correcto solo en monomoneda.
    case when m.datos ? 'amount_residual_signed'
         then (case when m.datos->>'move_type' like 'out_%' then 1 else -1 end)
            * (nullif(m.datos->>'amount_residual_signed', ''))::numeric(18,4)
         else (case when m.datos->>'move_type' like '%_refund' then -1 else 1 end)
            * (nullif(m.datos->>'amount_residual', ''))::numeric(18,4)
    end                                                       as saldo_documento_local,
    case when coalesce((nullif(m.datos->>'amount_residual',''))::numeric, 0) <> 0
         then 'abierto' else 'cerrado' end                    as estado,
    m.datos->>'payment_state'                                 as estado_pago,
    m.datos->>'create_date'                                   as creado_en,
    m.datos->>'write_date'                                    as actualizado_en,
    {{ columnas_trazabilidad('m') }}
from {{ source('bronce', 'account_move') }} m
left join {{ source('bronce', 'res_currency') }} rc
       on rc.datos->>'id' = m.datos->>'currency_id'
      and rc.empresa_id   = m.empresa_id
where m.datos->>'move_type' in ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')

{% endif %}
