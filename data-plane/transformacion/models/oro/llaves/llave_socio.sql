{#
  Mapa de llaves sustitutas de `socio de negocio`: TODOS los socios (cliente, proveedor o
  ambos) en un solo mapa, sin filtro de rol. Habilita la dimensión consolidada para la vista
  360° sin tocar los mapas por rol (llave_cliente / llave_proveedor), que siguen gobernando
  las dimensiones de proceso.
#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'socio_codigo']
) }}

{{ mapa_llaves(ref('plata_socio_negocio'), ['empresa_id', 'socio_codigo']) }}
