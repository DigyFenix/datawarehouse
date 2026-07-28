{#
  Socio de negocio canónico VÁLIDO. Los registros que violan una regla de calidad NO se
  descartan ni bloquean la corrida: se desvían a `cuarentena_socio_negocio` (CLAUDE.md §10).

  Caso real que motivó esto: en Iron Network el socio 337 tiene rango de cliente y NIT pero
  el nombre vacío (es un contacto hijo de la empresa 336 al que se le facturó). Sin cuarentena,
  el test de completitud tumbaba toda la corrida por una fila.
#}
{{ config(materialized='table') }}

select *
from {{ ref('prep_socio_negocio') }}
where nombre is not null
  and trim(nombre) <> ''
  and socio_codigo is not null
