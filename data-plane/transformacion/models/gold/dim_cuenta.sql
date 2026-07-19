-- Dimensión cuenta contable (a nivel línea, §8). Incluye miembro default.
{{ config(materialized='table') }}

select empresa_id, cuenta_codigo, nombre, tipo_cuenta
from {{ ref('silver_cuenta') }}
union all
select 'GLOBAL', 'DESCONOCIDO', 'Cuenta desconocida', null
