{#
  Snapshot SCD2 del maestro de clientes (política 'clientes' = versionado, §4 diseño ingesta).
  Captura versiones cuando cambian las columnas significativas (check_cols). Cada corrida compara
  el estado actual del maestro canónico contra la última versión almacenada:
    - sin cambios en check_cols  -> no hace nada.
    - cambio en check_cols       -> cierra la versión vigente (dbt_valid_to) y abre una nueva.
  Las columnas que disparan versión se administran en el portal (politica_ingesta.columnas_versionado);
  aquí llegan vía la var espejo (ver dbt_project.yml). dbt gestiona el cierre+alta automáticamente.
#}
{% snapshot snap_cliente %}
{{
  config(
    target_schema='silver',
    unique_key="empresa_id || '-' || socio_negocio_codigo",
    strategy='check',
    check_cols=var('cols_versionado_clientes', ['nombre', 'region']),
    invalidate_hard_deletes=true
  )
}}
select
    empresa_id,
    socio_negocio_codigo,
    nombre,
    nit,
    region,
    activo
from {{ ref('silver_socio_negocio') }}
{% endsnapshot %}
