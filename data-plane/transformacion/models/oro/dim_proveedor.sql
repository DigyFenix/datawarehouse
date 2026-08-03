{#
  Dimensión PROVEEDOR. Misma maestra que dim_cliente, filtrada por `es_proveedor`.
  `proveedor_codigo` es la llave de negocio del ERP. En Cresta hay MÁS proveedores (1,118) que
  clientes (814).
#}
{{ config(materialized='table') }}

select
    k.llave                                           as proveedor_clave,
    d.empresa_id,
    d.socio_codigo                                    as proveedor_codigo,
    d.nombre,
    d.nit,
    d.grupo_codigo,
    d.condicion_pago_codigo,
    d.pais,
    d.region,
    d.es_cliente                                      as es_tambien_cliente,
    -- Intercompañía: el socio es otra empresa del propio grupo. Sin este atributo, un aging
    -- estándar reporta "72.7% de la cartera vencida" y desata una crisis que no existe: en
    -- Proavisa Q67.2M de Q92.4M son saldo entre empresas de casa.
    -- La lista la administra el portal (gobierno.nits_afiliados, migración 112) y llega por
    -- var; la comparación normaliza NIT en ambos lados (ver macro es_nit_afiliado).
    {{ es_nit_afiliado('d.nit') }}                    as es_intercompania,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_socio_negocio') }} d
join {{ ref('llave_proveedor') }} k
     on k.empresa_id = d.empresa_id and k.socio_codigo = d.socio_codigo
where d.es_proveedor

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    null, null, null, null, null, false, false, true,
    {{ columnas_vigencia() }}
