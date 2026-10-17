{#
  Mapa de llaves sustitutas de `canal`: (llave natural del ERP → entero autoincremental).
  INCREMENTAL y sin reasignación, como el resto de llaves: una llave asignada no cambia nunca.
#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'canal_codigo']
) }}

{{ mapa_llaves(ref('plata_canal'), ['empresa_id', 'canal_codigo']) }}
