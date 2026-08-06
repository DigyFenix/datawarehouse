{#
  DIMENSIÓN AÑO — el puente entre lo que se mide por día y lo que se clasifica por año.

  POR QUÉ EXISTE: las clasificaciones ABC tienen grano anual (una fila por cliente y año) y el
  calendario tiene grano día. Relacionarlas directamente exige un muchos-a-muchos, que Power BI
  resuelve filtrando en AMBAS direcciones — justo la propagación cruzada que se eliminó al quitar
  las relaciones bidireccionales. Con esta tabla en medio, ambos lados cuelgan de ella con
  relaciones 1:M normales y el filtro es explícito.

  CONSECUENCIA QUE HAY QUE CONOCER: el segmentador de fechas del calendario NO filtra las
  clasificaciones. Para acotarlas se usa el segmentador de esta dimensión ('Año de
  clasificación'). Es deliberado: la clase ABC de un cliente es un atributo del AÑO COMPLETO;
  filtrarla con un rango de marzo a mayo no significaría nada.

  Se genera desde el rango del calendario para que exista el año aunque todavía no haya
  clasificación que colgar de él, y así el segmentador nunca aparezca vacío.
#}
{{ config(materialized='table') }}

with anios as (
    select distinct anio
    from {{ ref('dim_tiempo') }}
)

select
    anio                                              as anio_clave,
    anio,
    anio::text                                        as anio_nombre,
    anio = extract(year from current_date)::int       as es_anio_actual,
    anio = extract(year from current_date)::int - 1   as es_anio_anterior,
    (extract(year from current_date)::int - anio)     as anios_desde_hoy,
    {{ columnas_vigencia() }}
from anios

union all

-- Miembro No definido: una clasificación sin año resoluble sigue cruzando (§8).
select
    {{ clave_no_definido() }}, null, {{ nombre_no_definido() }},
    false, false, null,
    {{ columnas_vigencia() }}
