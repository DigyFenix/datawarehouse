{#
  MÉTRICAS CERTIFICADAS DESGLOSADAS POR DIMENSIÓN — (empresa, métrica, período, dimensión, miembro) → valor.

  Es la segunda mitad del contrato del agente de IA: `metrica_valor` responde «¿cuánto?» por mes y
  empresa; esta tabla responde «¿quién / qué?» — ventas por cliente, por producto, por vendedor,
  compras por proveedor, cobros por cliente — SIN que el agente arme SQL ni toque los hechos.

  Reglas:
    · Las CLAVES y la fórmula son EXACTAMENTE las de `metrica_valor` (mismo hecho, mismo filtro):
      la suma de los miembros de un período cuadra con el valor mensual de la métrica. Una métrica
      que no esté aquí no se puede desglosar; el agente lo dice en vez de inventar.
    · Solo las métricas ADITIVAS por línea entran: nada de razones, saldos ni fotos (esas viven en
      `metrica_aging` / `metrica_valor`).
    · El miembro lleva código y nombre tal como están en la dimensión (una fila por clave: las
      dimensiones de Oro no son SCD2), calificado por empresa: dos sociedades con el mismo código
      de cliente son dos miembros distintos.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

with catalogo as (
    -- nombre y dominio de cada clave, tal como los publica metrica_valor
    select distinct metrica_clave, metrica_nombre, dominio
    from {{ ref('metrica_valor') }}
),

-- ------------------------------------------------------------------ ventas (hecho de línea)
ventas_base as (
    select
        v.empresa_id,
        to_char(v.fecha_documento, 'YYYY-MM')          as periodo,
        v.cliente_clave, v.producto_clave, v.vendedor_clave, v.canal_clave, v.condicion_pago_clave,
        v.tipo_documento,
        v.monto_sin_impuesto,
        v.costo,
        v.margen
    from {{ ref('hecho_venta_linea') }} v
),
ventas_metricas as (
    select empresa_id, periodo, cliente_clave, producto_clave, vendedor_clave, canal_clave, condicion_pago_clave,
           'ventas_netas_sin_iva'  as metrica_clave, monto_sin_impuesto as valor
      from ventas_base
    union all
    select empresa_id, periodo, cliente_clave, producto_clave, vendedor_clave, canal_clave, condicion_pago_clave,
           'ventas_brutas_sin_iva', monto_sin_impuesto
      from ventas_base where tipo_documento = 'factura'
    union all
    -- La nota de crédito viene NEGATIVA desde Plata; metrica_valor publica las devoluciones en
    -- positivo (abs), así que aquí también: un ranking «mayores devoluciones» debe ordenar bien.
    select empresa_id, periodo, cliente_clave, producto_clave, vendedor_clave, canal_clave, condicion_pago_clave,
           'devoluciones_sin_iva', abs(monto_sin_impuesto)
      from ventas_base where tipo_documento = 'nota_credito'
    union all
    select empresa_id, periodo, cliente_clave, producto_clave, vendedor_clave, canal_clave, condicion_pago_clave,
           'margen_bruto', margen
      from ventas_base
    union all
    select empresa_id, periodo, cliente_clave, producto_clave, vendedor_clave, canal_clave, condicion_pago_clave,
           'costo_de_ventas', costo
      from ventas_base
),
ventas_dim as (
    select m.empresa_id, m.metrica_clave, m.periodo, 'cliente' as dimension,
           c.cliente_codigo as miembro_codigo, c.nombre as miembro_nombre, sum(m.valor) as valor
      from ventas_metricas m
      join {{ ref('dim_cliente') }} c on c.cliente_clave = m.cliente_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'producto',
           p.producto_codigo, p.nombre, sum(m.valor)
      from ventas_metricas m
      join {{ ref('dim_producto') }} p on p.producto_clave = m.producto_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'linea',
           coalesce(p.grupo_nombre, 'Sin línea'), coalesce(p.grupo_nombre, 'Sin línea'), sum(m.valor)
      from ventas_metricas m
      join {{ ref('dim_producto') }} p on p.producto_clave = m.producto_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'vendedor',
           d.vendedor_codigo, d.nombre, sum(m.valor)
      from ventas_metricas m
      join {{ ref('dim_vendedor') }} d on d.vendedor_clave = m.vendedor_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'canal',
           d.canal_codigo, d.nombre, sum(m.valor)
      from ventas_metricas m
      join {{ ref('dim_canal') }} d on d.canal_clave = m.canal_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'sector',
           d.condicion_pago_codigo, d.nombre, sum(m.valor)
      from ventas_metricas m
      join {{ ref('dim_condicion_pago') }} d on d.condicion_pago_clave = m.condicion_pago_clave
     group by 1, 2, 3, 4, 5, 6
),

-- ------------------------------------------------------------------ compras (hecho de línea)
compras_base as (
    select
        c.empresa_id,
        to_char(c.fecha_documento, 'YYYY-MM')          as periodo,
        c.proveedor_clave, c.producto_clave, c.tipo_documento, c.monto_sin_impuesto
    from {{ ref('hecho_compra_linea') }} c
),
compras_metricas as (
    select empresa_id, periodo, proveedor_clave, producto_clave, 'compras_netas_sin_iva' as metrica_clave, monto_sin_impuesto as valor
      from compras_base
    union all
    select empresa_id, periodo, proveedor_clave, producto_clave, 'compras_brutas_sin_iva', monto_sin_impuesto
      from compras_base where tipo_documento = 'factura'
),
compras_dim as (
    select m.empresa_id, m.metrica_clave, m.periodo, 'proveedor' as dimension,
           p.proveedor_codigo as miembro_codigo, p.nombre as miembro_nombre, sum(m.valor) as valor
      from compras_metricas m
      join {{ ref('dim_proveedor') }} p on p.proveedor_clave = m.proveedor_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'producto',
           p.producto_codigo, p.nombre, sum(m.valor)
      from compras_metricas m
      join {{ ref('dim_producto') }} p on p.producto_clave = m.producto_clave
     group by 1, 2, 3, 4, 5, 6
    union all
    select m.empresa_id, m.metrica_clave, m.periodo, 'linea',
           coalesce(p.grupo_nombre, 'Sin línea'), coalesce(p.grupo_nombre, 'Sin línea'), sum(m.valor)
      from compras_metricas m
      join {{ ref('dim_producto') }} p on p.producto_clave = m.producto_clave
     group by 1, 2, 3, 4, 5, 6
),

-- ------------------------------------------------------------------ tesorería (misma contraparte que metrica_valor)
cobros_dim as (
    select p.empresa_id, 'cobros_de_clientes' as metrica_clave, to_char(p.fecha_pago, 'YYYY-MM') as periodo,
           'cliente' as dimension, c.cliente_codigo as miembro_codigo, c.nombre as miembro_nombre, sum(p.monto) as valor
      from {{ ref('hecho_pago_recibido') }} p
      join {{ ref('dim_cliente') }} c on c.cliente_clave = p.cliente_clave
     where p.contraparte = 'cliente'
     group by 1, 2, 3, 4, 5, 6
),
pagos_dim as (
    select p.empresa_id, 'pagos_a_proveedores' as metrica_clave, to_char(p.fecha_pago, 'YYYY-MM') as periodo,
           'proveedor' as dimension, d.proveedor_codigo as miembro_codigo, d.nombre as miembro_nombre, sum(p.monto) as valor
      from {{ ref('hecho_pago_efectuado') }} p
      join {{ ref('dim_proveedor') }} d on d.proveedor_clave = p.proveedor_clave
     where p.contraparte = 'proveedor'
     group by 1, 2, 3, 4, 5, 6
),

todo as (
    select * from ventas_dim
    union all select * from compras_dim
    union all select * from cobros_dim
    union all select * from pagos_dim
)

select
    t.empresa_id,
    k.dominio,
    t.metrica_clave,
    k.metrica_nombre,
    t.periodo,
    t.dimension,
    t.miembro_codigo,
    t.miembro_nombre,
    round(t.valor::numeric, 4)      as valor,
    '{{ this.name }}'::text          as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text as version_proceso
from todo t
join catalogo k on k.metrica_clave = t.metrica_clave
where t.valor is not null
