-- =====================================================================
-- Propósito : Configurar por organización los NIT de sus COMPAÑÍAS
--             AFILIADAS (intercompañía). El plano de datos los lee al
--             transformar: todo cliente/proveedor cuyo NIT normalizado
--             coincida se marca es_intercompania en Oro. Sustituye la
--             lista pasada a mano por línea de comandos (gap conocido
--             del botón Transformar).
-- Ejecución : sobre la base de control `quilate_control`.
-- Tablas    : gobierno.nits_afiliados (nueva)
-- Impacto   : bajo; SOLO DDL. Los datos de cada organización se cargan con su
--             seed (p. ej. organizaciones/grupocresta/seeds/71_nits_afiliados.sql)
--             o desde el portal (Sociedades → NITs afiliados).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/112_nits_afiliados_down.sql
-- Ref       : CLAUDE.md §4 (el portal escribe, el plano de datos lee)
-- =====================================================================

-- 1) La tabla. `nit` guarda el valor tal como se capturó; `nit_normalizado` es
--    la forma CANÓNICA de comparación: mayúsculas y solo [0-9K] (dígitos y la
--    letra de verificación K de los NIT guatemaltecos). Así '0501-1105-181019',
--    'P05011105181019' y '05011105181019' coinciden aunque el ERP y el usuario
--    los escriban distinto. La normalización vive en la BD (columna generada):
--    una sola definición, imposible de desincronizar entre portal y worker.
CREATE TABLE IF NOT EXISTS gobierno.nits_afiliados (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizacion_id  bigint NOT NULL REFERENCES gobierno.organizaciones (id),
  nit              text   NOT NULL,
  nit_normalizado  text   GENERATED ALWAYS AS (
                     regexp_replace(upper(nit), '[^0-9K]', '', 'g')
                   ) STORED,
  nombre           text,
  activo           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_nits_afiliados_org_nit UNIQUE (organizacion_id, nit_normalizado),
  CONSTRAINT ck_nits_afiliados_no_vacio CHECK (
    regexp_replace(upper(nit), '[^0-9K]', '', 'g') <> ''
  )
);

COMMENT ON TABLE gobierno.nits_afiliados IS
  'NIT de compañías afiliadas por organización. El worker los pasa a dbt como '
  'var nits_grupo; los modelos de Oro marcan es_intercompania comparando por '
  'nit_normalizado. El portal administra; el plano de datos solo lee.';
COMMENT ON COLUMN gobierno.nits_afiliados.nit_normalizado IS
  'Forma canónica de comparación: upper + solo [0-9K]. Columna generada; no se escribe.';

-- 2) Los NIT de cada organización se cargan con su seed de tenant
--    (organizaciones/<codigo>/seeds/) o desde el portal. La migración quedó
--    solo con DDL a partir del barrido de genericidad de 2026-08-07; la carga
--    inicial de Grupo Cresta vive en organizaciones/grupocresta/seeds/71_nits_afiliados.sql.
