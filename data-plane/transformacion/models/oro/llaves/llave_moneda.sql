{#
  Mapa de llaves sustitutas de `moneda`: (llave natural del ERP → entero autoincremental).
  INCREMENTAL y sin reasignación: un código que ya tiene llave la conserva para siempre, así las
  relaciones guardadas en Power BI no se corren cuando entra un registro nuevo.
#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'moneda_codigo']
) }}

{{ mapa_llaves(ref('plata_moneda'), ['empresa_id', 'moneda_codigo']) }}
