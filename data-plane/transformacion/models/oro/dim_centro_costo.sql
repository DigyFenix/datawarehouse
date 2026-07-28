{#
  Además del miembro No definido, lleva el miembro MULTIPLE (-2): en Odoo una línea puede
  repartirse entre varios centros con porcentaje, y explotarla rompería el grano del hecho.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as centro_costo_clave,
    d.empresa_id,
    d.centro_costo_codigo,
    d.nombre,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_centro_costo') }} d
join {{ ref('llave_centro_costo') }} k
     on k.empresa_id = d.empresa_id and k.centro_costo_codigo = d.centro_costo_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    true,
    {{ columnas_vigencia() }}

union all

select
    -2, 'GLOBAL', 'MULTIPLE', 'Repartido entre varios centros', true,
    {{ columnas_vigencia() }}
