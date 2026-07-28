-- Dimensión canónica: item (producto). Mapea OITM.
{{ config(materialized='table') }}

select
    empresa_id,
    itemcode                 as item_codigo,
    itemname                 as nombre,
    cast(itmsgrpcod as text) as categoria,
    salunitmsr               as unidad_medida,
    case when validfor = 'Y' then true else false end as activo
from {{ ref('bronze_oitm') }}
