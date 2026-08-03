{#
  COMPORTAMIENTO DE PAGO POR CLIENTE — perfil de riesgo de cartera + actividad de cobro.

  Junta lo que hoy vive separado: el estado de la cartera abierta (aging) y la actividad de
  pagos del cliente. Es la ficha que crédito/cobros consulta antes de despachar.

  LÍMITE HONESTO: los "días reales de pago" exactos (factura → pago) requieren la APLICACIÓN
  pago↔factura (RCT2 en SAP B1 / reconciliación en Odoo), que no se ingesta todavía, y la
  cartera se extrae SOLO con partidas abiertas (sin histórico de cierres). Por eso este
  modelo mide lo que los datos actuales sí sostienen:
    · qué tan vencido está lo abierto (ponderado por saldo, no un promedio simple), y
    · qué tan activo es pagando (recencia, frecuencia y monto de pagos recibidos).
  Cuando se ingeste la aplicación de pagos, aquí se agregan los días reales sin romper nada.

  GRANO: una fila por (empresa, cliente) — 1:1 con dim_cliente, mismo patrón que ABC y RFM.
  Los pagos consideran SOLO contraparte 'cliente' (ORCT mezcla tesorería contra cuenta).
#}
{{ config(materialized='table') }}

with cartera as (
    select
        h.empresa_id,
        h.cliente_clave,
        max(h.fecha_corte)                                              as fecha_corte,
        count(*)                                                        as partidas_abiertas,
        sum(h.saldo_pendiente)                                    as saldo_total,
        sum(h.saldo_pendiente) filter (where h.rango_aging = 'corriente')
                                                                        as saldo_corriente,
        sum(h.saldo_pendiente) filter (where h.rango_aging not in ('corriente', 'sin_vencimiento'))
                                                                        as saldo_vencido,
        max(h.dias_vencido) filter (where h.dias_vencido > 0)           as max_dias_vencido,
        -- Promedio de días vencidos PONDERADO por saldo: 1 factura grande vencida pesa más
        -- que 10 pequeñas al día. Solo sobre lo vencido.
        (sum(h.dias_vencido * h.saldo_pendiente)
             filter (where h.dias_vencido > 0)
         / nullif(sum(h.saldo_pendiente) filter (where h.dias_vencido > 0), 0))
                                                                        as dias_vencido_ponderado,
        min(h.fecha_vencimiento) filter (where h.dias_vencido > 0)      as vencimiento_mas_antiguo
    from {{ ref('hecho_cartera_cobrar') }} h
    group by 1, 2
),

pagos as (
    select
        p.empresa_id,
        p.cliente_clave,
        max(p.fecha_pago)                                               as ultimo_pago,
        count(*) filter (where p.fecha_pago > current_date - 365)       as pagos_12m,
        sum(p.monto) filter (where p.fecha_pago > current_date - 365)
                                                                        as monto_pagado_12m,
        sum(p.monto) filter (where p.fecha_pago > current_date - 90)
                                                                        as monto_pagado_3m
    from {{ ref('hecho_pago_recibido') }} p
    where p.contraparte = 'cliente'
    group by 1, 2
),

universo as (
    select
        c.empresa_id,
        c.cliente_clave,
        coalesce(k.partidas_abiertas, 0)::int              as partidas_abiertas,
        coalesce(k.saldo_total, 0)::numeric(18,4)          as saldo_total,
        coalesce(k.saldo_corriente, 0)::numeric(18,4)      as saldo_corriente,
        coalesce(k.saldo_vencido, 0)::numeric(18,4)        as saldo_vencido,
        k.max_dias_vencido,
        round(k.dias_vencido_ponderado, 1)                 as dias_vencido_ponderado,
        k.vencimiento_mas_antiguo,
        k.fecha_corte,
        g.ultimo_pago,
        (current_date - g.ultimo_pago)                     as dias_desde_ultimo_pago,
        coalesce(g.pagos_12m, 0)::int                      as pagos_12m,
        coalesce(g.monto_pagado_12m, 0)::numeric(18,4)     as monto_pagado_12m,
        coalesce(g.monto_pagado_3m, 0)::numeric(18,4)      as monto_pagado_3m
    from {{ ref('dim_cliente') }} c
    left join cartera k on k.empresa_id = c.empresa_id and k.cliente_clave = c.cliente_clave
    left join pagos   g on g.empresa_id = c.empresa_id and g.cliente_clave = c.cliente_clave
    where c.es_vigente
      and coalesce(c.es_intercompania, false) = false
      and c.cliente_clave <> {{ clave_no_definido() }}
)

select
    u.*,
    round(case when u.saldo_total > 0 then u.saldo_vencido / u.saldo_total else 0 end, 4)
                                                          ::numeric(9,4) as pct_saldo_vencido,

    -- Perfil de riesgo de lo ABIERTO. Cortes del paquete base (mismos 30/90 del aging).
    case
        when u.saldo_total <= 0                                        then 'sin_saldo'
        when u.saldo_vencido <= 0                                      then 'al_dia'
        when u.max_dias_vencido <= 30
         and u.saldo_vencido / u.saldo_total <= 0.25                   then 'vencido_leve'
        when u.max_dias_vencido > 90
          or u.saldo_vencido / u.saldo_total > 0.50                    then 'vencido_critico'
        else                                                                'vencido_moderado'
    end                                               as perfil_riesgo,

    case
        when u.saldo_total <= 0                                        then 'Sin saldo'
        when u.saldo_vencido <= 0                                      then 'Al día'
        when u.max_dias_vencido <= 30
         and u.saldo_vencido / u.saldo_total <= 0.25                   then 'Vencido leve'
        when u.max_dias_vencido > 90
          or u.saldo_vencido / u.saldo_total > 0.50                    then 'Vencido CRÍTICO'
        else                                                                'Vencido moderado'
    end                                               as perfil_riesgo_nombre,

    -- Trazabilidad (§12). Agregado: no arrastra fuente/extraído de una fila concreta.
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from universo u
