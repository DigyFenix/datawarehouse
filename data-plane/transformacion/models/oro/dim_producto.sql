{#
  `producto_codigo` es la llave de negocio del ERP: ItemCode en SAP B1, product_tmpl_id en Odoo.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as producto_clave,
    d.empresa_id,
    d.producto_codigo,
    d.nombre,
    d.grupo_codigo,
    d.unidad_medida,
    d.tipo_producto,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_producto') }} d
join {{ ref('llave_producto') }} k
     on k.empresa_id = d.empresa_id and k.producto_codigo = d.producto_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    null, null, null, true,
    {{ columnas_vigencia() }}

union all

-- Miembro SERVICIO (-2): las líneas de documento SIN código de artículo son servicios,
-- fletes y gastos (en Cresta son el 60% de las líneas de compra). Separarlas del miembro
-- No definido permite analizarlas como categoría real en vez de como dato faltante.
-- Mismo patrón que el miembro MULTIPLE (-2) de dim_centro_costo.
select
    -2, 'GLOBAL', 'SERVICIO', 'Servicio (sin artículo)',
    null, null, 'servicio', true,
    {{ columnas_vigencia() }}
