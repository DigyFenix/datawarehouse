-- =====================================================================
-- Seed de TENANT (grupocresta): NIT de las compañías afiliadas del grupo
-- (intercompañía). Extraído de la migración 112, que ahora es solo DDL:
-- los datos de un tenant no viven en migraciones del motor.
-- Ejecución : psql sobre la base de control `cresta_dw`.
-- Impacto   : bajo; solo inserta si falta (idempotente por unicidad).
-- Equivale a: capturar los NIT en el portal (Sociedades → NITs afiliados).
-- =====================================================================

INSERT INTO gobierno.nits_afiliados (organizacion_id, nit)
SELECT o.id, v.nit
  FROM gobierno.organizaciones o
 CROSS JOIN (VALUES
    ('1230263'), ('109967739'), ('90738772'), ('4733851'), ('4733843'),
    ('5333814'), ('105077283'), ('1182706'), ('82686742'), ('05011105181019')
  ) AS v (nit)
 WHERE o.codigo = 'grupocresta'
ON CONFLICT ON CONSTRAINT uq_nits_afiliados_org_nit DO NOTHING;
