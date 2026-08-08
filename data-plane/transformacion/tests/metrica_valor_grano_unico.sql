-- GRANO del contrato del agente: una sola fila por (empresa, métrica, período).
--
-- Si este test devuelve filas, la misma métrica tiene DOS valores para el mismo mes y la
-- misma empresa — el agente (que consulta por clave y confía en el resultado) respondería
-- un número u otro según el orden físico. Peor que no responder: responder distinto dos veces.

select
    empresa_id,
    metrica_clave,
    periodo,
    count(*) as veces
from {{ ref('metrica_valor') }}
group by 1, 2, 3
having count(*) > 1
