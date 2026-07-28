-- Dimensión organización = empresa -> sucursal (§8). Sucursal a nivel línea.
-- Incluye miembro default. El nombre de empresa se resolverá desde el registro de empresas
-- del tenant (por ahora derivado del empresa_id).
{{ config(materialized='table') }}

with sucursales as (
    select distinct empresa_id, sucursal_codigo
    from {{ ref('silver_linea_documento_venta') }}
    where sucursal_codigo is not null
)
select
    empresa_id,
    initcap(empresa_id)                    as empresa_nombre,
    sucursal_codigo,
    'Sucursal ' || sucursal_codigo         as nombre_sucursal
from sucursales
union all
select 'GLOBAL', 'Empresa desconocida', 'DESCONOCIDO', 'Sucursal desconocida'
