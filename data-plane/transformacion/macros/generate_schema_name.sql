{#
  Fuerza el nombre de schema EXACTO definido en +schema (bronze/silver/gold),
  sin el prefijo del target que dbt agrega por defecto. Así las capas medallion
  caen en los schemas creados por infra/local/init/01_esquemas.sql.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
