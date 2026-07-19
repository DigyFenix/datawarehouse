-- Canónico: documento de venta (cabecera) VÁLIDO. Excluye los desviados a cuarentena.
{{ config(materialized='table') }}

select c.*
from {{ ref('stg_ventas_cabecera') }} c
where not exists (
    select 1 from {{ ref('quarantine_ventas_cabecera') }} q
    where q.empresa_id = c.empresa_id
      and q.tipo_documento = c.tipo_documento
      and q.documento_codigo = c.documento_codigo
)
