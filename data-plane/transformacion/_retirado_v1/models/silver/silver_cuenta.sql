-- Dimensión canónica: cuenta contable. Mapea OACT.
{{ config(materialized='table') }}

select
    empresa_id,
    cast(acctcode as text) as cuenta_codigo,
    acctname               as nombre,
    groupmask              as tipo_cuenta
from {{ ref('bronze_oact') }}
