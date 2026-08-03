{#
  DIRECCIONES por socio — canónico agnóstico. Solo lo principal (decisión de Edwin,
  2026-08-02): calle, ciudad, municipio, departamento, país, código postal y coordenadas
  donde el ERP las tenga. La dirección de ENTREGA del documento (documento_comercial.
  direccion_entrega_codigo) referencia estas filas.

  SAP B1  : CRD1 (una fila por CardCode + tipo S/B + Address). El departamento sale del
            catálogo OCST (State es un código). Sin coordenadas en el estándar.
  Odoo    : res_partner — el socio mismo (tipo 'principal') y sus hijos delivery/invoice.
            Trae coordenadas (partner_latitude/longitude) si el tenant las captura; el
            nombre de país/departamento requiere res_country/res_country_state, que aún no
            se ingestan: quedan null hasta que se sumen (V1 = lo que aporta hoy).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    c.empresa_id,
    trim(c.datos->>'CardCode')                        as socio_codigo,
    trim(c.datos->>'Address')                         as direccion_codigo,
    case when c.datos->>'AdresType' = 'S' then 'entrega' else 'facturacion' end as tipo,
    nullif(trim(c.datos->>'Street'), '')              as calle,
    nullif(trim(c.datos->>'City'), '')                as ciudad,
    nullif(trim(c.datos->>'County'), '')              as municipio,
    nullif(trim(d.datos->>'Name'), '')                as departamento,
    nullif(trim(c.datos->>'Country'), '')             as pais,
    nullif(trim(c.datos->>'ZipCode'), '')             as codigo_postal,
    null::numeric(9,6)                                as latitud,
    null::numeric(9,6)                                as longitud,
    {{ columnas_trazabilidad('c') }}
from {{ source('bronce', 'crd1') }} c
left join {{ source('bronce', 'ocst') }} d
       on d.empresa_id = c.empresa_id
      and d.datos->>'Code' = c.datos->>'State'
where nullif(trim(c.datos->>'Address'), '') is not null
  and nullif(trim(c.datos->>'CardCode'), '') is not null

{% else %}

select
    r.empresa_id,
    coalesce(nullif(trim(r.datos->>'parent_id'), ''), r.datos->>'id') as socio_codigo,
    r.datos->>'id'                                    as direccion_codigo,
    case r.datos->>'type'
        when 'delivery' then 'entrega'
        when 'invoice'  then 'facturacion'
        else 'principal' end                          as tipo,
    nullif(trim(concat_ws(' ', r.datos->>'street', r.datos->>'street2')), '') as calle,
    nullif(trim(r.datos->>'city'), '')                as ciudad,
    null::text                                        as municipio,
    null::text                                        as departamento,
    null::text                                        as pais,
    nullif(trim(r.datos->>'zip'), '')                 as codigo_postal,
    (nullif(r.datos->>'partner_latitude', ''))::numeric(9,6)  as latitud,
    (nullif(r.datos->>'partner_longitude', ''))::numeric(9,6) as longitud,
    {{ columnas_trazabilidad('r') }}
from {{ source('bronce', 'res_partner') }} r

{% endif %}
