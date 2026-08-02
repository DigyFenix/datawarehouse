{#
  CAMPOS DE USUARIO (UDF) — formato largo: una fila por (registro del ERP × campo × valor).

  EL PROBLEMA QUE RESUELVE: cada instalación de SAP B1 trae UDFs distintos (U_*) que no se
  conocen de antemano y cambian por cliente. Meterlos como columnas en las tablas estándar
  rompería el modelo compartido entre tenants; ignorarlos pierde información de negocio
  (en Cresta: Segmento, Subcanal, el documento fiscal U_FacSerie/U_FacNum, piloto/vehículo).

  LA ESTRATEGIA (3 niveles):
    1. Esta tabla recoge AUTOMÁTICAMENTE todo UDF que la extracción haya incluido — expande
       el jsonb de Bronce buscando claves U_* (SAP) / x_* (Odoo estudio); cero configuración.
    2. Para las DIMENSIONES lleva la clave sustituta resuelta (cliente/proveedor/producto):
       en Power BI se relaciona directo y los UDF filtran la tabla estándar sin tocarla.
    3. Cuando un UDF se vuelve importante de verdad, se PROMUEVE por la vía gobernada:
       mapearlo a un campo canónico en el portal (columna real, con contrato y calidad).

  El grano de documento (venta_factura, pagos) queda como tabla de consulta/rastreo por
  entidad + registro_id (DocEntry): no se relaciona a los hechos de línea (la relación sería
  ambigua); si un UDF de documento se necesita como eje de análisis, se promueve (nivel 3).
#}
{{ config(
    materialized = 'table',
    pre_hook = "set local max_parallel_workers_per_gather = 0"
) }}

{%- set erp = erp_actual() | trim -%}

{%- if erp == 'sap_b1' -%}
{%- set prefijo = 'U\\_%' -%}
{%- set fuentes = [
      ('ocrd', 'socio',              "b.datos->>'CardCode'"),
      ('oitm', 'producto',           "b.datos->>'ItemCode'"),
      ('oinv', 'venta_factura',      "b.datos->>'DocEntry'"),
      ('inv1', 'venta_factura_linea', "(b.datos->>'DocEntry') || '-' || (b.datos->>'LineNum')"),
      ('orct', 'pago_recibido',      "b.datos->>'DocEntry'"),
      ('ovpm', 'pago_efectuado',     "b.datos->>'DocEntry'")
   ] -%}
{%- else -%}
{%- set prefijo = 'x\\_%' -%}
{%- set fuentes = [
      ('res_partner',      'socio',         "b.datos->>'id'"),
      ('product_template', 'producto',      "b.datos->>'id'"),
      ('account_move',     'venta_factura', "b.datos->>'id'"),
      ('account_payment',  'pago_recibido', "b.datos->>'id'")
   ] -%}
{%- endif %}

with crudo as (
{% for tabla, entidad, id_expr in fuentes %}
    select
        b.empresa_id,
        '{{ entidad }}'::text                             as entidad,
        '{{ tabla }}'::text                               as tabla_origen,
        {{ id_expr }}                                     as registro_id,
        kv.key                                            as campo,
        kv.value                                          as valor
    from {{ source('bronce', tabla) }} b
    cross join lateral jsonb_each_text(b.datos) as kv(key, value)
    where kv.key like '{{ prefijo }}'
      and nullif(trim(kv.value), '') is not null
    {% if not loop.last %}union all{% endif %}
{% endfor %}
)

select
    c.empresa_id,
    c.entidad,
    c.tabla_origen,
    c.registro_id,
    c.campo,
    c.valor,
    -- Claves sustitutas resueltas para relacionar en Power BI SIN tocar las tablas estándar.
    -- Un socio puede ser cliente Y proveedor: van ambas.
    case when c.entidad = 'socio'    then kc.llave end    as cliente_clave,
    case when c.entidad = 'socio'    then kp.llave end    as proveedor_clave,
    case when c.entidad = 'producto' then kpr.llave end   as producto_clave,
    '{{ this.name }}'::text                               as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text            as version_proceso
from crudo c
left join {{ ref('llave_cliente') }} kc
       on c.entidad = 'socio' and kc.empresa_id = c.empresa_id and kc.socio_codigo = c.registro_id
left join {{ ref('llave_proveedor') }} kp
       on c.entidad = 'socio' and kp.empresa_id = c.empresa_id and kp.socio_codigo = c.registro_id
left join {{ ref('llave_producto') }} kpr
       on c.entidad = 'producto' and kpr.empresa_id = c.empresa_id and kpr.producto_codigo = c.registro_id
