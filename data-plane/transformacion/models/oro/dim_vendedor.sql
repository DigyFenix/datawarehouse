{#
  `vendedor_codigo` = SlpCode en SAP B1. En Odoo esta dimensión queda con SOLO el miembro
  No definido: no hay maestro de vendedores. Es correcto y deliberado — el hecho cruza igual y el
  reporte muestra "No definido".
#}
{{ config(materialized='table') }}

select
    k.llave                                           as vendedor_clave,
    d.empresa_id,
    d.vendedor_codigo,
    d.nombre,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_vendedor') }} d
join {{ ref('llave_vendedor') }} k
     on k.empresa_id = d.empresa_id and k.vendedor_codigo = d.vendedor_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    true,
    {{ columnas_vigencia() }}
