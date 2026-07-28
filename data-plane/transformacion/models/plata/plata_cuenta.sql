{#
  Plan de cuentas canónico. PIEZA OBLIGATORIA DEL PIPELINE DE CARTERA: `tipo_cuenta` es lo
  que decide qué partida del mayor es cuenta por cobrar o por pagar.

  Sin esta clasificación la cartera sale mal: el mayor incluye inventario y producción
  (en Proavisa, 1,043,823 de 1,732,253 partidas tienen saldo y la mayoría NO es cartera).

  SAP B1 no marca las cuentas de cartera, así que se DEDUCEN de las cuentas de control de
  los socios (OCRD.DebPayAcct): si una cuenta es la de control de clientes → por cobrar; de
  proveedores → por pagar. Así el paquete funciona en cualquier instalación sin hardcodear
  códigos, que cambian de empresa a empresa.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

with control_socios as (
    -- Cuentas de control usadas por los socios, y para qué tipo de socio.
    select
        cuenta_control_codigo                                        as cuenta_codigo,
        max(case when es_cliente   then 1 else 0 end)                as usada_por_cliente,
        max(case when es_proveedor then 1 else 0 end)                as usada_por_proveedor
    from {{ ref('plata_socio_negocio') }}
    where cuenta_control_codigo is not null
    group by 1
)

select
    a.empresa_id,
    a.datos->>'AcctCode'                              as cuenta_codigo,
    nullif(trim(a.datos->>'FormatCode'), '')          as cuenta_codigo_visible,
    trim(a.datos->>'AcctName')                        as nombre,
    case
        when c.usada_por_cliente   = 1 then 'por_cobrar'
        when c.usada_por_proveedor = 1 then 'por_pagar'
        when a.datos->>'ActType'   = 'I' then 'ingreso'
        when a.datos->>'ActType'   = 'E' then 'gasto'
        else 'otro'
    end                                               as tipo_cuenta,
    coalesce(c.usada_por_cliente, 0)   = 1            as es_cartera_cobrar,
    coalesce(c.usada_por_proveedor, 0) = 1            as es_cartera_pagar,
    coalesce(a.datos->>'Postable', 'Y') = 'Y'         as permite_conciliacion,
    true                                              as activa,
    {{ columnas_trazabilidad('a') }}
from {{ source('bronce', 'oact') }} a
left join control_socios c on c.cuenta_codigo = a.datos->>'AcctCode'

{% else %}

select
    empresa_id,
    datos->>'id'                                      as cuenta_codigo,
    -- Odoo 18: el código vive en `code_store`, un jsonb con una clave por compañía.
    -- No hay columna `code`. Se toma el primer valor disponible.
    (select v from jsonb_each_text(datos->'code_store') as t(k, v) limit 1)
                                                      as cuenta_codigo_visible,
    {{ odoo_texto('datos', 'name') }}                 as nombre,
    case datos->>'account_type'
        when 'asset_receivable'  then 'por_cobrar'
        when 'liability_payable' then 'por_pagar'
        when 'asset_cash'        then 'banco'
        when 'income'            then 'ingreso'
        when 'income_other'      then 'ingreso'
        when 'expense'           then 'gasto'
        when 'expense_direct_cost' then 'costo'
        when 'asset_current'     then 'activo'
        when 'asset_non_current' then 'activo'
        when 'asset_fixed'       then 'activo'
        when 'liability_current' then 'pasivo'
        when 'liability_non_current' then 'pasivo'
        when 'equity'            then 'patrimonio'
        when 'equity_unaffected' then 'patrimonio'
        when 'off_balance'       then 'orden'
        else 'otro'
    end                                               as tipo_cuenta,
    datos->>'account_type' = 'asset_receivable'        as es_cartera_cobrar,
    datos->>'account_type' = 'liability_payable'       as es_cartera_pagar,
    coalesce((datos->>'reconcile')::boolean, false)    as permite_conciliacion,
    not coalesce((datos->>'deprecated')::boolean, false) as activa,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'account_account') }}

{% endif %}
