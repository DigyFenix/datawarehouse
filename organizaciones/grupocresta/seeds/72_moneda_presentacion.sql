-- =====================================================================
-- Seed de TENANT (grupocresta): moneda de presentación de las sociedades
-- que consolidan a una moneda distinta de la local. Extraído de la
-- migración 114, que ahora es solo DDL + backfill neutro.
-- Ejecución : psql sobre la base de control `cresta_dw`.
-- Impacto   : bajo; UPDATE de una fila (idempotente).
-- Equivale a: configurar la sociedad en el portal (Sociedades).
-- =====================================================================

-- Proavisa de El Salvador (USD) consolida al GTQ del grupo (solicitud 2026-08-02).
UPDATE gobierno.sociedades s
   SET moneda_presentacion = 'GTQ', actualizado_en = now()
  FROM gobierno.organizaciones o
 WHERE s.organizacion_id = o.id
   AND o.codigo = 'grupocresta'
   AND s.empresa_id = 'svproavis'
   AND s.moneda_presentacion IS DISTINCT FROM 'GTQ';
