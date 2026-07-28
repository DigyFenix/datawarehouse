{#
  EL CORAZÓN DE LA CARTERA: una partida del MAYOR en cuenta por cobrar o por pagar.

  Por qué del mayor y no de las facturas — medido en los dos clientes:
      Iron Network (Odoo) : mayor 553,009.54 vs facturas 468,136.86 → 18.1% de diferencia
      Proavisa (SAP B1)   : mayor 92,013,402.88 vs documentos 92,076,348.59 → 0.07%
  En Odoo la causa es directa: 516 asientos manuales mueven cartera sin pasar por factura.
  En Guatemala además las retenciones de IVA reducen el saldo por cobrar y solo se ven aquí.

  FILTRO OBLIGATORIO: por TIPO DE CUENTA (plata_cuenta), no por "tiene saldo" ni por el tipo
  de línea:
    - por "tiene saldo" a secas: en Proavisa 1,043,823 de 1,732,253 partidas tienen saldo,
      pero la mayoría es inventario y producción, no cartera.
    - por tipo de línea: en Odoo hay 370 líneas `product` apuntando a cuentas por cobrar;
      excluirlas perdería Q22,118.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

with cuentas_cartera as (
    select empresa_id, cuenta_codigo, tipo_cuenta, es_cartera_cobrar, es_cartera_pagar
    from {{ ref('plata_cuenta') }}
    where es_cartera_cobrar or es_cartera_pagar
)

{% if erp == 'sap_b1' %}

select
    j.empresa_id,
    (j.datos->>'TransId') || '-' || (j.datos->>'Line_ID')      as partida_id,
    case when c.es_cartera_cobrar then 'cobrar' else 'pagar' end as tipo_cartera,
    nullif(trim(j.datos->>'ShortName'), '')                   as socio_codigo,
    j.datos->>'Account'                                       as cuenta_codigo,
    coalesce(nullif(trim(j.datos->>'BaseRef'), ''), j.datos->>'TransId') as documento_origen,
    coalesce(o.datos->>'TransType', j.datos->>'TransType')    as tipo_documento_origen,
    -- ObjType 13/14/18/19 son documentos de venta/compra; 30 es asiento manual; el resto
    -- son operaciones que igualmente tocan la cartera (cobros, pagos, ajustes).
    case when coalesce(o.datos->>'TransType', j.datos->>'TransType') in ('13','14','18','19')
         then 'documento' else 'asiento' end                  as origen_partida,
    (nullif(j.datos->>'RefDate', ''))::date                   as fecha_documento,
    (nullif(j.datos->>'DueDate', ''))::date                   as fecha_vencimiento,
    nullif(trim(j.datos->>'FCCurrency'), '')                  as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    coalesce((nullif(j.datos->>'FCDebit',''))::numeric(18,4), 0)
      - coalesce((nullif(j.datos->>'FCCredit',''))::numeric(18,4), 0)
                                                              as monto_original_doc,
    coalesce((nullif(j.datos->>'Debit',''))::numeric(18,4), 0)
      - coalesce((nullif(j.datos->>'Credit',''))::numeric(18,4), 0)
                                                              as monto_original_local,
    coalesce((nullif(j.datos->>'BalFcDeb',''))::numeric(18,4), 0)
      - coalesce((nullif(j.datos->>'BalFcCred',''))::numeric(18,4), 0)
                                                              as saldo_pendiente_doc,
    -- LA MEDIDA DE LA CARTERA.
    coalesce((nullif(j.datos->>'BalDueDeb',''))::numeric(18,4), 0)
      - coalesce((nullif(j.datos->>'BalDueCred',''))::numeric(18,4), 0)
                                                              as saldo_pendiente_local,
    coalesce((nullif(j.datos->>'BalDueDeb',''))::numeric(18,4), 0)
      <> coalesce((nullif(j.datos->>'BalDueCred',''))::numeric(18,4), 0)
                                                              as esta_abierta,
    null::boolean                                             as conciliada,
    nullif(trim(j.datos->>'LineMemo'), '')                    as descripcion_partida,
    {{ columnas_trazabilidad('j') }}
from {{ source('bronce', 'jdt1') }} j
join cuentas_cartera c
     on c.cuenta_codigo = j.datos->>'Account'
    and c.empresa_id    = j.empresa_id
left join {{ source('bronce', 'ojdt') }} o
     on o.datos->>'TransId' = j.datos->>'TransId'
    and o.empresa_id        = j.empresa_id

{% else %}

select
    l.empresa_id,
    l.datos->>'id'                                            as partida_id,
    case when c.es_cartera_cobrar then 'cobrar' else 'pagar' end as tipo_cartera,
    nullif(l.datos->>'partner_id', '')                        as socio_codigo,
    l.datos->>'account_id'                                    as cuenta_codigo,
    l.datos->>'move_id'                                       as documento_origen,
    m.datos->>'move_type'                                     as tipo_documento_origen,
    -- En Odoo `display_type` revela el ORIGEN de la partida: 'payment_term' es la contrapartida
    -- de una factura; 'product' en cuenta de cartera viene de un asiento manual.
    case when l.datos->>'display_type' = 'payment_term'
         then 'documento' else 'asiento' end                  as origen_partida,
    coalesce((nullif(m.datos->>'invoice_date', ''))::date,
             (nullif(l.datos->>'date', ''))::date)            as fecha_documento,
    (nullif(l.datos->>'date_maturity', ''))::date             as fecha_vencimiento,
    nullif(l.datos->>'currency_id', '')                       as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    coalesce((nullif(l.datos->>'amount_currency',''))::numeric(18,4), 0)
                                                              as monto_original_doc,
    coalesce((nullif(l.datos->>'balance',''))::numeric(18,4), 0)
                                                              as monto_original_local,
    coalesce((nullif(l.datos->>'amount_residual_currency',''))::numeric(18,4), 0)
                                                              as saldo_pendiente_doc,
    -- LA MEDIDA DE LA CARTERA.
    coalesce((nullif(l.datos->>'amount_residual',''))::numeric(18,4), 0)
                                                              as saldo_pendiente_local,
    coalesce((nullif(l.datos->>'amount_residual',''))::numeric(18,4), 0) <> 0
                                                              as esta_abierta,
    coalesce((l.datos->>'reconciled')::boolean, false)         as conciliada,
    nullif(trim(l.datos->>'name'), '')                        as descripcion_partida,
    {{ columnas_trazabilidad('l') }}
from {{ source('bronce', 'account_move_line') }} l
join cuentas_cartera c
     on c.cuenta_codigo = l.datos->>'account_id'
    and c.empresa_id    = l.empresa_id
left join {{ source('bronce', 'account_move') }} m
     on m.datos->>'id' = l.datos->>'move_id'
    and m.empresa_id   = l.empresa_id

{% endif %}
