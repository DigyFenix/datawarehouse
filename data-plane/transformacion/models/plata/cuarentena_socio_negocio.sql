{#
  Cuarentena de socios de negocio (CLAUDE.md §10). Guarda el registro completo + la regla
  violada + el momento de detección, para que el Data Steward lo corrija EN EL ERP.
  No bloquea el pipeline: Plata publica lo válido y esto queda como pendiente de gobierno.
#}
{{ config(materialized='table') }}

select
    p.*,
    case
        when p.socio_codigo is null                       then 'socio_codigo nulo'
        when p.nombre is null or trim(p.nombre) = ''       then 'nombre vacío (completitud)'
        else 'regla no clasificada'
    end                       as regla_violada,
    current_timestamp         as detectado_en
from {{ ref('prep_socio_negocio') }} p
where p.socio_codigo is null
   or p.nombre is null
   or trim(p.nombre) = ''
