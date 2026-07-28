{#
  FOTO DIARIA de la cartera por cobrar. NO es un extra: sin ella el aging solo se puede calcular
  "a hoy" — no se puede responder "cómo estaba la cartera el mes pasado" ni medir evolución de
  DSO. El costo es trivial (unos miles de filas por día) y el histórico NO se puede reconstruir
  después: lo que no se fotografía hoy, se pierde.

  INCREMENTAL: cada corrida agrega la foto del día. Si se corre dos veces el mismo día, la
  segunda reemplaza a la primera (unique_key), así que repetir una corrida no duplica.
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
    cliente_clave,
    organizacion_clave,
    moneda_clave,
    cuenta_clave,
    tiempo_vencimiento_clave,
    fecha_vencimiento,
    saldo_pendiente_local,
    saldo_pendiente_doc,
    dias_vencido,
    rango_aging,
    proceso_transformacion,
    version_proceso
from {{ ref('hecho_cartera_cobrar') }}

{% if is_incremental() %}
  -- Solo la foto de hoy; las anteriores ya están guardadas.
  where fecha_corte > (select coalesce(max(fecha_corte), date '1900-01-01') from {{ this }})
     or fecha_corte = (select max(fecha_corte) from {{ this }})
{% endif %}
