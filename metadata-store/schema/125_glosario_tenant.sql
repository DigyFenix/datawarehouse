-- =============================================================================
-- 125 · Glosario propio de cada organización  (SE APLICA EN LA BASE DEL TENANT)
-- =============================================================================
-- PROPÓSITO
--   El vocabulario del negocio es lo más propio que tiene una empresa: lo que en
--   una avícola es «cliente de ruta» no significa nada en una distribuidora de
--   tecnología. Hasta ahora el glosario vivía SOLO en la base de control, en una
--   tabla sin `organizacion_id` — una sola lista compartida por todos los tenants.
--
--   Se aplica la misma regla base/extensión que el resto del producto:
--     · el glosario del PRODUCTO (base de control) trae los términos universales
--       y es de sólo lectura para el cliente;
--     · `portal.glosario` es el del tenant, lo administra SU admin, y ante un
--       término repetido gana el del tenant — su casa, sus palabras.
--
-- OBJETOS AFECTADOS
--   Crea `portal.glosario` en la base del tenant. No toca la de control.
--
-- IMPACTO ESTIMADO
--   Tabla nueva y vacía. El agente sigue leyendo el glosario base hasta que el
--   admin de la organización agregue términos propios.
--
-- APLICACIÓN
--   Por cada base `dw_*`, igual que 110/119/120/121:
--     psql -U <admin> -d dw_<codigo> -f 125_glosario_tenant.sql
--
-- ROLLBACK  →  metadata-store/rollback/125_glosario_tenant_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS portal.glosario (
  id            bigserial PRIMARY KEY,
  termino       text        NOT NULL,
  definicion    text        NOT NULL,
  -- Clave de métrica del catálogo a la que traduce el término. Es texto y NO una
  -- llave foránea: el catálogo vive en OTRA base (la de control) y la integridad
  -- se valida en el API, no en el motor.
  equivale_a    text,
  dominio       text,
  creado_por    text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_glosario_termino UNIQUE (termino)
);

COMMENT ON TABLE portal.glosario IS
  'Vocabulario propio de la organización. Se superpone al glosario base del producto: ante un término repetido, gana este.';
COMMENT ON COLUMN portal.glosario.equivale_a IS
  'Clave de métrica a la que traduce el término. Sin llave foránea: el catálogo vive en la base de control.';

-- El rol de consumo lo lee: el agente arma su vocabulario bajo RLS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_lector') THEN
    GRANT SELECT ON portal.glosario TO portal_lector;
  END IF;
END $$;
