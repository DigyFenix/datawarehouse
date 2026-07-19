-- =====================================================================
-- Propósito : Catálogo de métricas certificadas — fuente única de
--             definiciones (§9). Toda métrica se define UNA vez y se reutiliza.
-- Tablas    : metadata.catalogo_metricas
-- Impacto   : medio; núcleo de la capa semántica.
-- Rollback  : metadata-store/rollback/30_catalogo_metricas_down.sql
-- Ref       : CLAUDE.md §9 (atributos obligatorios), §11 (solo 'certificada')
-- =====================================================================

CREATE TABLE IF NOT EXISTS metadata.catalogo_metricas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave              text        NOT NULL UNIQUE,        -- 'ventas_netas'
  nombre_oficial     text        NOT NULL,               -- 'Ventas Netas'
  definicion_negocio text        NOT NULL,
  formula            text,                               -- fórmula única; null hasta definir
  hecho_origen       text        NOT NULL
                       REFERENCES metadata.catalogo_hechos (clave),
  filtros            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  periodicidad       text,                               -- 'diaria' | 'mensual' | ...
  owner              text        NOT NULL,               -- Data Owner del dominio
  estado             metadata.estado_metrica NOT NULL DEFAULT 'borrador',
  roles_autorizados  text[]      NOT NULL DEFAULT '{}',  -- autorización (qué rol la invoca)
  aprobadores        text[]      NOT NULL DEFAULT '{}',  -- lista de aprobadores requeridos
  version_definicion integer     NOT NULL DEFAULT 1,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metadata.catalogo_metricas IS
  'Definición única por métrica (§9). El agente solo usa estado = certificada (§11). '
  'Cambiar una fórmula certificada = nueva versión + recertificación (nunca editar en silencio).';

CREATE INDEX IF NOT EXISTS ix_metricas_estado ON metadata.catalogo_metricas (estado);
CREATE INDEX IF NOT EXISTS ix_metricas_hecho  ON metadata.catalogo_metricas (hecho_origen);
