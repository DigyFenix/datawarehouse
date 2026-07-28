-- Demostración del versionado (SCD2): cada línea de venta se atribuye a la región/nombre que el
-- cliente tenía A LA FECHA DEL DOCUMENTO, no a la actual. Prueba el join hecho↔dim por rango de
-- vigencia. Si el documento es anterior a la primera versión observada (maestro empezó a versionarse
-- después), cae en la versión más antigua disponible (fallback determinista).
{{ config(materialized='view') }}

with f as (
    select empresa_id, documento_codigo, linea_numero, fecha_documento,
           socio_negocio_codigo, monto_linea
    from {{ ref('fct_ventas_facturacion') }}
),
dc as (
    select * from {{ ref('dim_cliente') }} where empresa_id <> 'GLOBAL'
),
emparejado as (
    select
        f.empresa_id, f.documento_codigo, f.linea_numero, f.fecha_documento,
        f.socio_negocio_codigo, f.monto_linea,
        dc.nombre       as cliente_nombre,
        dc.region       as region_a_la_fecha,
        dc.version_num,
        row_number() over (
            partition by f.empresa_id, f.documento_codigo, f.linea_numero
            order by
                -- prioriza la versión vigente en la fecha del documento; si ninguna, la más antigua
                (f.fecha_documento >= dc.valido_desde and f.fecha_documento < dc.valido_hasta) desc,
                dc.valido_desde asc
        ) as rn
    from f
    join dc
      on f.empresa_id = dc.empresa_id
     and f.socio_negocio_codigo = dc.socio_negocio_codigo
)
select empresa_id, documento_codigo, linea_numero, fecha_documento,
       socio_negocio_codigo, cliente_nombre, region_a_la_fecha, version_num, monto_linea
from emparejado
where rn = 1
