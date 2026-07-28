-- =====================================================================
-- Propósito : Plan de ingesta — el "cuándo". Agrupa objetos en una corrida
--             encadenada (extracción → Bronze → dbt run+test → Gold) con un
--             único horario. Simplicidad: un cron por corrida, no por objeto.
-- Tablas    : metadatos.plan_ingesta
-- Impacto   : bajo; tabla de configuración (no de negocio).
-- Rollback  : metadata-store/rollback/91_plan_ingesta_down.sql
-- Ref       : CLAUDE.md §4 (planos), §5 (orquestación)
-- =====================================================================

CREATE TABLE IF NOT EXISTS metadatos.plan_ingesta (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre                   text        NOT NULL UNIQUE,   -- 'order-to-cash'
  descripcion              text,
  cron                     text        NOT NULL,          -- horario único de la corrida (formato cron)
  -- Sociedades para las que corre (empresa_id canónico, ver empresas.md). El
  -- worker itera cada empresa y las extrae con la misma política por objeto.
  empresas                 text[]      NOT NULL,          -- {'proavisa','loreto'}
  -- Objetos incluidos (valores de politica_ingesta.objeto). Array por simplicidad;
  -- la integridad se valida en el worker/portal, no con FK sobre elementos.
  objetos                  text[]      NOT NULL,
  -- Al terminar Bronze, encadena la transformación (dbt) hasta Gold en la misma corrida.
  encadena_transformacion  boolean     NOT NULL DEFAULT true,
  activo                   boolean     NOT NULL DEFAULT true,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_plan_empresas_no_vacio CHECK (cardinality(empresas) > 0),
  CONSTRAINT ck_plan_objetos_no_vacio  CHECK (cardinality(objetos)  > 0)
);

COMMENT ON TABLE metadatos.plan_ingesta IS
  'Plan/corrida de ingesta (el cuándo). Un cron por corrida agrupa objetos y sociedades; al terminar Bronze encadena la transformación a Gold (§5).';
COMMENT ON COLUMN metadatos.plan_ingesta.empresas IS
  'empresa_id canónicos (no el schema HANA). El worker conecta a cada BD de sociedad y etiqueta Bronze con este empresa_id.';
COMMENT ON COLUMN metadatos.plan_ingesta.encadena_transformacion IS
  'true = la corrida ejecuta extracción→Bronze y a continuación dbt run+test hasta Gold, en una sola ejecución (sin horarios pares/impares).';
