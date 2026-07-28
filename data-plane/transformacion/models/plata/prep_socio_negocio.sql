{#
  Socio de negocio canónico: CLIENTE Y PROVEEDOR UNIFICADOS.
  Ambos ERPs los traen en una sola tabla, así que unificar aquí evita duplicar el mapeo.
  En Oro se separan en dim_cliente / dim_proveedor porque hay socios duales
  (35 NIT en Cresta, 2 en Iron Network) y una dimensión única los cruzaría.
#}
{{ config(materialized='ephemeral') }}

{#- EFÍMERO a propósito: no materializa. Alimenta a `plata_socio_negocio` (los válidos) y a
    `cuarentena_socio_negocio` (los que violan una regla), sin duplicar el mapeo del ERP.
    Por eso NO lleva prefijo `plata_`: no es una tabla de la capa, es un paso intermedio. -#}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

select
    empresa_id,
    datos->>'CardCode'                                as socio_codigo,
    trim(datos->>'CardName')                          as nombre,
    nullif(trim(datos->>'LicTradNum'), '')            as nit,
    (datos->>'CardType') = 'C'                        as es_cliente,
    (datos->>'CardType') = 'S'                        as es_proveedor,
    nullif(datos->>'GroupCode', '')                   as grupo_codigo,
    nullif(datos->>'GroupNum', '')                    as condicion_pago_codigo,
    nullif(trim(datos->>'Currency'), '')              as moneda_codigo,
    nullif(trim(datos->>'Country'), '')               as pais,
    nullif(datos->>'Territory', '')                   as region,
    coalesce(datos->>'validFor', 'Y') = 'Y'           as activo,
    -- Cuenta de control: de aquí se deduce QUÉ cuentas son cartera (ver plata_cuenta).
    nullif(datos->>'DebPayAcct', '')                  as cuenta_control_codigo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'ocrd') }}
-- Los leads ('L') no son socios de negocio: no facturan ni generan cartera.
where datos->>'CardType' in ('C', 'S')

{% else %}

select
    empresa_id,
    datos->>'id'                                      as socio_codigo,
    trim(datos->>'name')                              as nombre,
    nullif(trim(datos->>'vat'), '')                   as nit,
    coalesce((datos->>'customer_rank')::int, 0) > 0    as es_cliente,
    coalesce((datos->>'supplier_rank')::int, 0) > 0    as es_proveedor,
    null::text                                        as grupo_codigo,
    nullif(datos->>'property_payment_term_id', '')    as condicion_pago_codigo,
    null::text                                        as moneda_codigo,
    nullif(datos->>'country_id', '')                  as pais,
    null::text                                        as region,
    coalesce((datos->>'active')::boolean, true)        as activo,
    null::text                                        as cuenta_control_codigo,
    {{ columnas_trazabilidad() }}
from {{ source('bronce', 'res_partner') }}
-- CRÍTICO: `res_partner` guarda contactos y direcciones además de socios comerciales.
-- En Iron Network son 221 filas activas pero solo 74 socios reales. Sin este filtro
-- la dimensión se llenaría de direcciones de entrega.
where coalesce((datos->>'customer_rank')::int, 0) > 0
   or coalesce((datos->>'supplier_rank')::int, 0) > 0

{% endif %}
