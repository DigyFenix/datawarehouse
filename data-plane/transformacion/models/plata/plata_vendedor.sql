{#
  Dimensión OPCIONAL. Fuerte en SAP B1 (maestro propio OSLP). En Odoo el "vendedor" es el
  usuario responsable del documento (account_move.invoice_user_id → res_users): el nombre
  vive en el partner del usuario (res_users.partner_id → res_partner.name). Los usuarios
  `share` (portal, externos) no venden y se excluyen.
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    datos->>'SlpCode'                                 as vendedor_codigo,
    trim(datos->>'SlpName')                           as nombre,
    coalesce(datos->>'Active', 'Y') = 'Y'             as activo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'oslp') }}

{% else %}

select
    u.empresa_id,
    u.datos->>'id'                                    as vendedor_codigo,
    coalesce(nullif(trim(p.datos->>'name'), ''), u.datos->>'login', 'Usuario ' || (u.datos->>'id'))
                                                      as nombre,
    coalesce((u.datos->>'active')::boolean, true)      as activo,
    {{ columnas_trazabilidad('u') }}
from {{ source('bronce', 'res_users') }} u
left join {{ source('bronce', 'res_partner') }} p
       on p.datos->>'id' = u.datos->>'partner_id'
      and p.empresa_id   = u.empresa_id
where coalesce((u.datos->>'share')::boolean, false) = false

{% endif %}
