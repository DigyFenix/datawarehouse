{#
  DIRECCIONES por socio — canónico agnóstico. Solo lo principal (decisión de Edwin,
  2026-08-02): calle, ciudad, municipio, departamento, país, código postal y coordenadas
  donde el ERP las tenga. La dirección de ENTREGA del documento (documento_comercial.
  direccion_entrega_codigo) referencia estas filas.

  SAP B1  : CRD1 (una fila por CardCode + tipo S/B + Address). El departamento sale del
            catálogo OCST (State es un código). Sin coordenadas en el estándar.

            OCST tiene clave COMPUESTA (Code, Country): el código '12' es Petén en Guatemala
            y San Miguel en El Salvador. Una sociedad cuyo catálogo cubra varios países
            —svproavis lo hace— duplicaba la dirección al unir solo por Code, y una dimensión
            con clave repetida rompe el refresco de Power BI aunque dbt pase en verde.
            El join se resuelve en dos niveles y NINGUNO puede multiplicar:
              1. por (empresa, código, país) cuando el catálogo trae el país;
              2. si no empareja, por código solo cuando es INEQUÍVOCO en esa sociedad.
            Código ambiguo sin país que lo desempate → departamento NULL. Es preferible el
            dato ausente al departamento equivocado: este campo alimenta un mapa.
  Odoo    : res_partner — el socio mismo (tipo 'principal') y sus hijos delivery/invoice.
            Trae coordenadas (partner_latitude/longitude) si el tenant las captura; el
            nombre de país/departamento requiere res_country/res_country_state, que aún no
            se ingestan: quedan null hasta que se sumen (V1 = lo que aporta hoy).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

with estado_por_pais as (
    -- Nivel 1: la clave real del catálogo. Un `group by` sobre las tres columnas garantiza
    -- una sola fila por combinación aunque el ERP repita el registro.
    select
        empresa_id,
        trim(datos->>'Code')                as codigo,
        nullif(trim(datos->>'Country'), '') as pais,
        min(nullif(trim(datos->>'Name'), '')) as nombre
    from {{ source('bronce', 'ocst') }}
    where nullif(trim(datos->>'Country'), '') is not null
    group by 1, 2, 3
),

estado_inequivoco as (
    -- Nivel 2: fallback para catálogos que no traen país (o tenants que aún no lo extraen).
    -- El `having` es la guarda: si el código significa dos departamentos distintos en la
    -- misma sociedad, esta CTE no lo devuelve y el departamento queda NULL.
    select
        empresa_id,
        trim(datos->>'Code')                  as codigo,
        min(nullif(trim(datos->>'Name'), '')) as nombre
    from {{ source('bronce', 'ocst') }}
    group by 1, 2
    having count(distinct nullif(trim(datos->>'Name'), '')) = 1
)

select
    c.empresa_id,
    trim(c.datos->>'CardCode')                        as socio_codigo,
    trim(c.datos->>'Address')                         as direccion_codigo,
    case when c.datos->>'AdresType' = 'S' then 'entrega' else 'facturacion' end as tipo,
    nullif(trim(c.datos->>'Street'), '')              as calle,
    nullif(trim(c.datos->>'City'), '')                as ciudad,
    nullif(trim(c.datos->>'County'), '')              as municipio,
    coalesce(dp.nombre, di.nombre)                    as departamento,
    nullif(trim(c.datos->>'Country'), '')             as pais,
    nullif(trim(c.datos->>'ZipCode'), '')             as codigo_postal,
    null::numeric(9,6)                                as latitud,
    null::numeric(9,6)                                as longitud,
    {{ columnas_trazabilidad('c') }}
from {{ source('bronce', 'crd1') }} c
left join estado_por_pais dp
       on  dp.empresa_id = c.empresa_id
       and dp.codigo     = trim(c.datos->>'State')
       and dp.pais       = nullif(trim(c.datos->>'Country'), '')
left join estado_inequivoco di
       on  di.empresa_id = c.empresa_id
       and di.codigo     = trim(c.datos->>'State')
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
