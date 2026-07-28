{#
  CONTROL DE CUADRE: compara el total del canónico contra el total del ORIGEN.
  Bronce es copia fiel de lo que devolvió el ERP, así que sirve de referencia: si Plata no
  coincide con Bronce, la transformación perdió o duplicó algo.

  REGLA DURA: si `cuadra = false`, los modelos de Oro que dependan de ese concepto NO se
  publican. Es la credibilidad del producto — en una demo, un total que no coincide con lo
  que el contador ve en su ERP mata la venta y no se recupera.

  Este control ya pagó su costo: detectó que filtrar los cancelados de SAP B1 con `<> 'Y'`
  dejaba pasar los documentos de cancelación ('C') e inflaba junio en Q1,634,294.22.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}
{#
  TOLERANCIA MIXTA: piso absoluto + componente que escala con el número de filas conciliadas.

  Por qué no basta un absoluto fijo: los importes de línea del ERP están redondeados a 4
  decimales y el total de cabecera se calcula sobre otra base, así que la suma de N líneas
  difiere del total de cabecera en un residuo que crece con N. Medido en proavisa: 25k líneas
  → 0.03; 187k líneas → 0.62. Un umbral fijo de 0.05 vuelve el control imposible de cumplir
  al ampliar la ventana de extracción, y un control que siempre falla deja de ser un control.

  El componente variable es 1 centavo por cada 1.000 filas (187k filas → 1.87). Sigue siendo
  tres órdenes de magnitud menor que cualquier error de lógica: el caso real que este control
  atrapó (cancelados de SAP B1 mal filtrados) desviaba Q1,634,294.22.
#}
{%- set tolerancia_base = var('tolerancia_cuadre', 0.05) -%}
{%- set tolerancia_por_fila = var('tolerancia_cuadre_por_fila', 0.00001) -%}

with
-- ---------------- lo que dice el canónico ----------------
canonico as (
    select empresa_id, 'saldo_cartera_cobrar' as concepto,
           sum(saldo_pendiente_local) as valor, count(*) as filas
      from {{ ref('plata_partida_cartera') }}
     where tipo_cartera = 'cobrar' and esta_abierta
     group by 1
    union all
    select empresa_id, 'saldo_cartera_pagar', sum(saldo_pendiente_local), count(*)
      from {{ ref('plata_partida_cartera') }}
     where tipo_cartera = 'pagar' and esta_abierta
     group by 1
    union all
    select empresa_id, 'ventas_periodo', sum(total_sin_impuesto_local), count(*)
      from {{ ref('plata_documento_comercial') }}
     where flujo = 'venta'
     group by 1
    union all
    select empresa_id, 'compras_periodo', sum(total_sin_impuesto_local), count(*)
      from {{ ref('plata_documento_comercial') }}
     where flujo = 'compra'
     group by 1
    union all
    -- Cuadre INTERNO: la suma de las líneas debe igualar el total de las cabeceras.
    -- Si no, el grano del hecho está mal (líneas duplicadas por un join, o líneas de
    -- impuesto colándose como si fueran de producto).
    select empresa_id, 'lineas_vs_cabecera_venta', sum(monto_sin_impuesto_local), count(*)
      from {{ ref('plata_documento_linea') }}
     where flujo = 'venta'
     group by 1
),

-- ---------------- lo que dijo el ERP (Bronce) ----------------
{% if erp == 'sap_b1' %}
origen as (
    select empresa_id, 'saldo_cartera_cobrar' as concepto,
           sum(coalesce((datos->>'BalDueDeb')::numeric, 0)
             - coalesce((datos->>'BalDueCred')::numeric, 0)) as valor
      from {{ source('bronce', 'jdt1') }} j
     where exists (select 1 from {{ ref('plata_cuenta') }} c
                    where c.cuenta_codigo = j.datos->>'Account'
                      and c.empresa_id = j.empresa_id and c.es_cartera_cobrar)
       and coalesce((datos->>'BalDueDeb')::numeric, 0)
        <> coalesce((datos->>'BalDueCred')::numeric, 0)
     group by 1
    union all
    select empresa_id, 'saldo_cartera_pagar',
           sum(coalesce((datos->>'BalDueDeb')::numeric, 0)
             - coalesce((datos->>'BalDueCred')::numeric, 0))
      from {{ source('bronce', 'jdt1') }} j
     where exists (select 1 from {{ ref('plata_cuenta') }} c
                    where c.cuenta_codigo = j.datos->>'Account'
                      and c.empresa_id = j.empresa_id and c.es_cartera_pagar)
       and coalesce((datos->>'BalDueDeb')::numeric, 0)
        <> coalesce((datos->>'BalDueCred')::numeric, 0)
     group by 1
    union all
    -- Ventas = facturas − notas de crédito, sin impuesto, moneda local.
    select empresa_id, 'ventas_periodo', sum(base) from (
        select empresa_id,
               (datos->>'DocTotal')::numeric - coalesce((datos->>'VatSum')::numeric, 0) as base
          from {{ source('bronce', 'oinv') }}
        union all
        select empresa_id,
               -1 * ((datos->>'DocTotal')::numeric - coalesce((datos->>'VatSum')::numeric, 0))
          from {{ source('bronce', 'orin') }}
    ) v group by 1
    union all
    select empresa_id, 'compras_periodo', sum(base) from (
        select empresa_id,
               (datos->>'DocTotal')::numeric - coalesce((datos->>'VatSum')::numeric, 0) as base
          from {{ source('bronce', 'opch') }}
        union all
        select empresa_id,
               -1 * ((datos->>'DocTotal')::numeric - coalesce((datos->>'VatSum')::numeric, 0))
          from {{ source('bronce', 'orpc') }}
    ) c group by 1
    union all
    -- Referencia del cuadre interno: total de cabeceras de venta.
    select empresa_id, 'lineas_vs_cabecera_venta', sum(base) from (
        select empresa_id,
               (datos->>'DocTotal')::numeric - coalesce((datos->>'VatSum')::numeric, 0) as base
          from {{ source('bronce', 'oinv') }}
        union all
        select empresa_id,
               -1 * ((datos->>'DocTotal')::numeric - coalesce((datos->>'VatSum')::numeric, 0))
          from {{ source('bronce', 'orin') }}
    ) v group by 1
)
{% else %}
origen as (
    select l.empresa_id, 'saldo_cartera_cobrar' as concepto,
           sum(coalesce((l.datos->>'amount_residual')::numeric, 0)) as valor
      from {{ source('bronce', 'account_move_line') }} l
     where exists (select 1 from {{ ref('plata_cuenta') }} c
                    where c.cuenta_codigo = l.datos->>'account_id'
                      and c.empresa_id = l.empresa_id and c.es_cartera_cobrar)
       and coalesce((l.datos->>'amount_residual')::numeric, 0) <> 0
     group by 1
    union all
    select l.empresa_id, 'saldo_cartera_pagar',
           sum(coalesce((l.datos->>'amount_residual')::numeric, 0))
      from {{ source('bronce', 'account_move_line') }} l
     where exists (select 1 from {{ ref('plata_cuenta') }} c
                    where c.cuenta_codigo = l.datos->>'account_id'
                      and c.empresa_id = l.empresa_id and c.es_cartera_pagar)
       and coalesce((l.datos->>'amount_residual')::numeric, 0) <> 0
     group by 1
    union all
    select empresa_id, 'ventas_periodo',
           sum((datos->>'amount_untaxed_signed')::numeric)
      from {{ source('bronce', 'account_move') }}
     where datos->>'move_type' in ('out_invoice', 'out_refund')
     group by 1
    union all
    select empresa_id, 'compras_periodo',
           sum((datos->>'amount_untaxed_signed')::numeric)
      from {{ source('bronce', 'account_move') }}
     where datos->>'move_type' in ('in_invoice', 'in_refund')
     group by 1
    union all
    select empresa_id, 'lineas_vs_cabecera_venta',
           sum((datos->>'amount_untaxed_signed')::numeric)
      from {{ source('bronce', 'account_move') }}
     where datos->>'move_type' in ('out_invoice', 'out_refund')
     group by 1
)
{% endif %}

select
    coalesce(k.empresa_id, o.empresa_id)              as empresa_id,
    coalesce(k.concepto, o.concepto)                  as concepto,
    current_date                                     as fecha_corte,
    round(coalesce(o.valor, 0), 4)::numeric(18,4)     as valor_erp,
    round(coalesce(k.valor, 0), 4)::numeric(18,4)     as valor_canonico,
    round(coalesce(k.valor, 0) - coalesce(o.valor, 0), 4)::numeric(18,4) as diferencia,
    case when coalesce(o.valor, 0) <> 0
         then round(abs((coalesce(k.valor,0) - coalesce(o.valor,0)) / o.valor) * 100, 4)
         else null end::numeric(9,4)                  as diferencia_pct,
    greatest(
        {{ tolerancia_base }},
        coalesce(k.filas, 0) * {{ tolerancia_por_fila }}
    )::numeric(18,4)                                  as tolerancia,
    abs(coalesce(k.valor, 0) - coalesce(o.valor, 0)) <= greatest(
        {{ tolerancia_base }},
        coalesce(k.filas, 0) * {{ tolerancia_por_fila }}
    ) as cuadra,
    coalesce(k.filas, 0)                              as filas_canonico,
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text        as version_proceso
from canonico k
full outer join origen o
     on o.empresa_id = k.empresa_id and o.concepto = k.concepto
