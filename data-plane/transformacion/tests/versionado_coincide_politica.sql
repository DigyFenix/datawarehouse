-- Gobernanza: la var espejo (cols_versionado_clientes) debe coincidir con la política del portal
-- (metadatos.politica_ingesta.columnas_versionado del objeto 'clientes'). Devuelve filas = drift → falla.
-- Si el entorno no tiene el metadata-store aplicado, el test no aplica (no devuelve filas).
{% set rel = adapter.get_relation(database=target.database, schema='metadatos', identifier='politica_ingesta') %}

{% if rel is none %}
select 1 as col where false
{% else %}
with politica as (
    select unnest(columnas_versionado) as col
    from metadatos.politica_ingesta
    where objeto = 'clientes'
),
espejo as (
    select unnest(array[
        {%- set cols = var('cols_versionado_clientes', ['nombre', 'region']) -%}
        {%- for c in cols %}'{{ c }}'{% if not loop.last %}, {% endif %}{% endfor -%}
    ]) as col
)
-- Paréntesis obligatorios: EXCEPT y UNION ALL tienen igual precedencia y se evalúan de
-- izquierda a derecha; sin paréntesis la diferencia simétrica saldría mal.
select col from (
    (select col from politica except select col from espejo)
    union all
    (select col from espejo except select col from politica)
) drift
{% endif %}
