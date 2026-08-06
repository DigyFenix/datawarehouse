{#
  CLASIFICACIÓN DE ANTIGÜEDAD DE CARTERA — una sola definición de los cortes.

  Por qué una macro y no el `case` escrito en cada hecho: el rango se necesita en DOS formas
  —la etiqueta legible y la clave entera de la dimensión— y en cuatro modelos (cartera por
  cobrar, por pagar y sus dos fotos diarias). Ocho copias del mismo `case` es una desincronización
  esperando a ocurrir: basta que alguien mueva un corte en un sitio y el aging del tablero deja
  de cuadrar con el de la dimensión, sin que nada falle.

  Los cortes (30/60/90) son los del paquete base y deben coincidir EXACTAMENTE con las llaves
  fijas de `dim_rango_aging`. El test de `relationships` en `_oro.yml` falla si se separan.
#}

{#- Etiqueta o clave entera del rango, según el criterio de días vencidos. -#}
{% macro aging_rango(corte, vencimiento, salida='codigo') %}
{%- set etiqueta = salida == 'codigo' -%}
    case
        when {{ vencimiento }} is null              then {{ "'sin_vencimiento'" if etiqueta else 6 }}
        when {{ corte }} <= {{ vencimiento }}       then {{ "'corriente'" if etiqueta else 1 }}
        when {{ corte }} - {{ vencimiento }} <= 30  then {{ "'1-30'" if etiqueta else 2 }}
        when {{ corte }} - {{ vencimiento }} <= 60  then {{ "'31-60'" if etiqueta else 3 }}
        when {{ corte }} - {{ vencimiento }} <= 90  then {{ "'61-90'" if etiqueta else 4 }}
        else {{ "'+90'" if etiqueta else 5 }}
    end
{%- endmacro %}


{#- Traduce la etiqueta a su clave. Solo para rellenar filas históricas de las fotos diarias
    que se guardaron antes de que existiera la columna de clave: ahí ya no hay fecha de corte
    contra la que recalcular, pero la etiqueta sí quedó guardada. -#}
{% macro aging_clave_desde_codigo(columna) %}
    case {{ columna }}
        when 'corriente'       then 1
        when '1-30'            then 2
        when '31-60'           then 3
        when '61-90'           then 4
        when '+90'             then 5
        when 'sin_vencimiento' then 6
        else {{ clave_no_definido() }}
    end
{%- endmacro %}
