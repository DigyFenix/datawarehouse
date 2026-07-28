{#
  Devuelve las columnas que disparan versión (SCD2) de un objeto maestro, leídas de la
  política de ingesta (metadatos.politica_ingesta) — la FUENTE DE VERDAD administrada en el portal.
  Se resuelve en ejecución (run_query), por eso NO sirve para el check_cols del snapshot (parseo):
  para eso está la var espejo. Este macro se usa en tests/gobernanza para detectar drift.
  Si la tabla de metadatos no existe en el entorno (p.ej. dbt aislado), devuelve la lista default.
#}
{% macro columnas_versionado(objeto, default=[]) %}
  {% if not execute %}
    {{ return(default) }}
  {% endif %}
  {% set rel = adapter.get_relation(database=target.database, schema='metadatos', identifier='politica_ingesta') %}
  {% if rel is none %}
    {{ return(default) }}
  {% endif %}
  {% set consulta %}
    select unnest(columnas_versionado) as col
    from metadatos.politica_ingesta
    where objeto = '{{ objeto }}'
    order by col
  {% endset %}
  {% set filas = run_query(consulta) %}
  {{ return(filas.columns[0].values() | list) }}
{% endmacro %}
