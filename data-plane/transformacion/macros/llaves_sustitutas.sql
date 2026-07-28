{#
  ---------------------------------------------------------------------------
  LLAVES SUSTITUTAS AUTOINCREMENTALES Y ESTABLES
  ---------------------------------------------------------------------------
  Decisión de Edwin: la llave sustituta es un entero autoincremental (1, 2, 3...) y la llave de
  NEGOCIO es la del ERP (CardCode en socios, DocEntry en documentos).

  El problema a evitar: si el número se recalcula con row_number() en cada corrida, insertar un
  socio nuevo corre todas las llaves siguientes y Power BI —que guarda las relaciones por llave—
  queda apuntando a filas equivocadas SIN dar error.

  La solución es un MAPA DE LLAVES persistente por dimensión: una tabla incremental que guarda
  (llave natural → entero) y **nunca reasigna**. A los códigos nuevos les toca max+1. Es el patrón
  estándar de un pipeline de llaves sustitutas.

  Uso desde una dimensión:
      {{ mapa_llaves(ref('plata_socio_negocio'), ['empresa_id', 'socio_codigo'],
                     filtro='es_cliente') }}
#}
{% macro mapa_llaves(relacion, campos, filtro=none) %}

{%- set lista = campos | join(', ') -%}

with naturales as (
    select distinct {{ lista }}
    from {{ relacion }}
    {% if filtro %}where {{ filtro }}{% endif %}
)

{% if is_incremental() %}
, existentes as (
    select llave, {{ lista }} from {{ this }}
)
, nuevos as (
    select n.*
    from naturales n
    left join existentes e
           on {% for c in campos %}{% if not loop.first %} and {% endif %}e.{{ c }} = n.{{ c }}{% endfor %}
    where e.llave is null
)
select llave, {{ lista }} from existentes
union all
select
    (select coalesce(max(llave), 0) from existentes)
      + row_number() over (order by {{ lista }})            as llave,
    {{ lista }}
from nuevos

{% else %}
select
    row_number() over (order by {{ lista }})                as llave,
    {{ lista }}
from naturales
{% endif %}

{% endmacro %}
