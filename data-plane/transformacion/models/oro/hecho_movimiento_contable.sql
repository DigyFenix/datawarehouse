{#
  HECHO DE RESULTADOS CONTABLES — grano: partida del mayor en cuenta de RESULTADOS
  (ingreso / gasto / costo). Dominio `finanzas`. Completa el P&L: ventas y costo ya
  existían por documento; esto agrega el GASTO OPERATIVO (y el ingreso contable como
  contraste) directo del libro mayor, por cuenta —con su jerarquía de 5 niveles— y por
  centro de costo.

  Se limita a resultados A PROPÓSITO: el mayor completo vive en plata_movimiento_contable;
  meter balance (activo/pasivo) aquí duplicaría la cartera y el inventario que ya tienen su
  hecho. La posición de bancos será otro hecho cuando se aborde.

  SIGNO: `monto_local` = debe − haber (convención contable cruda). `monto_resultado` lo
  voltea a la NATURALEZA de la cuenta (ingreso positivo cuando abona, gasto positivo cuando
  carga): es la columna que se grafica sin pensar en signos.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

select
    {{ clave_tiempo('m.fecha') }}
                                                      as tiempo_clave,
    {{ clave_o_no_definido('dcu', 'cuenta_clave') }}  as cuenta_clave,
    {{ clave_o_no_definido('dcc', 'centro_costo_clave') }} as centro_costo_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,

    m.empresa_id,
    m.partida_id,
    m.asiento_id,
    m.fecha,
    m.tipo_cuenta                                     as naturaleza,   -- ingreso | gasto | costo
    m.documento_origen,
    m.tipo_documento_origen,
    m.origen_partida,
    m.descripcion_partida,
    -- Sin sufijo = moneda de PRESENTACIÓN (÷ tasa del día del asiento). El eje local vive
    -- en Plata (el mayor SIEMPRE cuadra contra el ERP en moneda local).
    (m.debe_local / tp.tasa)::numeric(18,4)           as debe,
    (m.haber_local / tp.tasa)::numeric(18,4)          as haber,
    (m.monto_local / tp.tasa)::numeric(18,4)          as monto,
    -- Positivo en la naturaleza de la cuenta: ingreso = haber−debe; gasto/costo = debe−haber.
    (case when m.tipo_cuenta = 'ingreso'
         then m.haber_local - m.debe_local
         else m.debe_local - m.haber_local end / tp.tasa)::numeric(18,4) as monto_resultado,

    m.proceso_transformacion,
    m.version_proceso
from {{ ref('plata_movimiento_contable') }} m
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = m.empresa_id and tp.fecha = m.fecha
left join {{ ref('dim_cuenta') }} dcu
       on dcu.cuenta_codigo = m.cuenta_codigo and dcu.empresa_id = m.empresa_id
left join {{ ref('dim_centro_costo') }} dcc
       on dcc.centro_costo_codigo = m.centro_costo_codigo and dcc.empresa_id = m.empresa_id
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = m.empresa_id
where m.tipo_cuenta in ('ingreso', 'gasto', 'costo')
