{#
  `almacen_codigo` = WhsCode en SAP B1, id de stock_warehouse en Odoo.
  Reemplaza el nivel "sucursal": ninguna sociedad de Cresta usa sucursales, pero el almacén está
  en 97.5% de las líneas.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as almacen_clave,
    d.empresa_id,
    d.almacen_codigo,
    d.nombre,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_almacen') }} d
join {{ ref('llave_almacen') }} k
     on k.empresa_id = d.empresa_id and k.almacen_codigo = d.almacen_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    true,
    {{ columnas_vigencia() }}
