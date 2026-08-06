{#
  FICHA ANALÍTICA DEL PRODUCTO — cruce de lo que se vende contra lo que está en bodega.

  Responde las dos preguntas que ningún hecho suelto puede contestar:
    · ¿qué inventario está muerto?  (hay existencia y hace meses que nadie lo compra)
    · ¿qué se está dejando de vender? (hay demanda reciente y la existencia es cero)

  DECISIONES QUE IMPORTAN:

  - GRANO: una fila por (empresa, producto), 1:1 con `dim_producto`, igual que las
    clasificaciones ABC de cliente y proveedor. Así la ficha se relaciona con la dimensión y
    filtra los hechos sin volver ambiguo el modelo. El inventario se AGREGA sobre almacenes:
    para decidir si un producto está muerto importa el total de la empresa, no cada bodega.

  - La clase ABC de producto se calcula sobre la venta TOTAL, no solo la de terceros. Es una
    diferencia consciente con el ABC de clientes: ahí el grupo distorsiona la cartera comercial
    (pone a las hermanas como clase A y esconde al cliente real), pero un producto vendido al
    grupo consume bodega, se compra y rota exactamente igual. Se expone también la venta a
    terceros en columna aparte para quien quiera el otro corte.

  - `es_ocioso` y `es_quiebre` NO aplican a servicios: no tienen existencia que administrar.
    Se marcan en false y se distinguen con `es_servicio`.

  - El inventario es una FOTO de hoy (`hecho_inventario` no guarda historia), así que la
    rotación compara el costo de 12 meses contra la existencia actual. Es la convención usual
    y la misma que ya usa la medida 'Rotación de inventario 12M'.

  - Los umbrales son parámetros (`dias_producto_ocioso`, `dias_producto_demanda`) para
    ajustarlos por tenant sin tocar el modelo: 90 días de inactividad no significan lo mismo
    en huevo que en repuestos.
#}
{{ config(materialized='table') }}

{%- set corte_a = var('abc_corte_a', 0.80) -%}
{%- set corte_b = var('abc_corte_b', 0.95) -%}
{%- set dias_ocioso = var('dias_producto_ocioso', 90) | int -%}
{%- set dias_demanda = var('dias_producto_demanda', 30) | int -%}

with ventas as (
    select
        v.empresa_id,
        v.producto_clave,
        v.fecha_documento,
        v.cantidad,
        v.monto_sin_impuesto,
        v.costo,
        v.margen,
        coalesce(c.es_intercompania, false)                    as es_grupo
    from {{ ref('hecho_venta_linea') }} v
    left join {{ ref('dim_cliente') }} c on c.cliente_clave = v.cliente_clave
),

-- Agregado de venta: ventana de 12 meses para los ritmos, e histórico para la última fecha.
venta_agregada as (
    select
        empresa_id,
        producto_clave,
        max(fecha_documento)                                                   as ultima_venta,
        min(fecha_documento)                                                   as primera_venta,
        sum(monto_sin_impuesto) filter (where fecha_documento >= current_date - interval '12 months')  as venta_12m,
        sum(monto_sin_impuesto) filter (where fecha_documento >= current_date - interval '12 months'
                                          and not es_grupo)                    as venta_12m_terceros,
        sum(cantidad)           filter (where fecha_documento >= current_date - interval '12 months')  as unidades_12m,
        sum(costo)              filter (where fecha_documento >= current_date - interval '12 months')  as costo_ventas_12m,
        sum(margen)             filter (where fecha_documento >= current_date - interval '12 months')  as margen_12m,
        count(*)                filter (where fecha_documento >= current_date - interval '12 months')  as lineas_12m,
        count(*) filter (where fecha_documento >= current_date - interval '{{ dias_demanda }} days')   as lineas_demanda_reciente
    from ventas
    group by 1, 2
),

-- Existencia actual sumada sobre todos los almacenes de la empresa.
existencia as (
    select
        empresa_id,
        producto_clave,
        sum(cantidad)                                          as stock_cantidad,
        sum(valor)                                             as stock_valor,
        count(*) filter (where cantidad <> 0)                  as almacenes_con_existencia
    from {{ ref('hecho_inventario') }}
    group by 1, 2
),

-- Universo: todo producto vigente, con o sin venta y con o sin existencia. Un catálogo que
-- solo liste lo que se movió no sirve para encontrar lo que dejó de moverse.
universo as (
    select
        p.empresa_id,
        p.producto_clave,
        (p.tipo_producto = 'servicio')                         as es_servicio,
        v.ultima_venta,
        v.primera_venta,
        coalesce(v.venta_12m, 0)::numeric(18,4)                as venta_12m,
        coalesce(v.venta_12m_terceros, 0)::numeric(18,4)       as venta_12m_terceros,
        coalesce(v.unidades_12m, 0)::numeric(18,4)             as unidades_12m,
        coalesce(v.costo_ventas_12m, 0)::numeric(18,4)         as costo_ventas_12m,
        coalesce(v.margen_12m, 0)::numeric(18,4)               as margen_12m,
        coalesce(v.lineas_12m, 0)::bigint                      as lineas_12m,
        coalesce(v.lineas_demanda_reciente, 0)::bigint         as lineas_demanda_reciente,
        coalesce(e.stock_cantidad, 0)::numeric(18,4)           as stock_cantidad,
        coalesce(e.stock_valor, 0)::numeric(18,4)              as stock_valor,
        coalesce(e.almacenes_con_existencia, 0)::int           as almacenes_con_existencia
    from {{ ref('dim_producto') }} p
    left join venta_agregada v
           on v.empresa_id = p.empresa_id and v.producto_clave = p.producto_clave
    left join existencia e
           on e.empresa_id = p.empresa_id and e.producto_clave = p.producto_clave
    where p.es_vigente
      -- Solo productos reales del catálogo. Los miembros globales (-1 No definido y -2
      -- SERVICIO) llevan empresa_id 'GLOBAL': no cruzarían con la venta de una sociedad y no
      -- tienen ficha que analizar — no hay existencia que administrar en una línea sin artículo.
      and p.producto_clave > 0
),

pareto as (
    select
        u.*,
        sum(u.venta_12m) over (partition by u.empresa_id)                      as total_12m,
        row_number() over (partition by u.empresa_id
                           order by u.venta_12m desc, u.producto_clave)        as ranking_venta_12m,
        sum(u.venta_12m) over (partition by u.empresa_id
                           order by u.venta_12m desc, u.producto_clave
                           rows between unbounded preceding and current row)   as acum_12m
    from universo u
)

select
    p.empresa_id,
    p.producto_clave,
    p.es_servicio,

    -- ---------- demanda ----------
    p.ultima_venta,
    p.primera_venta,
    case when p.ultima_venta is not null
         then (current_date - p.ultima_venta)::int end         as dias_desde_ultima_venta,
    p.venta_12m,
    p.venta_12m_terceros,
    p.unidades_12m,
    p.costo_ventas_12m,
    p.margen_12m,
    p.lineas_12m,
    round(case when p.venta_12m <> 0 then p.margen_12m / p.venta_12m
               else 0 end, 6)::numeric(9,6)                    as margen_pct_12m,

    -- ---------- existencia ----------
    p.stock_cantidad,
    p.stock_valor,
    p.almacenes_con_existencia,
    case when p.stock_cantidad > 0
         then round(p.stock_valor / p.stock_cantidad, 6) end   as costo_unitario_actual,

    -- ---------- rotación y cobertura ----------
    -- Rotación: cuántas veces se consumió la existencia actual en 12 meses.
    case when p.stock_valor > 0
         then round(p.costo_ventas_12m / p.stock_valor, 4) end as rotacion_12m,
    -- Cobertura: a la velocidad de los últimos 12 meses, cuántos días dura lo que hay.
    -- Se topa en 999 para que un producto con demanda casi nula no dispare la escala.
    case when p.unidades_12m > 0 and p.stock_cantidad > 0
         then least(round(p.stock_cantidad / (p.unidades_12m / 365.0), 1), 999)
         when p.stock_cantidad > 0 then 999 end                as dias_cobertura,

    -- ---------- Pareto de producto ----------
    p.ranking_venta_12m::int                                   as ranking_venta_12m,
    round(case when p.total_12m > 0 then p.venta_12m / p.total_12m
               else 0 end, 6)::numeric(9,6)                    as participacion_12m,
    round(case when p.total_12m > 0 then p.acum_12m / p.total_12m
               else 0 end, 6)::numeric(9,6)                    as participacion_acumulada_12m,
    case
        when p.venta_12m <= 0                                              then 'S'
        when p.acum_12m / nullif(p.total_12m, 0) <= {{ corte_a }}          then 'A'
        when p.acum_12m / nullif(p.total_12m, 0) <= {{ corte_b }}          then 'B'
        else 'C'
    end                                                        as clase_abc_producto,
    case
        when p.venta_12m <= 0                                              then 'S · sin venta'
        when p.acum_12m / nullif(p.total_12m, 0) <= {{ corte_a }}          then 'A · clave'
        when p.acum_12m / nullif(p.total_12m, 0) <= {{ corte_b }}          then 'B · relevante'
        else 'C · cola larga'
    end                                                        as clase_abc_producto_nombre,

    -- ---------- banderas de acción ----------
    -- OCIOSO exige historia de venta: se compró para vender, se vendió, y dejó de venderse.
    -- Eso es dinero muerto y accionable (liquidar, promover, devolver al proveedor).
    -- Un producto con existencia que NUNCA se facturó es otra cosa y va en su propia bandera:
    -- en Grupo Cresta son 35,568 artículos con Q94M de alimento, medicina y materia prima que
    -- se CONSUMEN en producción y jamás pasan por una factura. Meterlos en 'ocioso' pondría el
    -- 95% del inventario en rojo y volvería la métrica inservible.
    (not p.es_servicio
     and p.stock_cantidad > 0
     and p.ultima_venta is not null
     and p.ultima_venta < current_date - interval '{{ dias_ocioso }} days')       as es_ocioso,
    -- Sin rotación comercial: hay existencia y nunca se facturó. En una comercializadora es
    -- alarma; en una productora es insumo normal. Se expone sin juzgar, para que cada
    -- organización lo lea con su contexto.
    (not p.es_servicio
     and p.stock_cantidad > 0
     and p.ultima_venta is null)                               as es_sin_rotacion_comercial,
    -- Quiebre: hubo demanda en la ventana reciente y hoy no hay qué despachar.
    (not p.es_servicio
     and p.lineas_demanda_reciente > 0
     and p.stock_cantidad <= 0)                                as es_quiebre,
    case
        when p.es_servicio                                                        then 'Servicio'
        when p.stock_cantidad <= 0 and p.lineas_demanda_reciente > 0              then 'Quiebre'
        when p.stock_cantidad <= 0                                                then 'Sin existencia'
        when p.ultima_venta is null                                               then 'Sin rotación comercial'
        when p.ultima_venta < current_date - interval '{{ dias_ocioso }} days'    then 'Ocioso'
        when p.lineas_demanda_reciente > 0                                        then 'Sano'
        else 'Lento'
    end                                                        as estado_producto,

    -- Trazabilidad (§12). Agregado: no arrastra el origen de una fila concreta.
    '{{ this.name }}'::text                                    as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text                as version_proceso
from pareto p
