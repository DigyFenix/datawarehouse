{#
  PAGOS: cobros a clientes (recibido) y pagos a proveedores (efectuado) en la misma tabla,
  discriminados por `tipo_pago` — el mismo patrón de unificación que plata_documento_comercial.

  QUÉ ES Y QUÉ NO ES:
    - Es el DOCUMENTO de pago (quién pagó, cuándo, con qué medio, cuánto). Sirve para analizar
      flujo de cobros/pagos por día, socio y medio.
    - NO es la fuente del saldo de cartera: el saldo sigue saliendo del MAYOR
      (plata_partida_cartera). Un pago mal aplicado no descuadra la cartera de este modelo.

  REGLAS DE NEGOCIO:
    - SAP B1: ORCT/OVPM no tienen DocTotal; el monto es la suma de los medios de pago
      (efectivo + cheque + transferencia + tarjeta). `Canceled = 'N'` obligatorio — la misma
      trampa de los documentos: cada pago anulado ('Y') genera su documento de cancelación ('C')
      por el mismo importe.
    - Odoo: account_payment. Se excluyen borradores, cancelados y rechazados. El monto local
      llega firmado (negativo en outbound); se toma en valor absoluto porque el flujo ya lo da
      `tipo_pago` — ambos tipos quedan positivos, como en SAP B1.
    - Ambos tipos POSITIVOS: los hechos de Oro se separan por tipo, un SUM simple es correcto.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

{%- set tablas_pago = [('orct', 'recibido'), ('ovpm', 'efectuado')] -%}

-- Moneda funcional del ERP para resolver el eje _doc de los pagos en moneda local
-- (mismo criterio que en documentos y cartera).
with moneda_local_erp as (
    select empresa_id, min(moneda_codigo) as moneda_codigo
    from {{ ref('plata_moneda') }}
    where es_local
    group by empresa_id
)

{% for tabla, tipo in tablas_pago %}
select
    p.empresa_id,
    pago_id,
    pago_numero,
    serie_codigo,
    tipo_pago,
    contraparte,
    socio_codigo,
    fecha_pago,
    fecha_registro,
    coalesce(moneda_documento, ml.moneda_codigo)              as moneda_documento,
    moneda_local,
    tipo_cambio,
    -- Los *SumFC solo se llenan en moneda extranjera: pago en moneda local → eje _doc = local.
    -- En moneda extranjera SIN los *SumFC extraídos (hoy van excluidos hasta confirmarlos con
    -- Descubrir) el nullif deja NULL en vez de un 0 con apariencia de dato.
    case when moneda_documento is not null and moneda_documento is distinct from ml.moneda_codigo
         then nullif(monto_efectivo_doc + monto_cheque_doc + monto_transferencia_doc + monto_tarjeta_doc, 0)
         else (monto_efectivo + monto_cheque + monto_transferencia + monto_tarjeta) end
                                                              as monto_doc,
    (monto_efectivo + monto_cheque + monto_transferencia + monto_tarjeta)
                                                              as monto_local,
    -- Medio dominante: con un solo medio distinto de cero se nombra; con varios, 'mixto'.
    case (monto_efectivo <> 0)::int + (monto_cheque <> 0)::int
       + (monto_transferencia <> 0)::int + (monto_tarjeta <> 0)::int
        when 0 then null
        when 1 then case when monto_efectivo <> 0      then 'efectivo'
                         when monto_cheque <> 0        then 'cheque'
                         when monto_transferencia <> 0 then 'transferencia'
                         else 'tarjeta' end
        else 'mixto'
    end                                                       as medio_pago,
    referencia,
    estado,
    fuente_origen,
    extraido_en,
    proceso_transformacion,
    version_proceso
from (
    select
        empresa_id,
        datos->>'DocEntry'                                    as pago_id,
        datos->>'DocNum'                                      as pago_numero,
        nullif(trim(datos->>'Series'), '')                    as serie_codigo,
        '{{ tipo }}'::text                                    as tipo_pago,
        -- CONTRAPARTE: en Cresta el 67% del monto de ORCT es DocType 'A' (operaciones de
        -- tesorería contra cuenta contable, sin socio). Sin esta columna, la "cobranza"
        -- mezclaría tesorería y triplicaría el indicador (Q728M vs Q241M reales de clientes).
        case datos->>'DocType'
             when 'C' then 'cliente' when 'S' then 'proveedor' when 'A' then 'cuenta_contable'
             else coalesce(datos->>'DocType', 'otro') end     as contraparte,
        nullif(trim(datos->>'CardCode'), '')                  as socio_codigo,
        (nullif(datos->>'DocDate', ''))::date                 as fecha_pago,
        (nullif(datos->>'TaxDate', ''))::date                 as fecha_registro,
        nullif(trim(datos->>'DocCurr'), '')                   as moneda_documento,
        '{{ var("moneda_local", "GTQ") }}'::text              as moneda_local,
        (nullif(datos->>'DocRate', ''))::numeric(18,6)        as tipo_cambio,
        coalesce((nullif(datos->>'CashSum',''))::numeric(18,4), 0)     as monto_efectivo,
        coalesce((nullif(datos->>'CheckSum',''))::numeric(18,4), 0)    as monto_cheque,
        coalesce((nullif(datos->>'TrsfrSum',''))::numeric(18,4), 0)    as monto_transferencia,
        coalesce((nullif(datos->>'CreditSum',''))::numeric(18,4), 0)   as monto_tarjeta,
        coalesce((nullif(datos->>'CashSumFC',''))::numeric(18,4), 0)   as monto_efectivo_doc,
        coalesce((nullif(datos->>'CheckSumFC',''))::numeric(18,4), 0)  as monto_cheque_doc,
        coalesce((nullif(datos->>'TrsfrSumFC',''))::numeric(18,4), 0)  as monto_transferencia_doc,
        -- Confirmado con Descubrir: la columna FC de tarjeta es CredSumFC (no CreditSumFC).
        coalesce((nullif(datos->>'CredSumFC',''))::numeric(18,4), 0)   as monto_tarjeta_doc,
        nullif(trim(datos->>'Ref1'), '')                      as referencia,
        -- ORCT/OVPM no tienen DocStatus (eso es de documentos de marketing): el estado del
        -- pago vive en `Status` (confirmado con Descubrir).
        case coalesce(datos->>'Status', datos->>'DocStatus')
             when 'O' then 'abierto' when 'C' then 'cerrado' else 'otro' end
                                                              as estado,
        {{ columnas_trazabilidad() }}
    from {{ source('bronce', tabla) }}
    -- Doble grafía a propósito: los documentos de marketing usan CANCELED pero en algunas
    -- versiones ORCT/OVPM la columna es Canceled. Descubrir confirma cuál trae este tenant.
    where coalesce(datos->>'CANCELED', datos->>'Canceled', 'N') = 'N'
) p
left join moneda_local_erp ml
       on ml.empresa_id = p.empresa_id
{% if not loop.last %}union all{% endif %}
{% endfor %}

{% else %}

-- Odoo: account_payment. La moneda llega como id numérico (currency_id) y se traduce al
-- código con res_currency, igual que en los documentos.
select
    p.empresa_id,
    p.datos->>'id'                                            as pago_id,
    p.datos->>'name'                                          as pago_numero,
    nullif(split_part(p.datos->>'name', '/', 1), '')          as serie_codigo,
    case when p.datos->>'payment_type' = 'inbound' then 'recibido' else 'efectuado' end
                                                              as tipo_pago,
    case p.datos->>'partner_type'
         when 'customer' then 'cliente' when 'supplier' then 'proveedor'
         else coalesce(p.datos->>'partner_type', 'otro') end  as contraparte,
    nullif(p.datos->>'partner_id', '')                        as socio_codigo,
    (nullif(p.datos->>'date', ''))::date                      as fecha_pago,
    (nullif(p.datos->>'date', ''))::date                      as fecha_registro,
    coalesce(nullif(trim(rc.datos->>'name'), ''), p.datos->>'currency_id')
                                                              as moneda_documento,
    '{{ var("moneda_local", "GTQ") }}'::text                  as moneda_local,
    case when coalesce((nullif(p.datos->>'amount',''))::numeric, 0) <> 0
         then round(abs((nullif(p.datos->>'amount_company_currency_signed',''))::numeric
                      / (nullif(p.datos->>'amount',''))::numeric), 6)
    end::numeric(18,6)                                        as tipo_cambio,
    coalesce((nullif(p.datos->>'amount',''))::numeric(18,4), 0)  as monto_doc,
    abs(coalesce((nullif(p.datos->>'amount_company_currency_signed',''))::numeric(18,4), 0))
                                                              as monto_local,
    -- El medio (diario/journal) no se extrae todavía; cuando haga falta, se agrega el objeto.
    null::text                                                as medio_pago,
    nullif(trim(p.datos->>'memo'), '')                        as referencia,
    p.datos->>'state'                                         as estado,
    {{ columnas_trazabilidad('p') }}
from {{ source('bronce', 'account_payment') }} p
left join {{ source('bronce', 'res_currency') }} rc
       on rc.datos->>'id' = p.datos->>'currency_id'
      and rc.empresa_id   = p.empresa_id
where coalesce(p.datos->>'state', '') not in ('draft', 'canceled', 'rejected')

{% endif %}
