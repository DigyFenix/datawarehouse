{#
  Homologación de códigos de moneda a ISO 4217. SAP B1 Guatemala usa 'QTZ' para el quetzal
  (el ISO es 'GTQ'); el resto de códigos que usan los ERPs del grupo ya son ISO. La maestra
  del portal (gobierno.sociedades) guarda ISO — toda comparación contra códigos del ERP pasa
  por aquí.
#}
{% macro moneda_iso(expr) -%}
(case when upper({{ expr }}) = 'QTZ' then 'GTQ' else upper({{ expr }}) end)
{%- endmacro %}
