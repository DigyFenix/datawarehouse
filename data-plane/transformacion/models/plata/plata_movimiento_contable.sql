{#
  MAYOR CONTABLE CANÓNICO — una fila por partida del libro mayor, con su cuenta clasificada.

  Es la base del P&L (gastos e ingresos contables) y complementa a la cartera, que es un
  RECORTE de este mismo mayor (solo cuentas de control con saldo). El alcance lo define la
  EXTRACCIÓN (objeto `cartera`/`movimientos`): partidas abiertas de cualquier fecha (saldo)
  + todo el período de resultados (regla de corte 2026).

  Centro de costo homologado: JDT1.ProfitCode en SAP B1; en Odoo la primera clave de
  `analytic_distribution` (id de account.analytic.account, el mismo código de la dimensión).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

with cuentas as (
    select empresa_id, cuenta_codigo, tipo_cuenta, es_titulo
    from {{ ref('plata_cuenta') }}
)

{% if erp == 'sap_b1' %}

select
    j.empresa_id,
    (j.datos->>'TransId') || '-' || (j.datos->>'Line_ID')     as partida_id,
    j.datos->>'TransId'                                       as asiento_id,
    (nullif(j.datos->>'RefDate', ''))::date                  as fecha,
    j.datos->>'Account'                                       as cuenta_codigo,
    coalesce(c.tipo_cuenta, 'otro')                           as tipo_cuenta,
    nullif(trim(j.datos->>'ShortName'), '')                   as socio_codigo,
    nullif(trim(j.datos->>'ProfitCode'), '')                  as centro_costo_codigo,
    coalesce(nullif(trim(j.datos->>'BaseRef'), ''), j.datos->>'TransId') as documento_origen,
    coalesce(o.datos->>'TransType', j.datos->>'TransType')    as tipo_documento_origen,
    case when coalesce(o.datos->>'TransType', j.datos->>'TransType') in ('13','14','18','19')
         then 'documento' else 'asiento' end                  as origen_partida,
    nullif(trim(j.datos->>'LineMemo'), '')                    as descripcion_partida,
    coalesce((nullif(j.datos->>'Debit',''))::numeric(18,4), 0)  as debe_local,
    coalesce((nullif(j.datos->>'Credit',''))::numeric(18,4), 0) as haber_local,
    coalesce((nullif(j.datos->>'Debit',''))::numeric(18,4), 0)
      - coalesce((nullif(j.datos->>'Credit',''))::numeric(18,4), 0) as monto_local,
    {{ columnas_trazabilidad('j') }}
from {{ source('bronce', 'jdt1') }} j
left join cuentas c
       on c.cuenta_codigo = j.datos->>'Account' and c.empresa_id = j.empresa_id
left join {{ source('bronce', 'ojdt') }} o
       on o.datos->>'TransId' = j.datos->>'TransId' and o.empresa_id = j.empresa_id

{% else %}

select
    l.empresa_id,
    l.datos->>'id'                                            as partida_id,
    l.datos->>'move_id'                                       as asiento_id,
    (nullif(l.datos->>'date', ''))::date                      as fecha,
    l.datos->>'account_id'                                    as cuenta_codigo,
    coalesce(c.tipo_cuenta, 'otro')                           as tipo_cuenta,
    nullif(l.datos->>'partner_id', '')                        as socio_codigo,
    -- analytic_distribution = {id_analitica: porcentaje}; se toma la primera (una sola en
    -- la práctica). Prorratear multi-analítica queda para cuando un tenant lo use.
    (select k from jsonb_object_keys(
        case when jsonb_typeof(l.datos->'analytic_distribution') = 'object'
             then l.datos->'analytic_distribution' else '{}'::jsonb end) k limit 1)
                                                              as centro_costo_codigo,
    l.datos->>'move_id'                                       as documento_origen,
    m.datos->>'move_type'                                     as tipo_documento_origen,
    case when m.datos->>'move_type' in ('out_invoice','out_refund','in_invoice','in_refund')
         then 'documento' else 'asiento' end                  as origen_partida,
    nullif(trim(l.datos->>'name'), '')                        as descripcion_partida,
    coalesce((nullif(l.datos->>'debit',''))::numeric(18,4), 0)  as debe_local,
    coalesce((nullif(l.datos->>'credit',''))::numeric(18,4), 0) as haber_local,
    coalesce((nullif(l.datos->>'balance',''))::numeric(18,4), 0) as monto_local,
    {{ columnas_trazabilidad('l') }}
from {{ source('bronce', 'account_move_line') }} l
left join cuentas c
       on c.cuenta_codigo = l.datos->>'account_id' and c.empresa_id = l.empresa_id
left join {{ source('bronce', 'account_move') }} m
       on m.datos->>'id' = l.datos->>'move_id' and m.empresa_id = l.empresa_id

{% endif %}
