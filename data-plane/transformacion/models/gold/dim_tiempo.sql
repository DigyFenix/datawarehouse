-- Dimensión tiempo (calendario). Incluye miembro default (1900-01-01) (§8).
{{ config(materialized='table') }}

select
    d::date                              as fecha,
    extract(year   from d)::int          as anio,
    extract(month  from d)::int          as mes,
    extract(day    from d)::int          as dia,
    extract(quarter from d)::int         as trimestre,
    to_char(d, 'YYYY-MM')                as anio_mes
from generate_series(date '2025-01-01', date '2026-12-31', interval '1 day') as g(d)
union all
select date '1900-01-01', 1900, 1, 1, 1, '1900-01'
