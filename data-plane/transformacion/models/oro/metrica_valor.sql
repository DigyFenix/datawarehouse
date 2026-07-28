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
        sum(monto_sin_impuesto_local) filter (where tipo_documento = 'factura')      as brutas_sin_iva,
        sum(monto_sin_impuesto_local) filter (where tipo_documento = 'nota_credito') as devol_sin_iva,
        sum(monto_sin_impuesto_local)                                      as netas_sin_iva,
        sum(costo_local)                                                   as costo,
        sum(margen_local)                                                  as margen
    from {{ ref('hecho_venta_linea') }}
    group by 1, 2
),
ventas_doc as (
    select
        empresa_id,
        to_char(fecha_documento, 'YYYY-MM')                                as periodo,
        sum(total_con_impuesto_local) filter (where tipo_documento = 'factura')      as brutas_con_iva,
        sum(total_con_impuesto_local) filter (where tipo_documento = 'nota_credito') as devol_con_iva,
        sum(total_con_impuesto_local)                                      as netas_con_iva
    from {{ ref('plata_documento_comercial') }}
    where flujo = 'venta'
    group by 1, 2
),
compras as (
    select
        empresa_id,
        to_char(fecha_documento, 'YYYY-MM')                                as periodo,
        sum(monto_sin_impuesto_local) filter (where tipo_documento = 'factura')      as brutas_sin_iva,
        sum(monto_sin_impuesto_local) filter (where tipo_documento = 'nota_credito') as nc_sin_iva,
        sum(monto_sin_impuesto_local)                                      as netas_sin_iva
    from {{ ref('hecho_compra_linea') }}
    group by 1, 2
),
compras_doc as (
    select
        empresa_id,
        to_char(fecha_documento, 'YYYY-MM')                                as periodo,
        sum(total_con_impuesto_local)                                      as netas_con_iva
    from {{ ref('plata_documento_comercial') }}
    where flujo = 'compra'
    group by 1, 2
),
cartera as (
    select empresa_id, 'cobrar' as tipo, sum(saldo_pendiente_local) as saldo, max(fecha_corte) as corte
      from {{ ref('hecho_cartera_cobrar') }} group by 1, 2
    union all
    select empresa_id, 'pagar', sum(saldo_pendiente_local), max(fecha_corte)
      from {{ ref('hecho_cartera_pagar') }} group by 1, 2
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
