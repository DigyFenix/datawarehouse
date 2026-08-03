{#
  `cuenta_codigo`         = llave de negocio interna del ERP (AcctCode en SAP B1, id en Odoo).
  `cuenta_codigo_visible` = el código que el CONTADOR reconoce (FormatCode en SAP B1,
                            code_store en Odoo 18). Es el que va en los reportes.

  JERARQUÍA: nivel_1..nivel_5 (código y nombre) vienen homologados de Plata — árbol real por
  FatherNum en SAP B1, segmentos del código en Odoo. Permiten filtrar por cualquier nivel
  ("todo Activo", "gastos de administración") y armar la jerarquía de drill-down en Power BI.
  `es_titulo` marca las cuentas de agrupación (no imputables) para excluirlas de listados.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as cuenta_clave,
    d.empresa_id,
    d.cuenta_codigo,
    d.cuenta_codigo_visible,
    d.nombre,
    d.tipo_cuenta,
    d.es_cartera_cobrar,
    d.es_cartera_pagar,
    d.es_titulo,
    d.activa,
    d.cuenta_padre_codigo,
    d.nivel,
    {% for n in range(1, 6) -%}
    d.nivel_{{ n }}_codigo,
    d.nivel_{{ n }}_nombre,
    {% endfor -%}
    d.ruta_cuenta,
    {{ columnas_vigencia() }}
from {{ ref('plata_cuenta') }} d
join {{ ref('llave_cuenta') }} k
     on k.empresa_id = d.empresa_id and k.cuenta_codigo = d.cuenta_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, null,
    {{ nombre_no_definido() }}, 'otro', false, false, false, true,
    null, 1,
    {% for n in range(1, 6) -%}
    {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    {% endfor -%}
    {{ nombre_no_definido() }},
    {{ columnas_vigencia() }}
