{#
  Rangos FINOS de vencimiento de cartera (sesión 38, auditoría §6) — el nivel de detalle de la
  dimensión de antigüedad (`dim_rango_aging`).

  Por qué existe: el reporte usaba dos definiciones de aging a la vez — la dimensión de Oro
  (corriente / 1-30 / 31-60 / 61-90 / +90) y dos columnas calculadas en Power BI con cortes
  propios (vence en 31+ … vencido 91+). Dos definiciones del mismo concepto terminan diciendo
  cosas distintas. Ahora el rango fino vive aquí, una sola vez, y cada rango declara a qué rango
  de `dim_rango_aging` pertenece (`rango_aging_clave`): es una jerarquía, no un segundo aging.

  `dias_desde` / `dias_hasta` están en DÍAS VENCIDO (corte − vencimiento): positivo = vencido,
  cero o negativo = días que faltan para vencer. Los extremos abiertos usan ±100000.
  Los hechos de cartera se unen por rango (`hecho_cartera_cobrar/pagar.rango_vencimiento*`).
  El test `rango_vencimiento_anidado` (_oro.yml) exige que cada rango fino caiga entero dentro de
  su rango grueso: si alguien cambia un corte de un lado y no del otro, el build falla.

  Etiquetas en lenguaje claro («Vence en 22-30», «Vencido 31-60»): pedido de Edwin (sesión 31).
#}
{{ config(materialized='table') }}

with rangos(llave, codigo, nombre, orden, estado, dias_desde, dias_hasta, rango_aging_clave) as (
    values
        ( 1, 'vence_31',   'Vence en 31+',    1, 'No vencido', -100000, -31,  1),
        ( 2, 'vence_22',   'Vence en 22-30',  2, 'No vencido', -30,     -22,  1),
        ( 3, 'vence_15',   'Vence en 15-21',  3, 'No vencido', -21,     -15,  1),
        ( 4, 'vence_8',    'Vence en 8-14',   4, 'No vencido', -14,     -8,   1),
        ( 5, 'vence_0',    'Vence en 7',      5, 'No vencido', -7,       0,   1),
        ( 6, 'vencido_1',  'Vencido 1-15',    6, 'Vencido',     1,       15,  2),
        ( 7, 'vencido_16', 'Vencido 16-30',   7, 'Vencido',     16,      30,  2),
        ( 8, 'vencido_31', 'Vencido 31-60',   8, 'Vencido',     31,      60,  3),
        ( 9, 'vencido_61', 'Vencido 61-90',   9, 'Vencido',     61,      90,  4),
        (10, 'vencido_91', 'Vencido 91+',    10, 'Vencido',     91,  100000,  5),
        (11, 'sin_vencimiento', 'Sin vencimiento', 0, 'No vencido', null, null, 6)
)

select
    llave                                             as rango_vencimiento_clave,
    codigo                                            as rango_vencimiento_codigo,
    nombre                                            as rango_vencimiento,
    orden                                             as rango_vencimiento_orden,
    estado                                            as estado_vencimiento,
    dias_desde,
    dias_hasta,
    rango_aging_clave
from rangos
