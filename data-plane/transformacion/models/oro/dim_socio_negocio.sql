{#
  Dimensión SOCIO DE NEGOCIO — la vista CONSOLIDADA de la maestra: cliente, proveedor o ambos.

  COMPLEMENTA (no reemplaza) a dim_cliente y dim_proveedor: las páginas por proceso siguen
  usando las dimensiones por rol — ahí el rol en la estructura evita el error silencioso de
  olvidar un filtro. Esta existe para el análisis 360° de un socio: qué le vendo, qué le
  compro, qué me debe, qué le debo y la posición neta.

  EL EJE UNIFICADOR ES EL NIT, no el código. En SAP B1 un socio dual son DOS registros OCRD
  (CardCode de cliente y CardCode de proveedor) con el mismo NIT — en Cresta hay 37 así, toda
  la intercompañía incluida. Por eso:
    · `socio_unificado` = un solo nombre por NIT (se prefiere el del registro cliente): es la
      columna para el segmentador de la página 360° — elegir un socio ahí filtra sus DOS
      registros y con ellos ventas, compras, CxC y CxP a la vez.
    · `es_cliente_y_proveedor` = el NIT tiene ambos roles: el filtro natural de esa página.

  Se relaciona a los hechos por su propia llave `socio_clave` (mapa llave_socio, sin filtro de
  rol), ACTIVA en paralelo a las llaves por rol: columnas distintas, sin caminos ambiguos.
#}
{{ config(materialized='table') }}

with socios as (
    select
        k.llave                                       as socio_clave,
        d.empresa_id,
        d.socio_codigo,
        d.nombre,
        d.nit,
        d.grupo_codigo,
        d.condicion_pago_codigo,
        d.pais,
        d.region,
        d.es_cliente,
        d.es_proveedor,
        -- Intercompañía: misma lista y misma normalización que dim_cliente/dim_proveedor
        -- (portal: gobierno.nits_afiliados, migración 112; macro es_nit_afiliado).
        {{ es_nit_afiliado('d.nit') }}                as es_intercompania,
        d.activo
    from {{ ref('plata_socio_negocio') }} d
    join {{ ref('llave_socio') }} k
         on k.empresa_id = d.empresa_id and k.socio_codigo = d.socio_codigo
)

select
    socio_clave,
    empresa_id,
    socio_codigo,
    nombre,
    -- Un solo nombre por NIT para el segmentador del 360°; sin NIT, el socio queda solo.
    case when nit is not null then
        first_value(nombre) over (partition by nit order by es_cliente desc, socio_codigo)
    else nombre end                                   as socio_unificado,
    nit,
    grupo_codigo,
    condicion_pago_codigo,
    pais,
    region,
    es_cliente,
    es_proveedor,
    nit is not null
      and bool_or(es_cliente)   over (partition by nit)
      and bool_or(es_proveedor) over (partition by nit)
                                                      as es_cliente_y_proveedor,
    es_intercompania,
    activo,
    {{ columnas_vigencia() }}
from socios

union all

-- MIEMBRO NO DEFINIDO: lo toma el hecho cuando su referencia no existe en la dimensión.
select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    {{ nombre_no_definido() }}, null, null, null, null, null, false, false, false, false, true,
    {{ columnas_vigencia() }}
