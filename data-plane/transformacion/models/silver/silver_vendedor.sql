-- Dimensión canónica: vendedor. Mapea OSLP.
{{ config(materialized='table') }}

select
    empresa_id,
    cast(slpcode as text) as vendedor_codigo,
    slpname               as nombre,
    case when active = 'Y' then true else false end as activo
from {{ ref('bronze_oslp') }}
