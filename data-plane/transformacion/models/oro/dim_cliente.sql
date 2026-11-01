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

{#- ACTIVIDAD DE COMPRA Y SECTOR (sesión 38, auditoría §6). Antes eran columnas calculadas de
    Power BI con FILTER(ALL(Ventas)) por fila: costo cuadrático que en Cresta (450k líneas) se
    paga en cada refresco. Se calculan aquí UNA vez, desde Plata (no desde hecho_venta_linea: el
    hecho lee esta dimensión y un ref de vuelta cerraría un ciclo), con la misma semántica que
    tenían en DAX:
      · corte          = última fecha facturada de TODO el modelo (DAX: MAX con REMOVEFILTERS)
      · meses con compra 12m = meses calendario distintos con alguna línea de venta entre el
                         primer día de (corte − 11 meses) y el corte
      · meses sin compra = meses calendario entre la última compra del cliente y el corte
      · sector         = nombre de la condición de pago de la ficha; si la ficha no la trae (en
                         Odoo casi nunca), la de su última factura; si tampoco, 'Sin condición' -#}
with venta as (
    select l.empresa_id, l.socio_codigo, l.fecha_documento, cab.condicion_pago_codigo
      from {{ ref('plata_documento_linea') }} l
      join {{ ref('plata_documento_comercial') }} cab
        on  cab.empresa_id     = l.empresa_id
        and cab.documento_id   = l.documento_id
        and cab.flujo          = l.flujo
        and cab.tipo_documento = l.tipo_documento
     where l.flujo = 'venta'
),

corte as (
    select max(fecha_documento) as fin from venta
),

actividad as (
    select
        v.empresa_id,
        v.socio_codigo,
        max(v.fecha_documento)                        as ultima_compra,
        count(distinct date_trunc('month', v.fecha_documento)) filter (
            where v.fecha_documento >= date_trunc('month', c.fin - interval '11 months')
              and v.fecha_documento <= c.fin)        as meses_12m
    from venta v
    cross join corte c
    group by v.empresa_id, v.socio_codigo
),

ultima_condicion as (
    select distinct on (empresa_id, socio_codigo)
           empresa_id, socio_codigo, condicion_pago_codigo
      from venta
     order by empresa_id, socio_codigo, fecha_documento desc, condicion_pago_codigo desc nulls last
),

cliente as (
select
    k.llave                                           as cliente_clave,
    d.empresa_id,
    d.socio_codigo                                    as cliente_codigo,
    d.nombre,
    d.nit,
    d.grupo_codigo,
    d.condicion_pago_codigo,
    d.limite_credito,
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
    {{ columnas_vigencia() }},
    -- ---------- actividad y sector (ver bloque de arriba) ----------
    coalesce(cpf.nombre, cpu.nombre, 'Sin condición') as sector,
    nullif(a.meses_12m, 0)::int                       as meses_con_compra_12m,
    case when a.ultima_compra is null then null
         else ((extract(year from c.fin) * 12 + extract(month from c.fin))
             - (extract(year from a.ultima_compra) * 12 + extract(month from a.ultima_compra)))::int
    end                                               as meses_sin_compra
from {{ ref('plata_socio_negocio') }} d
join {{ ref('llave_cliente') }} k
     on k.empresa_id = d.empresa_id and k.socio_codigo = d.socio_codigo
cross join corte c
left join actividad a
       on a.empresa_id = d.empresa_id and a.socio_codigo = d.socio_codigo
left join ultima_condicion u
       on u.empresa_id = d.empresa_id and u.socio_codigo = d.socio_codigo
left join {{ ref('dim_condicion_pago') }} cpf
       on cpf.condicion_pago_codigo = d.condicion_pago_codigo and cpf.empresa_id = d.empresa_id
left join {{ ref('dim_condicion_pago') }} cpu
       on cpu.condicion_pago_codigo = u.condicion_pago_codigo and cpu.empresa_id = d.empresa_id
where d.es_cliente

union all

-- MIEMBRO NO DEFINIDO: lo toma el hecho cuando su referencia no existe en la dimensión.
select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    null, null, null, null, null, null, false, false, true,
    null, null, null, null,
    {{ columnas_vigencia() }},
    'Sin condición', null, null
)

select
    cliente.*,
    -- Rangos de frecuencia y de abandono (antes columnas DAX sobre las de arriba).
    case when coalesce(meses_con_compra_12m, 0) = 0 then '0'
         when meses_con_compra_12m <= 3 then '1-3'
         when meses_con_compra_12m <= 6 then '4-6'
         when meses_con_compra_12m <= 9 then '7-9'
         else '10-12' end                             as rango_meses_con_compra,
    case when coalesce(meses_con_compra_12m, 0) = 0 then 0
         when meses_con_compra_12m <= 3 then 1
         when meses_con_compra_12m <= 6 then 2
         when meses_con_compra_12m <= 9 then 3
         else 4 end                                   as rango_meses_con_compra_orden,
    case when meses_sin_compra is null then 'Sin compra'
         when meses_sin_compra = 0  then '0 meses'
         when meses_sin_compra <= 3 then '1-3 meses'
         when meses_sin_compra <= 6 then '4-6 meses'
         when meses_sin_compra <= 12 then '7-12 meses'
         else '+12 meses' end                         as rango_meses_sin_compra,
    case when meses_sin_compra is null then 9
         when meses_sin_compra = 0  then 0
         when meses_sin_compra <= 3 then 1
         when meses_sin_compra <= 6 then 2
         when meses_sin_compra <= 12 then 3
         else 4 end                                   as rango_meses_sin_compra_orden
from cliente
