{#
  HECHO DE CARTERA POR PAGAR — grano: partida abierta del mayor. Dominio `tesoreria`.
  Separado de por cobrar: se analiza contra proveedor, no contra cliente, y sumar ambos daría
  un número sin sentido. Si se quiere la posición neta, es una métrica certificada explícita.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

{%- set corte = "current_date" -%}

select
    coalesce((to_char(p.fecha_documento, 'YYYYMMDD'))::bigint, {{ clave_no_definido() }})
                                                      as tiempo_clave,
    coalesce((to_char(p.fecha_vencimiento, 'YYYYMMDD'))::bigint, {{ clave_no_definido() }})
                                                      as tiempo_vencimiento_clave,
    {{ clave_o_no_definido('dpr', 'proveedor_clave') }} as proveedor_clave,
    {{ clave_o_no_definido('ds', 'socio_clave') }}    as socio_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,
    {{ clave_o_no_definido('dm', 'moneda_clave') }}   as moneda_clave,
    {{ clave_o_no_definido('dcu', 'cuenta_clave') }}  as cuenta_clave,

    p.empresa_id,
    p.partida_id,
    p.documento_origen,
    p.tipo_documento_origen,
    p.origen_partida,
    p.fecha_documento,
    p.fecha_vencimiento,
    {{ corte }}                                       as fecha_corte,

    -- DOS ejes de moneda (decisión 2026-08-02): sin sufijo = moneda de PRESENTACIÓN (rige
    -- todo análisis; el saldo es FOTO → tasa vigente hoy); `_doc` = moneda del documento,
    -- solo referencia. El eje local vive en Plata (cuadre y trazabilidad).
    (p.monto_original_local / tp.tasa)::numeric(18,4) as monto_original,
    p.monto_original_doc,
    (p.saldo_pendiente_local / tp.tasa)::numeric(18,4) as saldo_pendiente,
    p.saldo_pendiente_doc,
    -- El mayor deja la deuda con signo acreedor (negativo). Para reportes de "cuánto debo"
    -- se expone también en positivo, sin perder el signo contable original.
    (abs(p.saldo_pendiente_local) / tp.tasa)::numeric(18,4) as saldo_pendiente_absoluto,

    ({{ corte }} - p.fecha_vencimiento)               as dias_vencido,
    case
        when p.fecha_vencimiento is null                    then 'sin_vencimiento'
        when {{ corte }} <= p.fecha_vencimiento            then 'corriente'
        when {{ corte }} - p.fecha_vencimiento <= 30       then '1-30'
        when {{ corte }} - p.fecha_vencimiento <= 60       then '31-60'
        when {{ corte }} - p.fecha_vencimiento <= 90       then '61-90'
        else '+90'
    end                                               as rango_aging,

    p.proceso_transformacion,
    p.version_proceso
from {{ ref('plata_partida_cartera') }} p
left join {{ ref('dim_proveedor') }} dpr
       on dpr.proveedor_codigo = p.socio_codigo and dpr.empresa_id = p.empresa_id
left join {{ ref('dim_socio_negocio') }} ds
       on ds.socio_codigo = p.socio_codigo and ds.empresa_id = p.empresa_id
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = p.empresa_id and tp.fecha = current_date
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = p.empresa_id
left join {{ ref('dim_moneda') }} dm
       on dm.moneda_codigo = p.moneda_documento and dm.empresa_id = p.empresa_id
left join {{ ref('dim_cuenta') }} dcu
       on dcu.cuenta_codigo = p.cuenta_codigo and dcu.empresa_id = p.empresa_id
where p.tipo_cartera = 'pagar'
  and p.esta_abierta
