-- GRANO del catálogo ABC: una sola fila por (empresa, cliente).
--
-- Si este test devuelve filas, la relación con la dimensión Cliente deja de ser 1:1 y Power BI
-- contaría la venta del cliente tantas veces como filas tenga — con clases distintas, además,
-- que es peor: dos personas leyendo el mismo tablero clasificarían al cliente diferente.

select
    empresa_id,
    cliente_clave,
    count(*) as veces
from {{ ref('clasificacion_abc_cliente') }}
group by 1, 2
having count(*) > 1
