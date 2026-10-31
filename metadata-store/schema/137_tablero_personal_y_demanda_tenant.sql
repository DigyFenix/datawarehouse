-- =====================================================================
-- Propósito : (1) «Mi tablero» del portal de usuario: una consulta guardada
--             puede fijarse al tablero personal con orden y ancho; el tablero
--             se arma con widgets JS/HTML sobre la MISMA especificación
--             reejecutable (tool + params), nunca con resultados guardados.
--             (2) Bitácora de DEMANDA NO ATENDIDA: lo que la gente pide al
--             asistente y la capa semántica no puede dar (fuera del catálogo,
--             dato más reciente que la última carga, desglose no admitido,
--             fuera de autorización). Solo la ve el administrador de la
--             organización; sirve para decidir qué agregar al catálogo o qué
--             carga adelantar. NO cambia lo que el agente puede responder.
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.consultas_guardadas (+ en_tablero, tablero_orden, tablero_ancho)
--             portal.solicitudes_no_atendidas (nueva)
-- Impacto   : bajo; columnas con default y una tabla nueva.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/137_tablero_personal_y_demanda_tenant_down.sql
-- Ref       : CLAUDE.md §11 (el tablero reejecuta tools tipadas bajo el alcance
--             de quien lo abre; la bitácora es metadato, no dato).
-- =====================================================================

ALTER TABLE portal.consultas_guardadas
  ADD COLUMN IF NOT EXISTS en_tablero    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tablero_orden integer,
  ADD COLUMN IF NOT EXISTS tablero_ancho smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_consultas_guardadas_tablero_ancho'
  ) THEN
    ALTER TABLE portal.consultas_guardadas
      ADD CONSTRAINT ck_consultas_guardadas_tablero_ancho CHECK (tablero_ancho IN (1, 2));
  END IF;
END $$;

COMMENT ON COLUMN portal.consultas_guardadas.en_tablero IS
  'true = la consulta aparece como widget en «Mi tablero» del usuario.';
COMMENT ON COLUMN portal.consultas_guardadas.tablero_orden IS
  'Posición en el tablero personal (menor = primero). NULL se ordena al final.';
COMMENT ON COLUMN portal.consultas_guardadas.tablero_ancho IS
  'Ancho del widget en columnas de la grilla (1 = media fila, 2 = fila completa).';

CREATE INDEX IF NOT EXISTS ix_consultas_guardadas_tablero
  ON portal.consultas_guardadas (usuario_id, tablero_orden)
  WHERE en_tablero;

CREATE TABLE IF NOT EXISTS portal.solicitudes_no_atendidas (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id       bigint REFERENCES portal.usuarios (id) ON DELETE SET NULL,
  conversacion_id  bigint REFERENCES portal.chat_conversaciones (id) ON DELETE SET NULL,
  -- Clasificación cerrada (coincide con el enum de la tool registrar_solicitud del agente).
  tipo             text NOT NULL CHECK (tipo IN ('fuera_catalogo', 'frescura', 'sin_autorizacion', 'desglose_no_admitido', 'otro')),
  -- Qué pidió la persona (su mensaje) y cómo lo resumió el asistente o el código.
  pregunta         text NOT NULL CHECK (length(pregunta) <= 4000),
  resumen          text NOT NULL CHECK (length(resumen) BETWEEN 1 AND 300),
  metrica_clave    text,
  dominio          text,
  -- 'tool' = el modelo la registró a propósito; 'denegacion' = la dedujo el código de una tool denegada.
  origen           text NOT NULL DEFAULT 'tool' CHECK (origen IN ('tool', 'denegacion')),
  -- Seguimiento del administrador.
  estado           text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'en_revision', 'atendida', 'descartada')),
  nota_admin       text CHECK (length(nota_admin) <= 1000),
  creada_en        timestamptz NOT NULL DEFAULT now(),
  actualizada_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_solicitudes_no_atendidas_estado
  ON portal.solicitudes_no_atendidas (estado, creada_en DESC);
CREATE INDEX IF NOT EXISTS ix_solicitudes_no_atendidas_tipo
  ON portal.solicitudes_no_atendidas (tipo, creada_en DESC);

COMMENT ON TABLE portal.solicitudes_no_atendidas IS
  'Demanda que el asistente no pudo atender con la capa semántica. Solo administración; no altera el alcance del agente.';

-- Permisos del rol de aplicación (si existe): la 133 fijó default privileges, pero una
-- tabla creada por otro rol (migración manual) no los hereda; se repite explícito.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON portal.solicitudes_no_atendidas TO portal_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA portal TO portal_app;
  END IF;
END $$;
