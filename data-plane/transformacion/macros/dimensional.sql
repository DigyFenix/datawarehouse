{#
  ---------------------------------------------------------------------------
  Utilidades del modelo dimensional (capa Oro).
  ---------------------------------------------------------------------------
#}

{#
  OBSOLETO — no usar. Se conserva solo como referencia histórica.
  Decisión de Edwin (2026-07-26): la llave sustituta es un entero AUTOINCREMENTAL, gestionado por
  los mapas `llave_*` (ver macros/llaves_sustitutas.sql), que dan estabilidad sin recalcular.

  Clave sustituta determinista a partir de la clave natural.

  Por qué hash y no row_number(): las dimensiones se reconstruyen completas en cada corrida.
  Con row_number(), insertar un socio nuevo correría todas las claves siguientes y Power BI
  (que guarda relaciones por clave) quedaría apuntando a filas equivocadas sin avisar.
  El hash de la clave natural devuelve SIEMPRE el mismo número para el mismo socio.

  Se toman 60 bits para que quepa en bigint y quede positivo. La probabilidad de colisión a
  estos volúmenes es despreciable.
#}
{% macro clave_sustituta(campos) %}
    ('x' || substr(md5({{ campos }}), 1, 15))::bit(60)::bigint
{% endmacro %}


{#
  Clave del MIEMBRO NO DEFINIDO. Es la que toma un hecho cuando su referencia no existe en la
  dimensión (código nulo, o que apunta a un maestro que el ERP no trae).

  Regla (CLAUDE.md §8): toda dimensión lo tiene, para que el hecho SIEMPRE cruce. Sin él, un
  join interno perdería la fila del hecho y el total dejaría de cuadrar — que es exactamente
  lo que este proyecto existe para evitar.
#}
{% macro clave_no_definido() %}-1{% endmacro %}
{% macro codigo_no_definido() %}'NO_DEFINIDO'{% endmacro %}
{% macro nombre_no_definido() %}'No definido'{% endmacro %}


{#
  Resuelve la clave de una dimensión desde el hecho, cayendo al miembro NO DEFINIDO cuando no
  hay correspondencia. Se usa SIEMPRE con LEFT JOIN: el hecho no se pierde nunca.
#}
{% macro clave_o_no_definido(alias_dim, columna_clave) %}
    coalesce({{ alias_dim }}.{{ columna_clave }}, {{ clave_no_definido() }})
{% endmacro %}


{#
  Columnas de vigencia del modelo dimensional. En esta primera carga toda fila es la versión
  vigente; cuando se active el versionado SCD2 (snapshots) la forma NO cambia, así que Power BI
  y las métricas siguen funcionando igual.
#}
{% macro columnas_vigencia() %}
    date '1900-01-01'   as valido_desde,
    date '9999-12-31'   as valido_hasta,
    true                as es_vigente
{% endmacro %}
