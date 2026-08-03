{#
  PROYECCIÓN DE CAJA SEMANAL — entradas (CxC) y salidas (CxP) por semana de vencimiento.

  Responde "¿cuánto entra y cuánto sale en las próximas semanas si todo se paga a su
  vencimiento?". Es una proyección CONTRACTUAL, no un pronóstico: usa la fecha de vencimiento
  pactada de cada partida abierta. Lo ya vencido se agrupa en su propio bucket ("Vencido") —
  en teoría es cobrable/pagable HOY.

  GRANO: (empresa, flujo, semana). La semana es ISO (lunes a domingo, date_trunc('week')).
  Los montos van en valor absoluto y `flujo` distingue entrada/salida: el neto se calcula en
  la capa de consumo (entrada − salida), nunca sumando signos ocultos.
#}
{{ config(materialized='table') }}

with partidas as (
    select
        empresa_id, 'entrada' as flujo, fecha_vencimiento,
        abs(saldo_pendiente) as saldo, fecha_corte
    from {{ ref('hecho_cartera_cobrar') }}

    union all

    select
        empresa_id, 'salida', fecha_vencimiento,
        abs(saldo_pendiente), fecha_corte
    from {{ ref('hecho_cartera_pagar') }}
),

clasificado as (
    select
        p.empresa_id,
        p.flujo,
        p.fecha_corte,
        case
            when p.fecha_vencimiento is null            then 'sin_vencimiento'
            when p.fecha_vencimiento < p.fecha_corte    then 'vencido'
            else 'programado'
        end                                             as estado_vencimiento,
        -- Lo vencido y lo sin fecha se anclan a la semana del corte: son exigibles "ya".
        case
            when p.fecha_vencimiento is null or p.fecha_vencimiento < p.fecha_corte
                then date_trunc('week', p.fecha_corte)::date
            else date_trunc('week', p.fecha_vencimiento)::date
        end                                             as semana_inicio,
        p.saldo
    from partidas p
)

select
    c.empresa_id,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    c.flujo,
    c.estado_vencimiento,
    c.semana_inicio,
    (c.semana_inicio + 6)                             as semana_fin,
    (to_char(c.semana_inicio, 'YYYYMMDD'))::bigint    as tiempo_clave,
    -- Semanas relativas al corte: 0 = semana actual. Para filtrar "próximas N semanas".
    ((c.semana_inicio - date_trunc('week', c.fecha_corte)::date) / 7)::int as semana_offset,
    -- La etiqueta lleva el año: Power BI ordena por columna y exige que cada etiqueta mapee
    -- a UN solo valor de orden — 'Sem. 03/08' se repetiría al cruzar de año.
    case
        when c.estado_vencimiento = 'vencido'         then 'Vencido'
        when c.estado_vencimiento = 'sin_vencimiento' then 'Sin vencimiento'
        else 'Sem. ' || to_char(c.semana_inicio, 'DD/MM/YY')
    end                                               as semana_etiqueta,
    count(*)::int                                     as partidas,
    sum(c.saldo)::numeric(18,4)                       as monto,
    max(c.fecha_corte)                                as fecha_corte,

    -- Trazabilidad (§12). Agregado: no arrastra fuente/extraído de una fila concreta.
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from clasificado c
left join {{ ref('dim_organizacion') }} dorg on dorg.empresa_id = c.empresa_id
group by 1, 2, 3, 4, 5, 6, 7, 8, 9
