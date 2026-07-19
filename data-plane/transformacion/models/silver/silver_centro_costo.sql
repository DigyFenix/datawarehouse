-- Dimensión canónica: centro de costo. Mapea OOCR.
{{ config(materialized='table') }}

select
    empresa_id,
    ocrcode as centro_costo_codigo,
    ocrname as nombre
from {{ ref('bronze_oocr') }}
