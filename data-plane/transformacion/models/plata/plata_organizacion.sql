{#
  Empresa/sociedad. SIN nivel sucursal (verificado: BPLId NULL en las 161,439 facturas de
  Proavisa y OBPL vacía). La granularidad física la aporta `plata_almacen`.

  No hay tabla de origen para esto en el paquete base de ninguno de los dos ERPs, así que se
  deriva de las empresas que realmente aparecen en Bronce, y sus ATRIBUTOS (nombre, NIT y
  moneda local) vienen del portal: gobierno.sociedades → var('sociedades') que el worker pasa
  en cada corrida. Multi-moneda real: Proavisa de El Salvador opera en USD, el resto en GTQ —
  por eso la moneda local es POR SOCIEDAD, con la var global como respaldo.

  Compatibilidad: si la corrida es manual y no trae var('sociedades'), se cae a las vars
  organizacion_nombre / organizacion_nit / moneda_local (el comportamiento anterior).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}
{%- set fuente = 'ocrd' if erp == 'sap_b1' else 'res_partner' -%}
{%- set sociedades = var('sociedades', []) -%}

with bronce as (
    select
        empresa_id,
        max(fuente_origen)                            as fuente_origen,
        max(extraido_en)                              as extraido_en
    from {{ source('bronce', fuente) }}
    group by empresa_id
)

{%- if sociedades %}
, maestra (empresa_id, nombre, nit, moneda_local) as (
    values
{%- for s in sociedades %}
    ('{{ s["empresa_id"] | replace("'", "''") }}', '{{ s["nombre"] | replace("'", "''") }}', nullif('{{ s["nit"] | replace("'", "''") }}', ''), nullif('{{ s["moneda"] | replace("'", "''") }}', '')){{ "," if not loop.last }}
{%- endfor %}
)
{%- endif %}

select
    b.empresa_id,
{%- if sociedades %}
    -- initcap como último recurso: una empresa presente en Bronce pero no registrada en el
    -- portal se ve, no desaparece — y el nombre delata que falta darla de alta.
    coalesce(m.nombre, initcap(b.empresa_id))::text   as nombre,
    coalesce(m.nit, nullif('{{ var("organizacion_nit", "") }}', ''))::text as nit,
    coalesce(m.moneda_local, '{{ var("moneda_local", "GTQ") }}')::text as moneda_local,
{%- else %}
    '{{ var("organizacion_nombre", "") }}'::text      as nombre,
    nullif('{{ var("organizacion_nit", "") }}', '')   as nit,
    '{{ var("moneda_local", "GTQ") }}'::text          as moneda_local,
{%- endif %}
    b.fuente_origen,
    b.extraido_en,
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from bronce b
{%- if sociedades %}
left join maestra m on m.empresa_id = b.empresa_id
{%- endif %}
