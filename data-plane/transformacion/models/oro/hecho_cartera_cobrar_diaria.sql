{#
  FOTO DIARIA de la cartera por cobrar. NO es un extra: sin ella el aging solo se puede calcular
  "a hoy" — no se puede responder "cómo estaba la cartera el mes pasado" ni medir evolución de
  DSO. El costo es trivial (unos miles de filas por día) y el histórico NO se puede reconstruir
  después: lo que no se fotografía hoy, se pierde.

  INCREMENTAL: cada corrida agrega la foto del día. Si se corre dos veces el mismo día, la
  segunda reemplaza a la primera (unique_key), así que repetir una corrida no duplica.
#}
{#-
  `on_schema_change = 'append_new_columns'`: una columna nueva se agrega SIN full-refresh, que
  destruiría las fotos ya guardadas — y el histórico de cartera es justo lo que no se puede
  reconstruir. Las filas anteriores quedan con la columna en NULL, y el `post_hook` las rellena
  desde la etiqueta que sí guardaron. Sin ese relleno la relación por clave entera perdería las
  fotos viejas en Power BI.
-#}
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
    cliente_clave,
    organizacion_clave,
    moneda_clave,
    cuenta_clave,
    tiempo_vencimiento_clave,
    fecha_vencimiento,
    -- El hecho ya expone el saldo en moneda de PRESENTACIÓN; se conserva el nombre histórico
    -- de la columna porque esta tabla es INCREMENTAL (renombrarla exigiría full-refresh y
    -- perder las fotos acumuladas). Para las 9 sociedades GTQ el valor es idéntico.
    saldo_pendiente                                   as saldo_pendiente_local,
    saldo_pendiente_doc,
    dias_vencido,
    rango_aging,
    rango_aging_clave,
    proceso_transformacion,
    version_proceso
from {{ ref('hecho_cartera_cobrar') }}

{% if is_incremental() %}
  -- Solo la foto de hoy; las anteriores ya están guardadas.
  where fecha_corte > (select coalesce(max(fecha_corte), date '1900-01-01') from {{ this }})
     or fecha_corte = (select max(fecha_corte) from {{ this }})
{% endif %}
