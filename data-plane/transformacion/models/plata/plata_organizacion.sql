{#
  Empresa/sociedad. SIN nivel sucursal (verificado: BPLId NULL en las 161,439 facturas de
  Proavisa y OBPL vacía). La granularidad física la aporta `plata_almacen`.

  No hay tabla de origen para esto en el paquete base de ninguno de los dos ERPs, así que se
  deriva de las empresas que realmente aparecen en Bronce. El nombre y el NIT los administra
  el portal (gobierno.sociedades) y se inyectan por var al desplegar el tenant.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}
{%- set fuente = 'ocrd' if erp == 'sap_b1' else 'res_partner' -%}

select
    empresa_id,
    '{{ var("organizacion_nombre", "") }}'::text      as nombre,
    nullif('{{ var("organizacion_nit", "") }}', '')   as nit,
    '{{ var("moneda_local", "GTQ") }}'::text          as moneda_local,
    max(fuente_origen)                                as fuente_origen,
    max(extraido_en)                                  as extraido_en,
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text        as version_proceso
from {{ source('bronce', fuente) }}
group by empresa_id
