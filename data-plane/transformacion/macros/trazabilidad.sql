{#
  Columnas técnicas de linaje que arrastra toda tabla de Plata y Oro (CLAUDE.md §12).
  No se declaran en los contratos canónicos porque son de infraestructura, no de negocio.
#}
{% macro columnas_trazabilidad(alias='') %}
    {%- set p = (alias ~ '.') if alias else '' -%}
    {{ p }}fuente_origen,
    {{ p }}extraido_en,
    '{{ this.name }}'::text as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text as version_proceso
{% endmacro %}


{#
  Falla la compilación si el tenant no declaró su ERP. Sin esto, un target mal configurado
  produciría modelos vacíos en silencio, que es peor que un error.
#}
{% macro erp_actual() %}
{#- OJO: este macro NO debe emitir whitespace. Su valor se compara con `==` en los modelos
    y un solo espacio o salto de línea haría que TODOS compilaran la rama equivocada
    sin error visible. Los `{%-` y `-%}` de abajo son obligatorios. -#}
{%- set e = var('erp', none) -%}
{%- if e is none -%}
{{- exceptions.raise_compiler_error(
      "Falta var('erp'). Corre dbt con --vars '{erp: sap_b1}' o '{erp: odoo}'. "
      "El worker lo pasa automáticamente según la conexión de la organización.") -}}
{%- elif e not in ['sap_b1', 'odoo'] -%}
{{- exceptions.raise_compiler_error("var('erp') inválido: '" ~ e ~ "'. Válidos: sap_b1, odoo.") -}}
{%- endif -%}
{{- e -}}
{% endmacro %}


{#
  Signo del documento en Odoo según move_type: la nota de crédito va negativa.
  Se aplica a los campos que Odoo guarda SIEMPRE en positivo (price_subtotal, quantity...),
  no a los `*_signed`, que ya vienen con el signo correcto.
#}
{% macro signo_odoo(alias) %}
    (case when {{ alias }}.datos->>'move_type' like '%_refund' then -1 else 1 end)
{% endmacro %}


{#
  Texto de un campo jsonb de Odoo traducido por idioma: name->>'es_GT' con respaldo.
  En Odoo 17+ varios campos de texto (name de cuentas y productos) son jsonb.
#}
{% macro odoo_texto(columna, campo) %}
    coalesce(
        {{ columna }}->'{{ campo }}'->>'es_GT',
        {{ columna }}->'{{ campo }}'->>'es_ES',
        {{ columna }}->'{{ campo }}'->>'en_US',
        {{ columna }}->>'{{ campo }}'
    )
{% endmacro %}
