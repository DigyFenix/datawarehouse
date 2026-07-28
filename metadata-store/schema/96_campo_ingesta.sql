-- =====================================================================
-- Propósito : Registro de campos por entidad (columna de origen → canónico).
--             Poblado por el diccionario base (sembrado) y enriquecido por la
--             introspección real (nativos + UDFs). El portal permite elegir
--             qué campos incluir y su mapeo/transformación.
-- Tablas    : metadatos.campo_ingesta
-- Impacto   : bajo; metadato de ingesta.
-- Rollback  : metadata-store/rollback/96_campo_ingesta_down.sql
-- Ref       : CLAUDE.md §6 (Silver costura), §7; diseño ingesta auto-descriptiva
-- =====================================================================

CREATE TABLE IF NOT EXISTS metadatos.campo_ingesta (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objeto         text        NOT NULL,          -- entidad (politica_ingesta.objeto): 'clientes', 'ventas_facturas'
  tabla_origen   text        NOT NULL,          -- tabla nativa de origen: 'OCRD', 'OINV', 'INV1'
  campo_origen   text        NOT NULL,          -- columna en el origen: 'CardCode', 'U_Region'
  es_udf         boolean     NOT NULL DEFAULT false,   -- campo de usuario SAP (prefijo U_)
  tipo_origen    text,                          -- tipo de dato en el origen (de SYS/CUFD)
  descripcion    text,                          -- descripción en español (para el usuario)
  canonico_entidad text,                        -- entidad canónica destino (FK lógica a canonico_entidad.clave)
  campo_canonico text,                          -- campo canónico destino (null = extra, disponible en Bronze)
  transformacion text        NOT NULL DEFAULT 'directo', -- directo|booleano_yn|signo_nc|cast_fecha|cast_numeric|region
  sugerido       boolean     NOT NULL DEFAULT false,    -- el motor lo recomienda por default
  incluido       boolean     NOT NULL DEFAULT false,    -- el usuario decide traerlo
  -- Filtro de fila (regla en Silver): p.ej. CardType = 'C'. filtro_op ∈ (=,<>,>=,<=)
  filtro_op      text,
  filtro_valor   text,
  tiene_datos    boolean,                       -- perfilado: la columna tiene valores no nulos (introspección)
  origen         text        NOT NULL DEFAULT 'diccionario', -- diccionario|introspeccion|manual
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_campo UNIQUE (objeto, tabla_origen, campo_origen),
  CONSTRAINT ck_campo_transformacion
    CHECK (transformacion IN ('directo', 'booleano_yn', 'signo_nc', 'cast_fecha', 'cast_numeric', 'region'))
);

COMMENT ON TABLE metadatos.campo_ingesta IS
  'Campos por entidad: columna de origen (nativa o UDF) → canónico. Sembrado por diccionario, enriquecido por introspección; el usuario elige incluidos.';
COMMENT ON COLUMN metadatos.campo_ingesta.transformacion IS
  'Transformación semántica (set del motor): directo | booleano_yn (Y/N→bool) | signo_nc (NC negativo) | cast_fecha | cast_numeric | region.';
COMMENT ON COLUMN metadatos.campo_ingesta.tiene_datos IS
  'Resultado del perfilado en introspección: true si la columna tiene valores no nulos en el origen (ayuda a sugerir).';
