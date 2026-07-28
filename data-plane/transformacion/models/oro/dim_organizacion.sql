{{ config(materialized='table') }}

select
    k.llave                                           as organizacion_clave,
    d.empresa_id,
    d.nombre,
    d.nit,
    d.moneda_local,
    {{ columnas_vigencia() }}
from {{ ref('plata_organizacion') }} d
join {{ ref('llave_organizacion') }} k
     on k.empresa_id = d.empresa_id

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ nombre_no_definido() }}, null, null,
    {{ columnas_vigencia() }}
