-- Dimensión centro de costo (a nivel línea, §8). Incluye miembro default.
{{ config(materialized='table') }}

select empresa_id, centro_costo_codigo, nombre
from {{ ref('silver_centro_costo') }}
union all
select 'GLOBAL', 'DESCONOCIDO', 'Centro de costo desconocido'
