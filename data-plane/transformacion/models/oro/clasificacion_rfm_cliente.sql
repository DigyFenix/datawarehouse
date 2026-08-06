{#
  CLASIFICACIÓN RFM DE CLIENTES — Recencia · Frecuencia · Monto.

  Complementa al ABC (que mide PESO en la venta) con COMPORTAMIENTO: el ABC dice quién hace
  el negocio; el RFM dice quién se está yendo, quién es leal y a quién reactivar.

  DECISIONES QUE IMPORTAN:

  - Se calcula EN EL WAREHOUSE (§9): una sola definición para Power BI, reportes y el futuro
    agente. Un RFM en DAX cambiaría con cada filtro.
  - FECHA DE REFERENCIA = la última fecha con ventas del hecho (por empresa), NO current_date:
    así el resultado es reproducible y no se degrada si la ingesta se atrasa unos días.
  - VENTANA de frecuencia y monto = últimos 365 días desde la referencia. La recencia no tiene
    ventana: cuenta desde la última compra, sea cuando sea.
  - Quintiles por EMPRESA (ntile 5): cada sociedad compite consigo misma; mezclar empresas de
    tamaño distinto sesgaría los cortes.
  - Se EXCLUYE intercompañía y el miembro no definido, igual que el ABC.
  - GRANO: una fila por (empresa, cliente) — relación 1:1 con dim_cliente, la clase filtra el
    hecho de ventas como cualquier atributo.
  - Solo FACTURAS para recencia/frecuencia (una nota de crédito no es actividad de compra);
    el monto sí es NETO (facturas − notas) para no premiar al que compra y devuelve.
#}
{#- El post_hook desnormaliza la clasificación vigente sobre la dimensión. No puede
    ser un join dentro de la dimensión: los hechos leen la dimensión y esta tabla lee
    los hechos, así que un `ref` desde dim_cliente cerraría un ciclo. -#}
{{ config(
    materialized='table',
    post_hook="update {{ ref('dim_cliente') }} d set segmento_rfm_actual = c.segmento_rfm from {{ this }} c where c.cliente_clave = d.cliente_clave"
) }}

with referencia as (
    select empresa_id, max(fecha_documento) as fecha_ref
    from {{ ref('hecho_venta_linea') }}
    where tipo_documento = 'factura'
    group by 1
),

ventas as (
    select
        v.empresa_id,
        v.cliente_clave,
        v.fecha_documento,
        v.documento_id,
        v.tipo_documento,
        v.monto_sin_impuesto
    from {{ ref('hecho_venta_linea') }} v
    join {{ ref('maestra_cliente') }} c on c.cliente_clave = v.cliente_clave
    where coalesce(c.es_intercompania, false) = false
),

agregado as (
    select
        v.empresa_id,
        v.cliente_clave,
        min(v.fecha_documento) filter (where v.tipo_documento = 'factura') as primera_compra,
        max(v.fecha_documento) filter (where v.tipo_documento = 'factura') as ultima_compra,
        count(distinct v.documento_id) filter (
            where v.tipo_documento = 'factura'
              and v.fecha_documento > r.fecha_ref - 365)                   as frecuencia_12m,
        sum(v.monto_sin_impuesto) filter (
            where v.fecha_documento > r.fecha_ref - 365)                   as monto_neto_12m,
        max(r.fecha_ref)                                                   as fecha_ref
    from ventas v
    join referencia r on r.empresa_id = v.empresa_id
    group by 1, 2
),

-- Universo completo: todo cliente vigente no intercompañía, con o sin compras (como el ABC:
-- un RFM que no lista al cliente dormido no sirve para despertarlo).
universo as (
    select
        c.empresa_id,
        c.cliente_clave,
        g.primera_compra,
        g.ultima_compra,
        (g.fecha_ref - g.ultima_compra)                  as recencia_dias,
        coalesce(g.frecuencia_12m, 0)::int               as frecuencia_12m,
        coalesce(g.monto_neto_12m, 0)::numeric(18,4)     as monto_neto_12m,
        g.fecha_ref
    from {{ ref('maestra_cliente') }} c
    left join agregado g
           on g.empresa_id = c.empresa_id and g.cliente_clave = c.cliente_clave
    where coalesce(c.es_intercompania, false) = false
      and c.cliente_clave <> {{ clave_no_definido() }}
),

-- Quintiles SOLO entre clientes con actividad histórica; el resto queda sin puntaje.
puntuado as (
    select
        u.*,
        case when u.ultima_compra is not null then
            ntile(5) over (partition by u.empresa_id, (u.ultima_compra is not null)
                           order by u.recencia_dias asc)          -- reciente = 5
        end as puntaje_r_bruto,
        case when u.ultima_compra is not null then
            ntile(5) over (partition by u.empresa_id, (u.ultima_compra is not null)
                           order by u.frecuencia_12m desc)
        end as puntaje_f_bruto,
        case when u.ultima_compra is not null then
            ntile(5) over (partition by u.empresa_id, (u.ultima_compra is not null)
                           order by u.monto_neto_12m desc)
        end as puntaje_m_bruto
    from universo u
)

select
    p.empresa_id,
    p.cliente_clave,
    p.primera_compra,
    p.ultima_compra,
    p.recencia_dias,
    p.frecuencia_12m,
    p.monto_neto_12m,
    p.fecha_ref                                       as fecha_referencia,

    -- ntile ordena ascendente: para R el más reciente cae en el grupo 1 → se invierte para
    -- que 5 = mejor en los tres ejes.
    case when p.puntaje_r_bruto is not null then 6 - p.puntaje_r_bruto end as puntaje_recencia,
    case when p.puntaje_f_bruto is not null then 6 - p.puntaje_f_bruto end as puntaje_frecuencia,
    case when p.puntaje_m_bruto is not null then 6 - p.puntaje_m_bruto end as puntaje_monto,

    case
        when p.ultima_compra is null                                           then 'sin_historial'
        when p.frecuencia_12m = 0                                              then 'dormido'
        when (6 - p.puntaje_r_bruto) >= 4 and (6 - p.puntaje_f_bruto) >= 4     then 'campeon'
        when (6 - p.puntaje_r_bruto) >= 3 and (6 - p.puntaje_f_bruto) >= 3     then 'leal'
        when (6 - p.puntaje_r_bruto) >= 4                                      then 'reciente'
        when (6 - p.puntaje_r_bruto) <= 2 and (6 - p.puntaje_m_bruto) >= 4     then 'en_riesgo_valioso'
        when (6 - p.puntaje_r_bruto) <= 2                                      then 'en_riesgo'
        else 'regular'
    end                                               as segmento_rfm,

    case
        when p.ultima_compra is null                                           then 'Sin historial'
        when p.frecuencia_12m = 0                                              then 'Dormido · reactivar'
        when (6 - p.puntaje_r_bruto) >= 4 and (6 - p.puntaje_f_bruto) >= 4     then 'Campeón · cuidar'
        when (6 - p.puntaje_r_bruto) >= 3 and (6 - p.puntaje_f_bruto) >= 3     then 'Leal'
        when (6 - p.puntaje_r_bruto) >= 4                                      then 'Reciente · desarrollar'
        when (6 - p.puntaje_r_bruto) <= 2 and (6 - p.puntaje_m_bruto) >= 4     then 'En riesgo · VALIOSO'
        when (6 - p.puntaje_r_bruto) <= 2                                      then 'En riesgo'
        else 'Regular'
    end                                               as segmento_rfm_nombre,

    -- Trazabilidad (§12). Agregado: no arrastra fuente/extraído de una fila concreta.
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from puntuado p
