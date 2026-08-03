{#
  ---------------------------------------------------------------------------
  INTERCOMPAÑÍA POR NIT NORMALIZADO
  ---------------------------------------------------------------------------
  La lista de NIT afiliados la administra el portal (gobierno.nits_afiliados)
  y llega por var('nits_grupo'); el worker la pasa ya normalizada, pero aquí
  se vuelve a normalizar por si la corrida es manual (correr.sh, CLI).

  Forma canónica en AMBOS lados: MAYÚSCULAS y solo [0-9K] (dígitos y la letra
  de verificación de los NIT guatemaltecos). Así '0501-1105 181019',
  'P05011105181019' y '05011105181019' coinciden aunque el ERP y el usuario
  los escriban distinto. Misma regla que la columna generada de la migración
  112 — si cambia una, cambiar la otra.

  coalesce(..., false): un NIT nulo o vacío es un TERCERO, no un desconocido.
  Sin esto, los socios sin NIT quedaban con es_intercompania NULL y las
  medidas "terceros" (filtro = FALSE) los excluían en silencio.

  Uso:  {{ es_nit_afiliado('d.nit') }} as es_intercompania
#}
{% macro es_nit_afiliado(columna) %}
{%- set nits = [] -%}
{%- for n in var('nits_grupo', []) -%}
  {%- set norma = modules.re.sub('[^0-9K]', '', n | string | upper) -%}
  {%- if norma and norma not in nits -%}{%- do nits.append(norma) -%}{%- endif -%}
{%- endfor -%}
coalesce(nullif(regexp_replace(upper({{ columna }}), '[^0-9K]', '', 'g'), '') = any(array[{% for n in nits %}{% if not loop.first %}, {% endif %}'{{ n }}'{% endfor %}]::text[]), false)
{%- endmacro %}
