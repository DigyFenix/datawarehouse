-- Métrica: Saldo Pendiente de Cobro = saldo de documentos abiertos en CxC (§9).
{{ config(materialized='table') }}

select
    empresa_id,
    sum(saldo_pendiente) as saldo_pendiente_cobro
from {{ ref('fct_cobros_cxc') }}
group by empresa_id
