{#
  TASA DE PRESENTACIÓN POR SOCIEDAD Y DÍA.

  Regla del producto (genérica, sin fuente maestra): una sociedad cuya moneda local difiere de
  su moneda de presentación convierte con la serie de tipo de cambio de la PROPIA sociedad
  (ORTT en SAP / rates en Odoo). Sin tasa válida NO se convierte (tasa null → montos de grupo
  null): quien quiera consolidar, captura su tasa en el ERP.

  Convención de la tasa (estándar SAP): `tasa` = unidades de MONEDA LOCAL por 1 unidad de la
  moneda cotizada. Convertir local → presentación = monto / tasa. Para sociedades que ya
  presentan en su moneda local, tasa = 1 (la conversión es neutra y el join del hecho es
  uniforme).

  GUARDAS (casos reales que obligaron cada una):
  · Rango: tasa fuera de [mediana/3, mediana×3] de su serie se descarta — Proavisa tiene un
    7.65 capturado como 765,176 (sin punto decimal).
  · Reciprocidad: si otra sociedad del grupo cotiza el par INVERSO, las medianas deben ser
    recíprocas (m1×m2 ≈ 1). Si en cambio son IGUALES, la serie está capturada al revés —
    Proavisa El Salvador registra "QTZ 7.63" (quetzales por dólar) donde SAP espera dólares
    por quetzal. Serie invertida ⇒ se usa 1/tasa (estado_serie = 'invertida_corregida').
    No es asumir un dato: la reciprocidad PRUEBA la orientación con la serie espejo del
    grupo; solo cambia el camino del cálculo (decisión de Edwin, 2026-08-02). Donde NO hay
    prueba posible tampoco hay adivinanza: sin serie hacia la moneda de presentación, la
    sociedad queda en su moneda local (tasa null).
  · Vigencia: la tasa se arrastra hasta 92 días. Los huecos reales no son solo fines de
    semana: svproavis pasó del 31-ene al 10-abr sin capturar (69 días) con la serie viva.
    Un trimestre de arrastre cubre hábitos de captura irregulares; una serie muerta más de
    92 días vuelve a la regla base: sin tasa, la sociedad queda en su moneda local.
#}
{{ config(materialized='table') }}

{%- set sociedades = var('sociedades', []) -%}

with maestra (empresa_id, moneda_local, moneda_presentacion) as (
{%- if sociedades %}
    values
{%- for s in sociedades %}
    ('{{ s["empresa_id"] | replace("'", "''") }}', nullif('{{ s["moneda"] | replace("'", "''") }}', ''), nullif('{{ s["moneda_presentacion"] | replace("'", "''") }}', '')){{ "," if not loop.last }}
{%- endfor %}
{%- else %}
    -- Sin var('sociedades') (corrida manual): toda empresa presenta en su moneda local.
    select empresa_id, max(moneda_codigo), max(moneda_codigo)
      from {{ ref('plata_tipo_cambio') }} where false group by 1
{%- endif %}
),

-- Días a cubrir: desde 2024 (cartera vieja abierta) hasta un año adelante (SAP B1 admite
-- documentos con fecha futura; en Cresta son operación normal).
dias as (
    select d::date as fecha
    from generate_series(date '2024-01-01', current_date + interval '400 days', interval '1 day') d
),

-- Serie cruda de cada sociedad hacia SU moneda de presentación. Los códigos del ERP se
-- homologan a ISO (SAP Guatemala cotiza el quetzal como 'QTZ'; el portal guarda 'GTQ').
serie as (
    select m.empresa_id, t.fecha, t.tasa
    from maestra m
    join {{ ref('plata_tipo_cambio') }} t
      on t.empresa_id = m.empresa_id
     and {{ moneda_iso('t.moneda_codigo') }} = m.moneda_presentacion
    where m.moneda_presentacion is not null
      and m.moneda_local is distinct from m.moneda_presentacion
),

medianas as (
    select empresa_id,
           percentile_cont(0.5) within group (order by tasa) as mediana
    from serie
    group by empresa_id
),

-- Guarda de RANGO: fuera de [mediana/3, mediana×3] es un error de captura, no una devaluación.
serie_valida as (
    select s.empresa_id, s.fecha, s.tasa
    from serie s
    join medianas md on md.empresa_id = s.empresa_id
    where s.tasa between md.mediana / 3 and md.mediana * 3
),

-- Guarda de RECIPROCIDAD: mediana de la serie de E (local L → cotiza P) contra la mediana de
-- cualquier sociedad R con local P que cotice L. Recíprocas (producto ≈ 1) = sana; IGUALES
-- (cociente ≈ 1) = invertida.
reciprocidad as (
    select m.empresa_id,
           bool_or(
               abs(md.mediana - inv.mediana_inversa) / nullif(inv.mediana_inversa, 0) < 0.2
           ) as invertida
    from maestra m
    join medianas md on md.empresa_id = m.empresa_id
    join (
        select mr.moneda_local as moneda, {{ moneda_iso('tr.moneda_codigo') }} as cotiza,
               percentile_cont(0.5) within group (order by tr.tasa) as mediana_inversa
        from maestra mr
        join {{ ref('plata_tipo_cambio') }} tr
          on tr.empresa_id = mr.empresa_id
        group by 1, 2
    ) inv
      on inv.moneda = m.moneda_presentacion and inv.cotiza = m.moneda_local
    group by m.empresa_id
),

-- Serie diaria con arrastre: la última tasa válida ≤ fecha, con vigencia máxima de 92 días.
diaria as (
    select m.empresa_id, d.fecha,
           (select sv.tasa
              from serie_valida sv
             where sv.empresa_id = m.empresa_id
               and sv.fecha <= d.fecha
               and sv.fecha > d.fecha - 92
             order by sv.fecha desc
             limit 1) as tasa
    from maestra m
    cross join dias d
    where m.moneda_presentacion is not null
      and m.moneda_local is distinct from m.moneda_presentacion
)

-- Sociedades que ya presentan en su moneda: tasa neutra 1 (join uniforme en los hechos).
select
    m.empresa_id,
    d.fecha,
    m.moneda_local,
    coalesce(m.moneda_presentacion, m.moneda_local)   as moneda_presentacion,
    1::numeric(18,6)                                  as tasa,
    'ok'::text                                        as estado_serie,
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from maestra m
cross join dias d
where m.moneda_presentacion is null
   or m.moneda_local is not distinct from m.moneda_presentacion

union all

select
    di.empresa_id,
    di.fecha,
    m.moneda_local,
    m.moneda_presentacion,
    -- Serie invertida: se convierte por el camino inverso (1/tasa). La orientación quedó
    -- probada por reciprocidad, no asumida.
    case when coalesce(r.invertida, false) and di.tasa <> 0 then 1 / di.tasa
         else di.tasa end                             as tasa,
    case when di.tasa is null then 'sin_tasa'
         when coalesce(r.invertida, false) then 'invertida_corregida'
         else 'ok' end                                as estado_serie,
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from diaria di
join maestra m on m.empresa_id = di.empresa_id
left join reciprocidad r on r.empresa_id = di.empresa_id
