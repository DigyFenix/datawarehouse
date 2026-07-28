-- Dimensión producto. Incluye miembro default/desconocido (§8).
{{ config(materialized='table') }}

select empresa_id, item_codigo, nombre, categoria, unidad_medida, activo
from {{ ref('silver_item') }}
union all
select 'GLOBAL', 'DESCONOCIDO', 'Producto desconocido', null, null, true
