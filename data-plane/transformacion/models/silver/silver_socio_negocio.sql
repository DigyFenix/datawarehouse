-- Dimensión canónica: socio de negocio (cliente). Mapea OCRD.
{{ config(materialized='table') }}

select
    empresa_id,
    cardcode                        as socio_negocio_codigo,
    cardname                        as nombre,
    cast(lictradnum as text)        as nit,
    region                          as region,
    case when validfor = 'Y' then true else false end as activo
from {{ ref('bronze_ocrd') }}
