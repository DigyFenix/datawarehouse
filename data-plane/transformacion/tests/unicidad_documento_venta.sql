-- Unicidad (CLAUDE.md §10): sin documentos de venta duplicados por clave natural
-- (empresa_id + tipo_documento + documento_codigo). El test pasa si no devuelve filas.
select empresa_id, tipo_documento, documento_codigo, count(*) as n
from {{ ref('silver_documento_venta') }}
group by empresa_id, tipo_documento, documento_codigo
having count(*) > 1
