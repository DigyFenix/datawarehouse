{#
  Mapa de llaves sustitutas de `dirección`. Llave natural: (empresa, socio, tipo, código) —
  en SAP el mismo código de dirección puede existir como entrega Y facturación del mismo
  socio (CRD1: CardCode + AdresType + Address).
#}
{{ config(
    materialized = 'incremental',
    unique_key = ['empresa_id', 'socio_codigo', 'tipo', 'direccion_codigo']
) }}

{{ mapa_llaves(ref('plata_direccion'), ['empresa_id', 'socio_codigo', 'tipo', 'direccion_codigo']) }}
