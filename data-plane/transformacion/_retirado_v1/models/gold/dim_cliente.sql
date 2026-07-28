-- Dimensión cliente — SCD Tipo 2 (política 'clientes' = versionado, §4 diseño ingesta).
-- Cada versión lleva su rango de vigencia; el hecho toma la versión vigente a la fecha del
-- documento (ver rpt_ventas_region_versionada). Incluye miembro default/desconocido (§8).
-- Para catálogos full_replace (items, vendedores, ...) la dim es directa (una versión vigente).
{{ config(materialized='table') }}

with versiones as (
    select
        md5(dbt_scd_id)                                            as sk,
        empresa_id,
        socio_negocio_codigo,
        nombre,
        nit,
        region,
        activo,
        cast(dbt_valid_from as date)                               as valido_desde,
        cast(coalesce(dbt_valid_to, timestamp '9999-12-31') as date) as valido_hasta,
        (dbt_valid_to is null)                                     as es_vigente,
        row_number() over (
            partition by empresa_id, socio_negocio_codigo
            order by dbt_valid_from
        )                                                          as version_num
    from {{ ref('snap_cliente') }}
)
select sk, empresa_id, socio_negocio_codigo, nombre, nit, region, activo,
       -- La versión inicial cubre desde el origen de los tiempos: hechos anteriores al inicio del
       -- versionado (SCD2 es system-time) se atribuyen a la primera versión observada.
       case when version_num = 1 then date '1900-01-01' else valido_desde end as valido_desde,
       valido_hasta, es_vigente, version_num
from versiones
union all
-- Miembro default: cubre hechos cuyo cliente no cruza. Vigencia total.
select md5('GLOBAL-DESCONOCIDO'), 'GLOBAL', 'DESCONOCIDO', 'Cliente desconocido', null, null, true,
       date '1900-01-01', date '9999-12-31', true, 1
