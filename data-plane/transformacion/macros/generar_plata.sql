{#
  Genera el SELECT de una entidad canónica (capa Silver) leyendo los metadatos en runtime:
    - metadatos.canonico_campo  → las columnas de la entidad (destino) y su tipo.
    - metadatos.campo_ingesta   → el mapeo (columna de origen + transformación) de los incluidos,
                                 y los filtros de fila (filtro_op/filtro_valor).
  Lee de bronce.<tabla> (jsonb crudo aterrizado por el extractor). Agregar un campo/mapeo en el
  portal cambia la salida sin tocar SQL (config-driven). §6: Silver = costura agnóstica.
#}

{% macro tipo_sql(tipo) %}
  {%- if tipo and (tipo.startswith('numeric') or tipo == 'integer') -%}{{ tipo }}
  {%- elif tipo == 'date' -%}date
  {%- elif tipo == 'boolean' -%}boolean
  {%- else -%}text{%- endif -%}
{% endmacro %}

{% macro expr_transform(col, tr, tipo) %}
  {%- if col is none -%}
    cast(null as {{ tipo_sql(tipo) | trim }})
  {%- elif tr == 'booleano_yn' -%}
    case when datos->>'{{ col }}' = 'Y' then true else false end
  {%- elif tr == 'cast_numeric' -%}
    (nullif(datos->>'{{ col }}', ''))::numeric(18,4)
  {%- elif tr == 'cast_fecha' -%}
    (nullif(datos->>'{{ col }}', ''))::date
  {%- else -%}
    datos->>'{{ col }}'
  {%- endif -%}
{% endmacro %}

{% macro generar_plata(entidad) %}
{%- if not execute -%}
select cast(null as text) as empresa_id
{%- else -%}
  {%- set trows = run_query("select distinct lower(tabla_origen) t from metadatos.campo_ingesta where canonico_entidad = '" ~ entidad ~ "' and incluido") -%}
  {%- set tablas = trows.columns[0].values() | list -%}
  {%- if tablas | length == 0 -%}
select cast(null as text) as empresa_id where false
  {%- else -%}
    {%- set tabla = tablas[0] -%}
    {%- set csql -%}
      select cc.nombre, cc.tipo, ci.campo_origen, ci.transformacion
      from metadatos.canonico_campo cc
      left join metadatos.campo_ingesta ci
        on ci.canonico_entidad = '{{ entidad }}' and ci.incluido and ci.campo_canonico = cc.nombre
      where cc.entidad_clave = '{{ entidad }}' and cc.activo
      order by cc.orden
    {%- endset -%}
    {%- set crows = run_query(csql) -%}
    {%- set fsql -%}
      select campo_origen, filtro_op, filtro_valor from metadatos.campo_ingesta
      where canonico_entidad = '{{ entidad }}' and filtro_op is not null and filtro_valor is not null
    {%- endset -%}
    {%- set frows = run_query(fsql) -%}
select
    empresa_id
    {%- for r in crows.rows %}
    , {{ expr_transform(r[2], r[3], r[1]) | trim }} as {{ r[0] }}
    {%- endfor %}
from bronce."{{ tabla }}"
    {%- if frows.rows | length > 0 %}
where {% for f in frows.rows %}{% if not loop.first %} and {% endif %}(datos->>'{{ f[0] }}') {{ f[1] }} '{{ f[2] }}'{% endfor %}
    {%- endif %}
  {%- endif -%}
{%- endif -%}
{% endmacro %}
