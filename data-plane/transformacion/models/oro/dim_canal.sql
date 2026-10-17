{#
  CANAL COMERCIAL: el equipo de ventas que lleva el documento (crm_team en Odoo). En SAP B1 el
  paquete base no lo tiene: la dimensión queda con el miembro No definido y el hecho cruza igual.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as canal_clave,
    d.empresa_id,
    d.canal_codigo,
    d.nombre,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_canal') }} d
join {{ ref('llave_canal') }} k
     on k.empresa_id = d.empresa_id and k.canal_codigo = d.canal_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    true,
    {{ columnas_vigencia() }}
