-- La suma de los miembros de un desglose debe ser EXACTAMENTE el valor mensual de la métrica:
-- si esta prueba devuelve filas, el agente contestaría un ranking cuya suma no es la cifra
-- certificada. Tolerancia de 1 centavo por redondeo a 4 decimales.
with desglose as (
    select empresa_id, metrica_clave, periodo, dimension, sum(valor) as valor
      from {{ ref('metrica_valor_dimension') }}
     group by 1, 2, 3, 4
)
select d.empresa_id, d.metrica_clave, d.periodo, d.dimension, d.valor as desglose, m.valor as mensual
  from desglose d
  join {{ ref('metrica_valor') }} m
    on m.empresa_id = d.empresa_id and m.metrica_clave = d.metrica_clave and m.periodo = d.periodo
 where abs(d.valor - m.valor) > 0.01
