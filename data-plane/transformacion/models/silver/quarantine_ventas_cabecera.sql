-- Cuarentena (CLAUDE.md §10): documentos que violan una regla de calidad NO bloquean;
-- se desvían aquí con la regla violada y timestamp. No entran al canónico ni a las métricas.
-- Regla aplicada: VALIDEZ — el cliente (socio de negocio) debe existir en el maestro.
{{ config(materialized='table') }}

select
    c.*,
    'cliente_inexistente' as regla_violada,
    current_timestamp     as detectado_en
from {{ ref('stg_ventas_cabecera') }} c
left join {{ ref('silver_socio_negocio') }} s
    on  s.empresa_id = c.empresa_id
    and s.socio_negocio_codigo = c.socio_negocio_codigo
where s.socio_negocio_codigo is null
