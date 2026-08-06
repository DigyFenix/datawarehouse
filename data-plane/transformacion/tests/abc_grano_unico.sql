-- GRANO del catálogo ABC: una sola fila por (empresa, AÑO, cliente).
--
-- El año entró al grano cuando la clasificación pasó a ser una serie en vez de una foto. Si
-- este test devuelve filas, la relación con la dimensión Año deja de ser 1:N limpia y un mismo
-- cliente tendría dos clases distintas dentro del mismo año — que es peor que no tener clase:
-- dos personas leyendo el mismo tablero clasificarían al cliente diferente.

select
    empresa_id,
    anio,
    cliente_clave,
    count(*) as veces
from {{ ref('clasificacion_abc_cliente') }}
group by 1, 2, 3
having count(*) > 1
