{#
  MÉTRICAS CERTIFICADAS en formato largo: (empresa, métrica, período) → valor.

  Por qué una sola tabla y no 14: Power BI agrega por sí mismo, así que pre-agregar cada métrica
  en su propia tabla sería redundante y frágil. Esta tabla existe para lo que SÍ necesita el valor
  ya calculado:
    - validar contra el ERP (comparar contra el reporte que ve el contador),
    - el agente de IA, que consulta por CLAVE de métrica y nunca arma SQL libre,
    - cerrar el ciclo del catálogo (metadatos.catalogo_metricas).
  En Power BI las mismas definiciones van como medidas DAX sobre los hechos.

  IVA GUATEMALTECO: va incluido en el precio (12% del total ≈ 13.64% sobre la base). Por eso las
  ventas y compras se publican EXPLÍCITAS en versión sin IVA y con IVA, en lugar de dejar la
  ambigüedad que este proyecto existe para eliminar.
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

{#- IMPORTANTE — de dónde sale cada monto:
    · SIN IVA, costo y margen  → del HECHO DE LÍNEA. Son aditivos por línea.
    · CON IVA                  → de la CABECERA del documento. El IVA se calcula a nivel
      DOCUMENTO, no por línea: sumar el total-con-IVA de las líneas da Q25.37 de diferencia
      contra el documento en junio de Cresta, por prorrateo y redondeo. Para que la métrica
      cuadre con lo que ve el contador en el ERP, el "con IVA" tiene que venir del documento. -#}
with ventas as (
    select
        empresa_id,
        to_char(fecha_documento, 'YYYY-MM')                                as periodo,
        -- En moneda de PRESENTACIÓN (los hechos ya la traen): las métricas certificadas
        -- rigen en el idioma del grupo; el cuadre contra el ERP en local vive en Plata.
        sum(monto_sin_impuesto) filter (where tipo_documento = 'factura')  as brutas_sin_iva,
        sum(monto_sin_impuesto) filter (where tipo_documento = 'nota_credito') as devol_sin_iva,
        sum(monto_sin_impuesto)                                            as netas_sin_iva,
        sum(costo)                                                         as costo,
        sum(margen)                                                        as margen
    from {{ ref('hecho_venta_linea') }}
    group by 1, 2
),
ventas_doc as (
    select
        d.empresa_id,
        to_char(d.fecha_documento, 'YYYY-MM')                              as periodo,
        sum(d.total_con_impuesto_local / tp.tasa) filter (where d.tipo_documento = 'factura')      as brutas_con_iva,
        sum(d.total_con_impuesto_local / tp.tasa) filter (where d.tipo_documento = 'nota_credito') as devol_con_iva,
        sum(d.total_con_impuesto_local / tp.tasa)                          as netas_con_iva
    from {{ ref('plata_documento_comercial') }} d
    left join {{ ref('plata_tasa_presentacion') }} tp
           on tp.empresa_id = d.empresa_id and tp.fecha = d.fecha_documento
    where d.flujo = 'venta'
    group by 1, 2
),
compras as (
    select
        empresa_id,
        to_char(fecha_documento, 'YYYY-MM')                                as periodo,
        sum(monto_sin_impuesto) filter (where tipo_documento = 'factura') as brutas_sin_iva,
        sum(monto_sin_impuesto) filter (where tipo_documento = 'nota_credito') as nc_sin_iva,
        sum(monto_sin_impuesto)                                            as netas_sin_iva
    from {{ ref('hecho_compra_linea') }}
    group by 1, 2
),
compras_doc as (
    select
        d.empresa_id,
        to_char(d.fecha_documento, 'YYYY-MM')                              as periodo,
        sum(d.total_con_impuesto_local / tp.tasa)                          as netas_con_iva
    from {{ ref('plata_documento_comercial') }} d
    left join {{ ref('plata_tasa_presentacion') }} tp
           on tp.empresa_id = d.empresa_id and tp.fecha = d.fecha_documento
    where d.flujo = 'compra'
    group by 1, 2
),
cartera as (
    select empresa_id, 'cobrar' as tipo, sum(saldo_pendiente) as saldo, max(fecha_corte) as corte
      from {{ ref('hecho_cartera_cobrar') }} group by 1, 2
    union all
    select empresa_id, 'pagar', sum(saldo_pendiente), max(fecha_corte)
      from {{ ref('hecho_cartera_pagar') }} group by 1, 2
),

-- Fuga de margen: venta facturada por debajo del costo registrado en la línea. En Odoo el costo
-- de línea no existe (llega en 0), así que estas dos métricas salen en 0 — degradan, no rompen.
fuga_margen as (
    select
        empresa_id,
        to_char(fecha_documento, 'YYYY-MM')                                as periodo,
        sum(monto_sin_impuesto) filter (where margen < 0)                  as venta_bajo_costo,
        sum(margen) filter (where margen < 0)                              as margen_negativo
    from {{ ref('hecho_venta_linea') }}
    group by 1, 2
),

-- Resultados del mayor contable. `monto_resultado` ya viene volteado a la naturaleza de la
-- cuenta, así que las tres se suman sin pensar en signos.
resultados as (
    select
        empresa_id,
        to_char(fecha, 'YYYY-MM')                                          as periodo,
        sum(monto_resultado) filter (where naturaleza = 'ingreso')         as ingresos,
        sum(monto_resultado) filter (where naturaleza = 'gasto')           as gastos,
        sum(monto_resultado) filter (where naturaleza = 'costo')           as costos
    from {{ ref('hecho_movimiento_contable') }}
    group by 1, 2
),

-- Tesorería real: solo la contraparte de negocio. ORCT mezcla cobranza con operaciones contra
-- cuenta contable (depósitos, traslados) y sin el filtro la "cobranza" se triplica.
cobranza as (
    select
        empresa_id,
        to_char(fecha_pago, 'YYYY-MM')                                     as periodo,
        sum(monto) filter (where contraparte = 'cliente')                  as cobros_clientes
    from {{ ref('hecho_pago_recibido') }}
    group by 1, 2
),
pagos_prov as (
    select
        empresa_id,
        to_char(fecha_pago, 'YYYY-MM')                                     as periodo,
        sum(monto) filter (where contraparte = 'proveedor')                as pagos_proveedores
    from {{ ref('hecho_pago_efectuado') }}
    group by 1, 2
),

-- Inventario y su calidad. Son FOTO a la fecha de corte, no flujo: el período es el del corte,
-- igual que la cartera.
inventario as (
    select
        i.empresa_id,
        to_char(max(i.fecha_corte), 'YYYY-MM')                             as periodo,
        sum(i.valor)                                                       as valor_total
    from {{ ref('hecho_inventario') }} i
    group by 1
),
calidad_inventario as (
    select
        empresa_id,
        to_char(current_date, 'YYYY-MM')                                   as periodo,
        sum(stock_valor) filter (where es_ocioso)                          as valor_ocioso,
        sum(stock_valor) filter (where es_sin_rotacion_comercial)          as valor_sin_rotacion,
        sum(venta_12m)   filter (where es_quiebre)                         as venta_en_riesgo
    from {{ ref('analisis_producto') }}
    group by 1
),

-- Compromiso pendiente de entregar. El backlog vencido es la parte cuya fecha prometida ya pasó.
pedidos as (
    select
        empresa_id,
        to_char(current_date, 'YYYY-MM')                                   as periodo,
        sum(monto_abierto) filter (where es_abierta)                       as backlog,
        sum(monto_abierto) filter (where es_abierta
                                     and fecha_entrega < current_date)     as backlog_vencido
    from {{ ref('hecho_pedido_linea') }}
    group by 1
)

-- ---------------------------------------------------------------- ventas
select empresa_id, 'ventas' as dominio, 'ventas_brutas_sin_iva' as metrica_clave,
       'Ventas Brutas (sin IVA)' as metrica_nombre, periodo,
       coalesce(brutas_sin_iva, 0)::numeric(18,4) as valor
  from ventas
union all
select empresa_id, 'ventas', 'ventas_brutas_con_iva', 'Ventas Brutas (con IVA)', periodo,
       coalesce(brutas_con_iva, 0)::numeric(18,4) from ventas_doc
union all
select empresa_id, 'ventas', 'devoluciones_sin_iva', 'Devoluciones (sin IVA)', periodo,
       abs(coalesce(devol_sin_iva, 0))::numeric(18,4) from ventas
union all
select empresa_id, 'ventas', 'devoluciones_con_iva', 'Devoluciones (con IVA)', periodo,
       abs(coalesce(devol_con_iva, 0))::numeric(18,4) from ventas_doc
union all
select empresa_id, 'ventas', 'ventas_netas_sin_iva', 'Ventas Netas (sin IVA)', periodo,
       coalesce(netas_sin_iva, 0)::numeric(18,4) from ventas
union all
select empresa_id, 'ventas', 'ventas_netas_con_iva', 'Ventas Netas (con IVA)', periodo,
       coalesce(netas_con_iva, 0)::numeric(18,4) from ventas_doc
union all
select empresa_id, 'ventas', 'costo_de_ventas', 'Costo de Ventas', periodo,
       coalesce(costo, 0)::numeric(18,4) from ventas
union all
select empresa_id, 'ventas', 'margen_bruto', 'Margen Bruto', periodo,
       coalesce(margen, 0)::numeric(18,4) from ventas

-- ---------------------------------------------------------------- compras
union all
select empresa_id, 'compras', 'compras_brutas_sin_iva', 'Compras Brutas (sin IVA)', periodo,
       coalesce(brutas_sin_iva, 0)::numeric(18,4) from compras
union all
select empresa_id, 'compras', 'notas_credito_compra', 'Notas de Crédito Compra', periodo,
       abs(coalesce(nc_sin_iva, 0))::numeric(18,4) from compras
union all
select empresa_id, 'compras', 'compras_netas_sin_iva', 'Compras Netas (sin IVA)', periodo,
       coalesce(netas_sin_iva, 0)::numeric(18,4) from compras
union all
select empresa_id, 'compras', 'compras_netas_con_iva', 'Compras Netas (con IVA)', periodo,
       coalesce(netas_con_iva, 0)::numeric(18,4) from compras_doc

-- ---------------------------------------------------------------- cartera
-- Saldo A LA FECHA DE CORTE, no por período: es un stock, no un flujo.
union all
select empresa_id, 'tesoreria', 'saldo_cxc', 'Saldo Cuentas por Cobrar',
       to_char(corte, 'YYYY-MM'), coalesce(saldo, 0)::numeric(18,4)
  from cartera where tipo = 'cobrar'
union all
select empresa_id, 'tesoreria', 'saldo_cxp', 'Saldo Cuentas por Pagar',
       to_char(corte, 'YYYY-MM'), abs(coalesce(saldo, 0))::numeric(18,4)
  from cartera where tipo = 'pagar'
union all
select empresa_id, 'tesoreria', 'cobros_de_clientes', 'Cobros de Clientes', periodo,
       coalesce(cobros_clientes, 0)::numeric(18,4) from cobranza
union all
select empresa_id, 'tesoreria', 'pagos_a_proveedores', 'Pagos a Proveedores', periodo,
       coalesce(pagos_proveedores, 0)::numeric(18,4) from pagos_prov

-- ---------------------------------------------------------------- fuga de margen
union all
select empresa_id, 'ventas', 'ventas_bajo_costo', 'Ventas Bajo Costo', periodo,
       coalesce(venta_bajo_costo, 0)::numeric(18,4) from fuga_margen
union all
select empresa_id, 'ventas', 'margen_perdido_bajo_costo', 'Margen Perdido Bajo Costo', periodo,
       abs(coalesce(margen_negativo, 0))::numeric(18,4) from fuga_margen

-- ---------------------------------------------------------------- resultados del mayor
union all
select empresa_id, 'rentabilidad', 'ingresos_contables', 'Ingresos Contables', periodo,
       coalesce(ingresos, 0)::numeric(18,4) from resultados
union all
select empresa_id, 'rentabilidad', 'gasto_operativo', 'Gasto Operativo', periodo,
       coalesce(gastos, 0)::numeric(18,4) from resultados
union all
select empresa_id, 'rentabilidad', 'costo_contable', 'Costo Contable', periodo,
       coalesce(costos, 0)::numeric(18,4) from resultados
union all
select empresa_id, 'rentabilidad', 'resultado_contable', 'Resultado Contable', periodo,
       (coalesce(ingresos, 0) - coalesce(costos, 0) - coalesce(gastos, 0))::numeric(18,4)
  from resultados

-- ---------------------------------------------------------------- inventario (foto)
union all
select empresa_id, 'inventario', 'valor_inventario', 'Valor de Inventario', periodo,
       coalesce(valor_total, 0)::numeric(18,4) from inventario
union all
select empresa_id, 'inventario', 'valor_inventario_ocioso', 'Valor de Inventario Ocioso', periodo,
       coalesce(valor_ocioso, 0)::numeric(18,4) from calidad_inventario
union all
select empresa_id, 'inventario', 'valor_sin_rotacion_comercial', 'Valor sin Rotación Comercial',
       periodo, coalesce(valor_sin_rotacion, 0)::numeric(18,4) from calidad_inventario
union all
select empresa_id, 'inventario', 'venta_en_riesgo_por_quiebre', 'Venta Anual en Riesgo por Quiebre',
       periodo, coalesce(venta_en_riesgo, 0)::numeric(18,4) from calidad_inventario

-- ---------------------------------------------------------------- pedidos (foto)
union all
select empresa_id, 'pedidos', 'backlog', 'Backlog', periodo,
       coalesce(backlog, 0)::numeric(18,4) from pedidos
union all
select empresa_id, 'pedidos', 'backlog_vencido', 'Backlog Vencido', periodo,
       coalesce(backlog_vencido, 0)::numeric(18,4) from pedidos
