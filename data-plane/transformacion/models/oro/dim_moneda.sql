{{ config(materialized='table') }}

select
    k.llave                                           as moneda_clave,
    d.empresa_id,
    d.moneda_codigo,
    d.nombre,
    d.es_local,
    {{ columnas_vigencia() }}
from {{ ref('plata_moneda') }} d
join {{ ref('llave_moneda') }} k
     on k.empresa_id = d.empresa_id and k.moneda_codigo = d.moneda_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    false,
    {{ columnas_vigencia() }}
