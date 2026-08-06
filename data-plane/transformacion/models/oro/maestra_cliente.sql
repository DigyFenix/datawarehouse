{#
  Maestra mínima de clientes para las tablas de clasificación: llave sustituta, empresa y la
  bandera de intercompañía.

  POR QUÉ EXISTE, y no se lee `dim_cliente` directamente: la dimensión CONSUME las
  clasificaciones para exponer la clase vigente (`clase_abc_actual`, `segmento_rfm_actual`,
  `perfil_riesgo_actual`), así que si las clasificaciones leyeran la dimensión habría un ciclo
  y dbt lo rechazaría. Apuntar a la maestra canónica es además la dirección correcta del flujo:
  una clasificación analítica no debería depender de cómo se presenta la maestra.

  EPHEMERAL: no materializa nada; se inyecta como CTE en cada modelo que la referencia. Evita
  repetir el mismo join en cuatro sitios, que es donde empiezan las desincronizaciones.
#}
{{ config(materialized='ephemeral') }}

select
    k.llave                                           as cliente_clave,
    s.empresa_id,
    s.socio_codigo                                    as cliente_codigo,
    {{ es_nit_afiliado('s.nit') }}                    as es_intercompania
from {{ ref('plata_socio_negocio') }} s
join {{ ref('llave_cliente') }} k
     on k.empresa_id = s.empresa_id and k.socio_codigo = s.socio_codigo
where s.es_cliente
