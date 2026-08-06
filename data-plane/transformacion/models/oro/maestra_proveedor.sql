{#
  Maestra mínima de proveedores para las tablas de clasificación. Espejo de `maestra_cliente`;
  ver ahí el razonamiento de por qué no se lee `dim_proveedor`.
#}
{{ config(materialized='ephemeral') }}

select
    k.llave                                           as proveedor_clave,
    s.empresa_id,
    s.socio_codigo                                    as proveedor_codigo,
    {{ es_nit_afiliado('s.nit') }}                    as es_intercompania
from {{ ref('plata_socio_negocio') }} s
join {{ ref('llave_proveedor') }} k
     on k.empresa_id = s.empresa_id and k.socio_codigo = s.socio_codigo
where s.es_proveedor
