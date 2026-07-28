{#
  Dimensión CLIENTE.

  `cliente_clave`  = llave SUSTITUTA, entero autoincremental del mapa `llave_cliente`.
  `cliente_codigo` = llave de NEGOCIO, la del ERP (CardCode en SAP B1, id en Odoo). Es la que el
                     usuario reconoce y la que permite volver al documento en el ERP.

  Separada de dim_proveedor a propósito: hay socios que son ambos (35 NIT en Cresta, 2 en Iron
  Network). Con una dimensión única, filtrar por uno de ellos en un reporte de ventas arrastraría
  también sus compras.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as cliente_clave,
    d.empresa_id,
    d.socio_codigo                                    as cliente_codigo,
    d.nombre,
    d.nit,
    d.grupo_codigo,
    d.condicion_pago_codigo,
    d.pais,
    d.region,
    d.es_proveedor                                    as es_tambien_proveedor,
    -- Intercompañía: el socio es otra empresa del propio grupo. Sin este atributo, un aging
    -- estándar reporta "72.7% de la cartera vencida" y desata una crisis que no existe: en
    -- Proavisa Q67.2M de Q92.4M son saldo entre empresas de casa.
    -- La lista de NIT llega por var (el portal la administra en gobierno.sociedades); nunca
    -- se fija en el modelo ni en el reporte.
    -- Comillas SIMPLES: `tojson` produciría comillas dobles y Postgres las leería como
    -- identificadores, no como literales. Lista vacía ⇒ array vacío ⇒ todo false.
    d.nit = any(array[{% for n in var('nits_grupo', []) %}{% if not loop.first %}, {% endif %}'{{ n | replace("'", "''") }}'{% endfor %}]::text[])
                                                      as es_intercompania,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_socio_negocio') }} d
join {{ ref('llave_cliente') }} k
     on k.empresa_id = d.empresa_id and k.socio_codigo = d.socio_codigo
where d.es_cliente

union all

-- MIEMBRO NO DEFINIDO: lo toma el hecho cuando su referencia no existe en la dimensión.
select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    null, null, null, null, null, false, false, true,
    {{ columnas_vigencia() }}
