{#
  Rangos de antigüedad de cartera como DIMENSIÓN, no como texto suelto en el hecho.

  Por qué existe: `rango_aging` es una etiqueta ('1-30', '+90', 'corriente'). Ordenada
  alfabéticamente sale '+90' primero y '1-30' antes de 'corriente' — un gráfico de aging con
  las barras en ese orden no se puede leer. Power BI necesita una columna numérica de orden y
  esa columna tiene que vivir en una dimensión, no repetida en cada fila del hecho.

  Catálogo CERRADO del motor con llaves fijas: los cortes (30/60/90) son los del paquete base
  y significan lo mismo en todos los tenants. Si un cliente pide otros cortes, se extiende con
  una dimensión propia; el base no se modifica.

  Los rangos deben coincidir EXACTAMENTE con el `case` de hecho_cartera_cobrar/pagar. Un test
  de relación (schema.yml) falla si el hecho produce una etiqueta que no está aquí.
#}
{{ config(materialized='table') }}

with rangos(llave, codigo, nombre, orden, dias_desde, dias_hasta, es_vencido, severidad) as (
    values
        (1, 'corriente',       'Corriente (no vence)',  1, null, 0,    false, 'ninguna'),
        (2, '1-30',            '1 a 30 días',           2, 1,    30,   true,  'baja'),
        (3, '31-60',           '31 a 60 días',          3, 31,   60,   true,  'media'),
        (4, '61-90',           '61 a 90 días',          4, 61,   90,   true,  'alta'),
        (5, '+90',             'Más de 90 días',        5, 91,   null, true,  'critica'),
        (6, 'sin_vencimiento', 'Sin fecha de vencimiento', 6, null, null, false, 'indeterminada')
)

select
    llave                                             as rango_aging_clave,
    codigo                                            as rango_aging,
    nombre                                            as rango_aging_nombre,
    orden                                             as rango_aging_orden,
    dias_desde,
    dias_hasta,
    es_vencido,
    severidad,
    {{ columnas_vigencia() }}
from rangos

union all

select
    {{ clave_no_definido() }}, {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    99, null, null, false, 'indeterminada',
    {{ columnas_vigencia() }}
