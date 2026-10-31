{#
  Qué métricas se pueden desglosar y por qué dimensiones. Tabla diminuta (decenas de filas) que
  el agente lee en CADA mensaje: sin ella tendría que hacer `select distinct` sobre la tabla
  completa de desgloses (grano empresa × métrica × mes × dimensión × miembro).
#}
{{ config(materialized = 'table') }}

select distinct
    d.metrica_clave,
    d.dimension,
    '{{ this.name }}'::text as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text as version_proceso
from {{ ref('metrica_valor_dimension') }} d
