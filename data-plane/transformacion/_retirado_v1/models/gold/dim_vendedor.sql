-- Dimensión vendedor. Incluye miembro default/desconocido (§8).
{{ config(materialized='table') }}

select empresa_id, vendedor_codigo, nombre, activo
from {{ ref('silver_vendedor') }}
union all
select 'GLOBAL', 'DESCONOCIDO', 'Vendedor desconocido', true
