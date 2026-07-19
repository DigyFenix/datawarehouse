-- Métrica: Aging / Antigüedad de Saldos = saldo por rangos de días vencidos (§9):
-- corriente, 1-30, 31-60, 61-90, +90. Días vencidos = hoy - fecha de vencimiento.
{{ config(materialized='table') }}

with base as (
    select
        empresa_id,
        saldo_pendiente,
        (current_date - fecha_vencimiento) as dias_vencido
    from {{ ref('fct_cobros_cxc') }}
)
select
    empresa_id,
    case
        when dias_vencido <= 0                        then 'corriente'
        when dias_vencido between 1  and 30           then '1-30'
        when dias_vencido between 31 and 60           then '31-60'
        when dias_vencido between 61 and 90           then '61-90'
        else '+90'
    end                          as rango,
    sum(saldo_pendiente)         as saldo
from base
group by
    empresa_id,
    case
        when dias_vencido <= 0                        then 'corriente'
        when dias_vencido between 1  and 30           then '1-30'
        when dias_vencido between 31 and 60           then '31-60'
        when dias_vencido between 61 and 90           then '61-90'
        else '+90'
    end
