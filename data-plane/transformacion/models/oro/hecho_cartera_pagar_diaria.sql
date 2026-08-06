{#
  FOTO DIARIA de la cartera por pagar. Mismo criterio que la de cobrar: el histórico de saldos
  no se puede reconstruir hacia atrás, así que se empieza a acumular desde la primera corrida.
#}
{#- Ver hecho_cartera_cobrar_diaria: columna nueva sin full-refresh + relleno de las fotos ya
    guardadas desde su etiqueta. -#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'partida_id', 'fecha_corte'],
    on_schema_change = 'append_new_columns',
    pre_hook = "set local max_parallel_workers_per_gather = 0",
    post_hook = "update {{ this }} set rango_aging_clave = " ~ aging_clave_desde_codigo('rango_aging')
                ~ " where rango_aging_clave is null"
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
    rango_aging_clave,
    proceso_transformacion,
    version_proceso
from {{ ref('hecho_cartera_pagar') }}

{% if is_incremental() %}
  where fecha_corte > (select coalesce(max(fecha_corte), date '1900-01-01') from {{ this }})
     or fecha_corte = (select max(fecha_corte) from {{ this }})
{% endif %}
