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
    -- La lista la administra el portal (gobierno.nits_afiliados, migración 112) y llega por
    -- var; la comparación normaliza NIT en ambos lados (ver macro es_nit_afiliado).
    {{ es_nit_afiliado('d.nit') }}                    as es_intercompania,
    d.activo,

    -- CLASIFICACIÓN VIGENTE. Con estas columnas, «ventas del trimestre de mis clientes A» es un
    -- filtro normal de dimensión. Antes eso dependía de que la clasificación filtrara el hecho
    -- por propagación bidireccional, que se eliminó porque hacía que filtrar por clase ABC
    -- alterara de paso el RFM y el comportamiento de pago sin que nadie lo pidiera.
    --
    -- SE DECLARAN VACÍAS AQUÍ Y LAS RELLENAN LAS CLASIFICACIONES con un `post_hook`. No se
    -- pueden resolver con un join porque el grafo lo prohíbe: los hechos leen esta dimensión,
    -- las clasificaciones leen los hechos, así que un `ref` a las clasificaciones desde aquí
    -- cierra un ciclo y dbt aborta la compilación. El post_hook corre después, sobre la tabla
    -- ya materializada, y el orden está garantizado por esa misma cadena de dependencias.
    --
    -- CONSECUENCIA OPERATIVA: si se reconstruye SOLO esta dimensión, las tres columnas quedan
    -- en NULL hasta que vuelva a correr la clasificación correspondiente. En un build completo
    -- —que es como corre el pipeline— siempre quedan pobladas.
    null::text                                        as clase_abc_actual,
    null::text                                        as clase_abc_actual_nombre,
    null::text                                        as segmento_rfm_actual,
    null::text                                        as perfil_riesgo_actual,
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
    null, null, null, null,
    {{ columnas_vigencia() }}
