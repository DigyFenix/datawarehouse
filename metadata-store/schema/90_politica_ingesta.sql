-- =====================================================================
-- Propósito : Política de ingesta por objeto de origen — el "qué y cómo"
--             extraer. Es un metadato del contrato entre planos: el portal
--             (plano de control) la escribe; el worker/extractor (plano de
--             datos) la lee y actúa. No mueve datos por sí sola.
-- Tablas    : metadatos.politica_ingesta
-- Impacto   : bajo; tabla de configuración (no de negocio).
-- Rollback  : metadata-store/rollback/90_politica_ingesta_down.sql
-- Ref       : CLAUDE.md §4 (planos), §6 (ELT read-only), §12 (gobernanza)
-- =====================================================================

-- Una política por objeto lógico de origen (compartida por las sociedades del
-- tenant; la variación por sociedad se resuelve en el plan de ingesta, §91).
CREATE TABLE IF NOT EXISTS metadatos.politica_ingesta (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objeto             text        NOT NULL UNIQUE,   -- 'ventas_facturas', 'cxc', 'clientes', ...
  nombre_negocio     text        NOT NULL,          -- etiqueta legible en el portal
  dominio            text        NOT NULL,          -- ventas | tesoreria | datos_maestros
  tipo_objeto        text        NOT NULL,          -- hecho | maestro
  estrategia         text        NOT NULL,          -- ver CHECK abajo
  -- Objeto en el origen que expone los datos read-only (table function o vista).
  fuente_objeto      text        NOT NULL,          -- p.ej. 'DW_READONLY.TF_FACTURAS'
  -- Ventana (solo hechos con estrategia incremental_ventana):
  campo_fecha        text,                          -- columna de fecha que filtra (p.ej. 'DocDate')
  lookback_valor     integer,                       -- cuánto hacia atrás
  lookback_unidad    text,                          -- dias | meses
  -- Idempotencia / identidad. Coma-separada para claves compuestas (p.ej. 'DocEntry,LineNum').
  clave_natural      text        NOT NULL,
  -- Solo maestros 'versionado' (SCD2): columnas cuyo cambio dispara nueva versión.
  columnas_versionado text[]     NOT NULL DEFAULT '{}',
  -- Selección dbt que transforma este objeto (Bronze → Silver → Gold). Expresión de
  -- `dbt build --select` (soporta operadores de grafo, p.ej. 'silver_socio_negocio+').
  -- El portal la gobierna; el worker corre `dbt build --select <esto>`. NULL = sin transformación disparable.
  modelos_dbt        text,
  activo             boolean     NOT NULL DEFAULT true,
  owner              text        NOT NULL,          -- rol/persona responsable (§12)
  version            integer     NOT NULL DEFAULT 1,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_politica_tipo_objeto
    CHECK (tipo_objeto IN ('hecho', 'maestro')),
  CONSTRAINT ck_politica_estrategia
    CHECK (estrategia IN ('incremental_ventana', 'abiertos', 'full_replace', 'versionado')),
  CONSTRAINT ck_politica_lookback_unidad
    CHECK (lookback_unidad IS NULL OR lookback_unidad IN ('dias', 'meses')),
  -- Coherencia: la ventana móvil exige campo de fecha + lookback completos.
  CONSTRAINT ck_politica_ventana_completa
    CHECK (estrategia <> 'incremental_ventana'
           OR (campo_fecha IS NOT NULL AND lookback_valor IS NOT NULL AND lookback_unidad IS NOT NULL)),
  -- Coherencia: hechos usan estrategias de hecho; maestros usan estrategias de maestro.
  CONSTRAINT ck_politica_estrategia_por_tipo
    CHECK ((tipo_objeto = 'hecho'   AND estrategia IN ('incremental_ventana', 'abiertos'))
        OR (tipo_objeto = 'maestro' AND estrategia IN ('full_replace', 'versionado')))
);

COMMENT ON TABLE metadatos.politica_ingesta IS
  'Política de ingesta por objeto de origen (el qué/cómo extraer). Contrato entre planos: el portal escribe, el plano de datos lee (§4).';
COMMENT ON COLUMN metadatos.politica_ingesta.estrategia IS
  'hechos: incremental_ventana (delete-insert de la ventana) | abiertos (todos los DocStatus=O, para CxC/Aging). maestros: full_replace (SCD1) | versionado (SCD2).';
COMMENT ON COLUMN metadatos.politica_ingesta.columnas_versionado IS
  'Solo maestros versionado: columnas significativas cuyo cambio abre una nueva versión (SCD2). Un cambio fuera de esta lista no genera versión.';
COMMENT ON COLUMN metadatos.politica_ingesta.fuente_objeto IS
  'Objeto read-only en el origen (table function parametrizada por fecha o vista). Nunca se consultan tablas base del ERP (§14).';
COMMENT ON COLUMN metadatos.politica_ingesta.modelos_dbt IS
  'Selección dbt (--select) que transforma este objeto Bronze→Silver→Gold. Admite operadores de grafo (ej. silver_socio_negocio+). El portal la gobierna; el worker corre dbt build con ella. NULL = sin transformación disparable.';
