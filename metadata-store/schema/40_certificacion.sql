-- =====================================================================
-- Propósito : Certificación multi-aprobador y versionado de métricas (§9).
--             Una versión entra en vigor cuando TODOS sus aprobadores aprueban.
-- Tablas    : metadata.metrica_versiones, metadata.metrica_aprobaciones
-- Impacto   : medio; soporta el flujo de gobernanza (Fase 3).
-- Rollback  : metadata-store/rollback/40_certificacion_down.sql
-- Ref       : CLAUDE.md §9, §12
-- =====================================================================

-- Historial de versiones de la definición de una métrica.
CREATE TABLE IF NOT EXISTS metadata.metrica_versiones (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metrica_id         bigint      NOT NULL
                       REFERENCES metadata.catalogo_metricas (id) ON DELETE CASCADE,
  version            integer     NOT NULL,
  formula            text        NOT NULL,
  definicion_negocio text        NOT NULL,
  estado             metadata.estado_metrica NOT NULL DEFAULT 'en_revision',
  fecha_certificacion timestamptz,                       -- se llena al certificar
  certificada_por    text,                               -- quién consolidó la certificación
  creado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por         text        NOT NULL,
  notas              text,
  UNIQUE (metrica_id, version)
);

COMMENT ON TABLE metadata.metrica_versiones IS
  'Versiones de la definición de una métrica. Cambiar fórmula certificada = nueva versión (§9).';

-- Voto de cada aprobador requerido para una versión concreta.
CREATE TABLE IF NOT EXISTS metadata.metrica_aprobaciones (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metrica_version_id bigint      NOT NULL
                       REFERENCES metadata.metrica_versiones (id) ON DELETE CASCADE,
  aprobador          text        NOT NULL,
  aprobado           boolean,                             -- null = pendiente
  fecha              timestamptz,
  comentario         text,
  UNIQUE (metrica_version_id, aprobador)
);

COMMENT ON TABLE metadata.metrica_aprobaciones IS
  'Certificación multi-aprobador (§9): la versión se certifica cuando TODOS los aprobadores aprueban.';
