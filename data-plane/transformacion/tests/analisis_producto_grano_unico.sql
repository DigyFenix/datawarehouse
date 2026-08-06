-- GRANO de la ficha de producto: una sola fila por (empresa, producto).
--
-- Mismo motivo que el ABC de clientes: la ficha se relaciona 1:1 con la dimensión Producto y
-- con filtrado bidireccional. Una fila de más multiplicaría la venta del producto en cualquier
-- visual que cruce la ficha con el hecho, y el estado (ocioso/quiebre/sano) sería ambiguo.

select
    empresa_id,
    producto_clave,
    count(*) as veces
from {{ ref('analisis_producto') }}
group by 1, 2
having count(*) > 1
