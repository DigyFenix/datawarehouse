{#
  FOTO DIARIA de la cartera por pagar. Mismo criterio que la de cobrar: el histórico de saldos
  no se puede reconstruir hacia atrás, así que se empieza a acumular desde la primera corrida.
#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'partida_id', 'fecha_corte'],
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

select
    fecha_corte,
    (to_char(fecha_corte, 'YYYYMMDD'))::bigint        as fecha_corte_clave,
    empresa_id,
    partida_id,
    proveedor_clave,
    organizacion_clave,
    moneda_clave,
    cuenta_clave,
    tiempo_vencimiento_clave,
    fecha_vencimiento,
    -- El hecho ya expone el saldo en moneda de PRESENTACIÓN; nombre histórico conservado
    -- (tabla INCREMENTAL — renombrar exigiría full-refresh y perder las fotos acumuladas).
    saldo_pendiente                                   as saldo_pendiente_local,
    saldo_pendiente_doc,
    saldo_pendiente_absoluto,
    dias_vencido,
    rango_aging,
    proceso_transformacion,
    version_proceso
from {{ ref('hecho_cartera_pagar') }}

{% if is_incremental() %}
  where fecha_corte > (select coalesce(max(fecha_corte), date '1900-01-01') from {{ this }})
     or fecha_corte = (select max(fecha_corte) from {{ this }})
{% endif %}
