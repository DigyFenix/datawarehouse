-- Dimensión cliente. Incluye miembro default/desconocido (CLAUDE.md §8).
{{ config(materialized='table') }}

select empresa_id, socio_negocio_codigo, nombre, nit, region, activo
from {{ ref('silver_socio_negocio') }}
union all
select 'GLOBAL', 'DESCONOCIDO', 'Cliente desconocido', null, null, true
