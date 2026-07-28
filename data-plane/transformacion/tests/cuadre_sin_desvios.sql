-- GOBERNANZA: ningún concepto puede quedar fuera de cuadre.
--
-- Si este test devuelve filas, la corrida FALLA y Oro no se publica. Es deliberado: mejor no
-- mostrar un dato que mostrarlo distinto al que el contador ve en su ERP. En una demo, un
-- total que no coincide mata la venta y no se recupera.
--
-- Este control ya demostró su valor: detectó que filtrar los cancelados de SAP B1 con
-- `<> 'Y'` dejaba pasar los documentos de cancelación ('C') e inflaba las ventas de junio
-- en Q1,634,294.22.

select
    empresa_id,
    concepto,
    valor_erp,
    valor_canonico,
    diferencia,
    diferencia_pct,
    tolerancia
from {{ ref('plata_control_cuadre') }}
where not cuadra
