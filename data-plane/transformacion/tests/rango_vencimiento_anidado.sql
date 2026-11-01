-- Cada rango FINO de vencimiento debe caer entero dentro de su rango grueso de antigüedad: si se
-- mueve un corte en dim_rango_vencimiento y no en dim_rango_aging (o al revés), el reporte
-- mostraría «Vencido 16-30» bajo «31 a 60 días». Devuelve los rangos que se salen.
select f.rango_vencimiento, g.rango_aging_nombre
from {{ ref('dim_rango_vencimiento') }} f
join {{ ref('dim_rango_aging') }} g on g.rango_aging_clave = f.rango_aging_clave
where f.dias_desde is not null
  and (
        -- vencido: días vencido dentro de [dias_desde, dias_hasta] del grueso
        (g.es_vencido and (f.dias_desde < g.dias_desde or (g.dias_hasta is not null and f.dias_hasta > g.dias_hasta)))
        -- corriente: todo lo no vencido (días vencido <= 0)
     or (not g.es_vencido and f.dias_hasta > 0)
  )
