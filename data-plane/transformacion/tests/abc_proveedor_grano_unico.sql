-- GRANO del catálogo ABC de proveedores: una sola fila por (empresa, proveedor).
-- Mismo motivo que abc_grano_unico: sin 1:1 con la dimensión Proveedor, Power BI multiplica
-- la compra del proveedor por cada fila extra.

select
    empresa_id,
    proveedor_clave,
    count(*) as veces
from {{ ref('clasificacion_abc_proveedor') }}
group by 1, 2
having count(*) > 1
