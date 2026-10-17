{#
  Mapa de llaves sustitutas de `condicion_pago`: (llave natural del ERP → entero autoincremental).
  INCREMENTAL y sin reasignación, como el resto de llaves.
#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'condicion_pago_codigo']
) }}

{{ mapa_llaves(ref('plata_condicion_pago'), ['empresa_id', 'condicion_pago_codigo']) }}
