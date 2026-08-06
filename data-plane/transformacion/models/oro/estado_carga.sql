{#
  FRESCURA DEL DATO — cuándo se extrajo por última vez cada dominio, y hasta qué fecha llega.

  POR QUÉ EXISTE: un tablero que muestra un número viejo sin decirlo es peor que uno vacío.
  Quien decide necesita saber si está viendo el cierre de ayer o una foto de hace tres semanas
  porque la VPN se cayó. Es parte de la confianza en el número, que es lo que este producto
  vende — no un adorno operativo.

  GRANO: una fila por (empresa, dominio).

  Dos relojes distintos, y la diferencia importa:
    · `ultima_extraccion`      → cuándo corrió el proceso (¿está vivo el pipeline?)
    · `fecha_dato_mas_reciente`→ hasta qué fecha hay operación (¿está al día el ERP?)
  Un pipeline que corrió hace 5 minutos sobre un ERP sin movimientos desde hace un mes tiene el
  primero en verde y el segundo en rojo. Sin separarlos no se distingue un fallo técnico de una
  operación detenida.

  Se lee de PLATA a propósito: ahí viven las columnas de trazabilidad (`extraido_en`) que Oro
  no arrastra por ser agregados.
#}
{{ config(materialized='table') }}

with base as (

    select 'ventas'         as dominio, empresa_id, extraido_en, fecha_documento as fecha_dato
    from {{ ref('plata_documento_comercial') }} where flujo = 'venta'
    union all
    select 'compras', empresa_id, extraido_en, fecha_documento
    from {{ ref('plata_documento_comercial') }} where flujo = 'compra'
    union all
    select 'cartera_cobrar', empresa_id, extraido_en, fecha_documento
    from {{ ref('plata_partida_cartera') }} where tipo_cartera = 'cobrar'
    union all
    select 'cartera_pagar', empresa_id, extraido_en, fecha_documento
    from {{ ref('plata_partida_cartera') }} where tipo_cartera = 'pagar'
    union all
    select 'pagos', empresa_id, extraido_en, fecha_pago
    from {{ ref('plata_pago') }}
    union all
    select 'inventario', empresa_id, extraido_en, null::date
    from {{ ref('plata_inventario') }}
    union all
    select 'pedidos', empresa_id, extraido_en, fecha_pedido
    from {{ ref('plata_pedido_linea') }}
    union all
    select 'contabilidad', empresa_id, extraido_en, fecha
    from {{ ref('plata_movimiento_contable') }}
    union all
    select 'socios', empresa_id, extraido_en, null::date
    from {{ ref('plata_socio_negocio') }}
    union all
    select 'productos', empresa_id, extraido_en, null::date
    from {{ ref('plata_producto') }}
    union all
    select 'tipos_cambio', empresa_id, extraido_en, fecha
    from {{ ref('plata_tipo_cambio') }}

),

agregado as (
    select
        empresa_id,
        dominio,
        count(*)                                               as filas,
        max(extraido_en)                                       as ultima_extraccion,
        max(fecha_dato)                                        as fecha_dato_mas_reciente
    from base
    group by 1, 2
)

select
    a.empresa_id,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }}    as organizacion_clave,
    a.dominio,
    case a.dominio
        when 'ventas'         then 'Ventas'
        when 'compras'        then 'Compras'
        when 'cartera_cobrar' then 'Cartera por cobrar'
        when 'cartera_pagar'  then 'Cartera por pagar'
        when 'pagos'          then 'Pagos'
        when 'inventario'     then 'Inventario'
        when 'pedidos'        then 'Pedidos'
        when 'contabilidad'   then 'Contabilidad'
        when 'socios'         then 'Socios de negocio'
        when 'productos'      then 'Productos'
        when 'tipos_cambio'   then 'Tipos de cambio'
        else a.dominio
    end                                                        as dominio_nombre,
    a.filas,
    a.ultima_extraccion,
    a.fecha_dato_mas_reciente,
    (current_date - a.ultima_extraccion::date)::int            as dias_desde_extraccion,
    case when a.fecha_dato_mas_reciente is not null
         then (current_date - a.fecha_dato_mas_reciente)::int end as dias_desde_ultimo_dato,

    -- Semáforo operativo. Los umbrales son los de una carga diaria: al día = corrió hoy o ayer.
    case
        when (current_date - a.ultima_extraccion::date) <= 1 then 'Al día'
        when (current_date - a.ultima_extraccion::date) <= 3 then 'Atrasado'
        else 'Desactualizado'
    end                                                        as estado_frescura,

    '{{ this.name }}'::text                                    as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text                as version_proceso
from agregado a
left join {{ ref('dim_organizacion') }} dorg on dorg.empresa_id = a.empresa_id
