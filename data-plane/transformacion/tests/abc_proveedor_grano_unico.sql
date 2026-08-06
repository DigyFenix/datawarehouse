-- GRANO del catálogo ABC de proveedores: una fila por (empresa, AÑO, proveedor).
-- Ver `abc_grano_unico.sql` para el razonamiento.

select
    empresa_id,
    anio,
    proveedor_clave,
    count(*) as veces
from {{ ref('clasificacion_abc_proveedor') }}
group by 1, 2, 3
having count(*) > 1
