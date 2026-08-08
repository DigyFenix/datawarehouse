-- =============================================================================
-- 127 · Métricas derivadas de la organización  (SE APLICA EN LA BASE DEL TENANT)
-- =============================================================================
-- PROPÓSITO
--   Que el admin de la organización pueda construir sus propios indicadores sin
--   escribir SQL y sin esperar al proveedor, pero SIN romper la gobernanza.
--
--   Una métrica base no es una fila: es SQL en un modelo dbt versionado. Dejar que
--   el cliente cree métricas base llevaría a una de dos cosas malas — fichas sin
--   cálculo que el agente ofrece y no puede responder, o una consola SQL contra el
--   almacén. Aquí sólo se COMPONE sobre lo ya certificado:
--
--       razon       A / B          (margen sobre ventas)
--       porcentaje  A / B × 100    (% de devoluciones)
--       suma        A + B
--       resta       A − B          (posición neta: por cobrar − por pagar)
--
--   El cálculo NO se traduce a SQL generado: el motor consulta A y B de
--   `oro.metrica_valor` y las combina por (empresa, período) en código. Se respeta
--   la prohibición de SQL arbitrario de CLAUDE.md §11 y §14.
--
-- OBJETOS AFECTADOS
--   Crea `portal.metricas_derivadas` en la base del tenant.
--
-- IMPACTO ESTIMADO
--   Tabla nueva y vacía. Nada cambia hasta que el admin defina una.
--
-- DECISIONES DE GOBERNANZA
--   · Los operandos deben ser métricas CONSULTABLES del catálogo (certificada o
--     exploratoria). Se valida en el API contra la base de control.
--   · Quien consulte una derivada necesita alcance sobre TODOS sus operandos: si no,
--     una derivada sería un rodeo para ver una métrica no autorizada.
--   · Una derivada que use un operando exploratorio es exploratoria: la certeza de
--     un resultado no puede ser mayor que la de sus partes.
--
-- APLICACIÓN
--   Por cada base `dw_*`:  psql -U <admin> -d dw_<codigo> -f 127_metricas_derivadas.sql
--
-- ROLLBACK  →  metadata-store/rollback/127_metricas_derivadas_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS portal.metricas_derivadas (
  id          bigserial   PRIMARY KEY,
  clave       text        NOT NULL,
  nombre      text        NOT NULL,
  definicion  text        NOT NULL,
  operacion   text        NOT NULL,
  -- Claves de métrica del catálogo del producto, que vive en OTRA base: texto y no
  -- llave foránea. La existencia se valida en el API.
  operando_a  text        NOT NULL,
  operando_b  text        NOT NULL,
  unidad      text        NOT NULL DEFAULT 'numero',
  activa      boolean     NOT NULL DEFAULT true,
  creado_por  text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_derivada_clave  UNIQUE (clave),
  CONSTRAINT ck_derivada_clave  CHECK (clave ~ '^[a-z0-9_]+$'),
  CONSTRAINT ck_derivada_op     CHECK (operacion IN ('razon', 'porcentaje', 'suma', 'resta')),
  CONSTRAINT ck_derivada_unidad CHECK (unidad IN ('numero', 'moneda', 'porcentaje')),
  -- Una métrica compuesta consigo misma no aporta nada y delata un error de captura.
  CONSTRAINT ck_derivada_operandos CHECK (operando_a <> operando_b)
);

COMMENT ON TABLE portal.metricas_derivadas IS
  'Indicadores propios de la organización, compuestos sobre métricas ya certificadas. No contienen SQL: el motor combina los operandos por (empresa, período).';
COMMENT ON COLUMN portal.metricas_derivadas.clave IS
  'Identificador que usa el agente. Mismo alfabeto que el catálogo del producto.';
COMMENT ON COLUMN portal.metricas_derivadas.operando_a IS
  'Clave de métrica del catálogo del producto (otra base): sin llave foránea, se valida en el API.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_lector') THEN
    GRANT SELECT ON portal.metricas_derivadas TO portal_lector;
  END IF;
END $$;
