{#
  CALENDARIO. Se genera con SQL (ningún ERP lo provee) cubriendo un rango amplio para que ninguna
  fecha del hecho quede fuera — incluidas las FUTURAS, que en Grupo Cresta son operación normal
  (hay facturas con fecha del día siguiente).

  GRANO = DÍA. No hay hora en ningún nivel: el negocio se analiza por día, y guardar hora
  multiplicaría el calendario por 24 sin que nadie lo use.

  Perspectivas que habilita:
    · jerarquía natural      → año / trimestre / mes / día
    · jerarquía ISO          → año ISO / semana ISO / día de semana (comparables entre años)
    · año fiscal             → configurable con var('mes_inicio_fiscal'); 1 = calendario
    · relativas              → es_hoy, es_mes_actual, meses_desde_hoy... para "últimos 3 meses"
                               sin escribir un rango de fechas en cada visual
    · comparativos           → fecha_ano_anterior y fecha_mes_anterior, para YoY y MoM exactos
                               incluso con meses de distinta longitud
    · operativas             → es_dia_habil, dias_habiles_del_mes (para prorrateos y ritmo de venta)

  Las columnas `*_orden` existen para que Power BI ordene los textos por ellas (Ordenar por
  columna) y "Febrero" no salga después de "Diciembre".
#}
{{ config(materialized='table') }}

{%- set inicio_fiscal = var('mes_inicio_fiscal', 1) | int -%}

{#- Nombres SIEMPRE en español y explícitos. `to_char(fecha,'TMMonth')` depende del lc_time
    de la sesión de Postgres — en el contenedor (locale C) salía "January" aunque todas las
    columnas se llamen en español. Con arreglos fijos el idioma no depende del servidor. -#}
{%- set meses = "array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']" -%}
{%- set meses_cortos = "array['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']" -%}
{%- set dias = "array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']" -%}
{%- set dias_cortos = "array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']" -%}

with fechas as (
    select generate_series(
        date '{{ var("calendario_desde", "2020-01-01") }}',
        date '{{ var("calendario_hasta", "2032-12-31") }}',
        interval '1 day'
    )::date as fecha
),

base as (
    select
        fecha,
        extract(year    from fecha)::int                      as anio,
        extract(month   from fecha)::int                      as mes,
        extract(day     from fecha)::int                      as dia,
        extract(quarter from fecha)::int                      as trimestre,
        extract(isodow  from fecha)::int                      as dia_semana_num,
        extract(isoyear from fecha)::int                      as anio_iso,
        extract(week    from fecha)::int                      as semana_iso,
        extract(doy     from fecha)::int                      as dia_del_anio,
        date_trunc('month',   fecha)::date                    as primer_dia_mes,
        (date_trunc('month',  fecha) + interval '1 month - 1 day')::date  as ultimo_dia_mes,
        date_trunc('quarter', fecha)::date                    as primer_dia_trimestre,
        date_trunc('year',    fecha)::date                    as primer_dia_anio
    from fechas
),

enriquecido as (
    select
        b.*,
        -- Año fiscal: si el ejercicio arranca en un mes distinto de enero, los meses previos
        -- pertenecen al año fiscal anterior.
        case when {{ inicio_fiscal }} = 1 then b.anio
             when b.mes >= {{ inicio_fiscal }} then b.anio + 1
             else b.anio end                                  as anio_fiscal,
        case when {{ inicio_fiscal }} = 1 then b.mes
             else ((b.mes - {{ inicio_fiscal }} + 12) % 12) + 1 end as mes_fiscal,
        f.nombre                                              as feriado_nombre,
        f.fecha is not null and not coalesce(f.es_medio_dia, false) as es_feriado,
        coalesce(f.es_medio_dia, false)                       as es_medio_dia,
        -- Día hábil = lunes a viernes que no es feriado completo (seed feriados, filtrado
        -- por el país del tenant — var pais_feriados, default GT).
        -- El medio día (24/31 dic) cuenta como hábil: se opera, aunque menos horas.
        b.dia_semana_num <= 5
          and not (f.fecha is not null and not coalesce(f.es_medio_dia, false)) as es_dia_habil
    from base b
    left join {{ ref('feriados') }} f
      on f.fecha = b.fecha
     and f.pais = '{{ var("pais_feriados", "GT") }}'
)

select
    -- ---------- llave e identificación ----------
    (to_char(fecha, 'YYYYMMDD'))::bigint                      as tiempo_clave,
    fecha,

    -- ---------- jerarquía natural ----------
    anio,
    trimestre,
    mes,
    dia,
    'T' || trimestre                                          as trimestre_nombre,
    ({{ meses }})[mes]                                        as mes_nombre,
    ({{ meses_cortos }})[mes]                                 as mes_nombre_corto,
    to_char(fecha, 'YYYY-MM')                                 as anio_mes,
    anio || '-T' || trimestre                                 as anio_trimestre,
    ({{ meses_cortos }})[mes] || ' ' || anio                  as mes_anio_etiqueta,

    -- ---------- jerarquía ISO (semanas comparables entre años) ----------
    anio_iso,
    semana_iso,
    anio_iso || '-S' || lpad(semana_iso::text, 2, '0')        as anio_semana,
    dia_semana_num,
    ({{ dias }})[dia_semana_num]                              as dia_semana_nombre,
    ({{ dias_cortos }})[dia_semana_num]                       as dia_semana_corto,
    dia_del_anio,

    -- ---------- año fiscal ----------
    anio_fiscal,
    mes_fiscal,
    'FY' || anio_fiscal                                       as anio_fiscal_etiqueta,

    -- ---------- banderas de tipo de día ----------
    es_dia_habil,
    dia_semana_num > 5                                        as es_fin_semana,
    es_feriado,
    feriado_nombre,
    es_medio_dia,

    -- ---------- límites de período (para acumulados y cierres) ----------
    primer_dia_mes,
    ultimo_dia_mes,
    primer_dia_trimestre,
    primer_dia_anio,
    fecha = ultimo_dia_mes                                    as es_ultimo_dia_mes,
    fecha = primer_dia_mes                                    as es_primer_dia_mes,
    (date_part('day', ultimo_dia_mes))::int                   as dias_del_mes,

    -- Días hábiles del mes al que pertenece la fecha, y cuántos van transcurridos HASTA ella
    -- (inclusive). El par habilita el ritmo real de venta y la proyección de cierre de mes:
    -- dividir entre días naturales castiga a los meses con muchos feriados y da una proyección
    -- pesimista. Se calculan por ventana sobre el propio calendario para no depender del hecho.
    sum(case when es_dia_habil then 1 else 0 end)
        over (partition by primer_dia_mes)::int               as dias_habiles_del_mes,
    sum(case when es_dia_habil then 1 else 0 end)
        over (partition by primer_dia_mes order by fecha
              rows between unbounded preceding and current row)::int as dias_habiles_transcurridos,

    -- ---------- perspectivas RELATIVAS a hoy ----------
    -- Permiten filtros como "últimos 3 meses" o "año en curso" sin escribir fechas fijas en
    -- cada visual, que es la causa habitual de reportes que se rompen al pasar el mes.
    fecha = current_date                                      as es_hoy,
    fecha < current_date                                      as es_pasado,
    date_trunc('month', fecha) = date_trunc('month', current_date)   as es_mes_actual,
    date_trunc('quarter', fecha)
        = date_trunc('quarter', current_date)                 as es_trimestre_actual,
    anio = extract(year from current_date)::int               as es_anio_actual,
    date_trunc('month', fecha)
        = date_trunc('month', current_date - interval '1 month')     as es_mes_anterior,
    (fecha - current_date)                                    as dias_desde_hoy,
    (extract(year from fecha)::int * 12 + extract(month from fecha)::int)
      - (extract(year from current_date)::int * 12 + extract(month from current_date)::int)
                                                              as meses_desde_hoy,
    fecha <= current_date
      and fecha >= date_trunc('year', current_date)::date     as es_anio_hasta_hoy,
    fecha <= current_date
      and fecha >= date_trunc('month', current_date)::date    as es_mes_hasta_hoy,

    -- ---------- comparativos exactos ----------
    -- Precalculados para no depender de aritmética de fechas en DAX con meses desiguales.
    (fecha - interval '1 year')::date                         as fecha_anio_anterior,
    (fecha - interval '1 month')::date                        as fecha_mes_anterior,
    (to_char(fecha - interval '1 year', 'YYYYMMDD'))::bigint  as tiempo_clave_anio_anterior,
    (to_char(fecha - interval '1 month', 'YYYYMMDD'))::bigint as tiempo_clave_mes_anterior,

    -- ---------- orden para etiquetas de texto ----------
    (anio * 100 + mes)                                        as anio_mes_orden,
    (anio * 10  + trimestre)                                  as anio_trimestre_orden,
    (anio_iso * 100 + semana_iso)                             as anio_semana_orden,
    mes                                                       as mes_orden,
    dia_semana_num                                            as dia_semana_orden
from enriquecido

-- SIN MIEMBRO NO DEFINIDO — es la ÚNICA dimensión que no lo lleva, y es deliberado:
-- Power BI exige que una tabla marcada como calendario tenga su columna de fecha ÚNICA, SIN
-- NULOS y CONTIGUA. Una fila "No definido" con fecha nula rompe la primera condición (el
-- modelo no carga) y con una fecha centinela tipo 1900-01-01 rompería la tercera (hueco de
-- 120 años). Los hechos cuya fecha sea nula llevan clave -1, que no existe aquí: Power BI los
-- agrupa en su fila en blanco automática y el total sigue cuadrando. En SQL, el LEFT JOIN
-- deja los atributos de fecha en NULL, que es exactamente lo que significa "sin fecha".
-- Hoy no hay ninguno: 0 de 25,273 líneas de venta y 0 de 8,339 partidas de cartera.
