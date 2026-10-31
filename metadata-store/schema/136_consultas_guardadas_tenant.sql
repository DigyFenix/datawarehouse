-- =====================================================================
-- Propósito : Consultas GUARDADAS del asistente de IA. El usuario marca una
--             respuesta (tabla, ranking o aging) como «guardar» y la reabre
--             otro día: se persiste la ESPECIFICACIÓN (tool + parámetros
--             validados), nunca el resultado. Al abrirla se vuelve a ejecutar
--             con datos frescos, bajo las guardas y el alcance de quien la abre.
--             Además, cada respuesta del asistente guarda sus conjuntos de datos
--             (`datos`) para re-renderizar tablas/gráficas sin volver a consultar.
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.consultas_guardadas (nueva) · portal.chat_mensajes (+ datos)
-- Impacto   : bajo; tabla nueva y una columna jsonb NULL.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/136_consultas_guardadas_tenant_down.sql
-- Ref       : CLAUDE.md §11 (sin SQL libre: lo guardado son parámetros de una
--             tool tipada; la reejecución pasa por Zod, catálogo, alcance y RLS)
-- =====================================================================

ALTER TABLE portal.chat_mensajes
  ADD COLUMN IF NOT EXISTS datos jsonb;

COMMENT ON COLUMN portal.chat_mensajes.datos IS
  'Conjuntos de datos y consultas ejecutadas de la respuesta ({conjuntos, consultas}). '
  'Permite pintar tablas/gráficas y ofrecer «guardar» sin reconsultar.';

CREATE TABLE IF NOT EXISTS portal.consultas_guardadas (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id          bigint NOT NULL REFERENCES portal.usuarios (id) ON DELETE CASCADE,
  titulo              text   NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120),
  descripcion         text,
  -- Herramienta tipada del agente y sus parámetros YA validados (jsonb). Nunca SQL.
  tool                text   NOT NULL CHECK (tool IN ('consultar_metrica', 'consultar_aging', 'consultar_metrica_por_dimension')),
  params              jsonb  NOT NULL DEFAULT '{}'::jsonb,
  -- Cómo prefiere verla el usuario; el dato es el mismo.
  vista               text   NOT NULL DEFAULT 'tabla' CHECK (vista IN ('tabla', 'barras', 'lineas')),
  -- Trazabilidad de gobierno: con qué métrica y versión de definición se guardó.
  metrica_clave       text,
  version_definicion  integer,
  creada_en           timestamptz NOT NULL DEFAULT now(),
  actualizada_en      timestamptz NOT NULL DEFAULT now(),
  ultima_ejecucion_en timestamptz
);

CREATE INDEX IF NOT EXISTS ix_consultas_guardadas_usuario
  ON portal.consultas_guardadas (usuario_id, actualizada_en DESC);

COMMENT ON TABLE portal.consultas_guardadas IS
  'Consultas del asistente guardadas por usuario: especificación reejecutable (tool + params), no resultados.';
