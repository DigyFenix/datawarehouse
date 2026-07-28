-- =====================================================================
-- Rollback de 99_renombrar_esquemas_espanol.sql
-- Devuelve los nombres de esquema al inglés:
--   bronce → bronze · plata → silver · oro → gold · metadatos → metadata
-- Impacto   : requiere revertir TAMBIÉN el código (Drizzle, NestJS, macros dbt,
--             worker Python) en el mismo despliegue. No revertir solo la BD.
-- No destructivo: ALTER SCHEMA RENAME preserva tablas y datos.
-- =====================================================================

-- Columnas: tabla_oro → tabla_gold (antes de renombrar el esquema)
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'metadatos' and table_name = 'catalogo_hechos'
                and column_name = 'tabla_oro') then
    execute 'alter table metadatos.catalogo_hechos rename column tabla_oro to tabla_gold';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'metadatos' and table_name = 'catalogo_dimensiones'
                and column_name = 'tabla_oro') then
    execute 'alter table metadatos.catalogo_dimensiones rename column tabla_oro to tabla_gold';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'bronce')
     and not exists (select 1 from information_schema.schemata where schema_name = 'bronze') then
    execute 'alter schema bronce rename to bronze';
  end if;

  if exists (select 1 from information_schema.schemata where schema_name = 'plata')
     and not exists (select 1 from information_schema.schemata where schema_name = 'silver') then
    execute 'alter schema plata rename to silver';
  end if;

  if exists (select 1 from information_schema.schemata where schema_name = 'oro')
     and not exists (select 1 from information_schema.schemata where schema_name = 'gold') then
    execute 'alter schema oro rename to gold';
  end if;

  if exists (select 1 from information_schema.schemata where schema_name = 'metadatos')
     and not exists (select 1 from information_schema.schemata where schema_name = 'metadata') then
    execute 'alter schema metadatos rename to metadata';
  end if;
end $$;
