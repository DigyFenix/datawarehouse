{#
  HECHO DE INVENTARIO — grano: (empresa, almacén, producto). Dominio `inventario`.
  FOTO al momento de la extracción: `tiempo_clave` es la fecha de corte (hoy), para que el
  calendario pueda filtrarlo sin que el hecho pretenda ser un histórico.
  El valor está en moneda local (no hay eje de moneda del documento en existencias).
#}
{{ config(materialized='table') }}

select
    (to_char(current_date, 'YYYYMMDD'))::bigint       as tiempo_clave,
    {{ clave_o_no_definido('dp', 'producto_clave') }} as producto_clave,
    {{ clave_o_no_definido('da', 'almacen_clave') }}  as almacen_clave,
    {{ clave_o_no_definido('dorg', 'organizacion_clave') }} as organizacion_clave,

    i.empresa_id,
    current_date                                      as fecha_corte,

    i.cantidad,
    -- Moneda de PRESENTACIÓN (la existencia es FOTO → tasa vigente hoy). El inventario no
    -- tiene eje de moneda de documento; el eje local vive en Plata.
    (i.costo_promedio / tp.tasa)::numeric(18,6)       as costo_promedio,
    (i.valor / tp.tasa)::numeric(18,4)                as valor,

    i.proceso_transformacion,
    i.version_proceso
from {{ ref('plata_inventario') }} i
left join {{ ref('plata_tasa_presentacion') }} tp
       on tp.empresa_id = i.empresa_id and tp.fecha = current_date
left join {{ ref('dim_producto') }} dp
       on dp.producto_codigo = i.producto_codigo and dp.empresa_id = i.empresa_id
left join {{ ref('dim_almacen') }} da
       on da.almacen_codigo = i.almacen_codigo and da.empresa_id = i.empresa_id
left join {{ ref('dim_organizacion') }} dorg
       on dorg.empresa_id = i.empresa_id
