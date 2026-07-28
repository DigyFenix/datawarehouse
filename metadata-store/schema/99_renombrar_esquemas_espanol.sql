-- =====================================================================
-- Propósito : Estandarizar los nombres de esquema a español (sin mezcla).
--             bronze → bronce · silver → plata · gold → oro · metadata → metadatos
--             (`gobierno` y `public` ya están correctos y no se tocan.)
-- Motivo    : decisión A5/A6 del canónico v2 (ver data-plane/canonico/
--             PROPUESTA-canonico-v2.md §1). Se hace ahora porque bronce/plata/oro
--             están vacíos y `metadatos` solo lo consume el portal.
-- Tablas    : ninguna se altera. ALTER SCHEMA RENAME preserva tablas, datos,
--             índices, constraints y dependencias internas.
-- Impacto   : ALTO en código — toda referencia calificada al esquema viejo debe
--             pasar al nuevo en el MISMO despliegue (Drizzle, NestJS, macros dbt,
--             worker Python). Sin eso, el portal deja de arrancar.
-- Idempotente: sí (verifica existencia antes de renombrar).
-- Rollback  : rollback/99_renombrar_esquemas_espanol_down.sql
-- =====================================================================

do $$
begin
  -- Capas medallion (vacías al momento de la migración)
  if exists (select 1 from information_schema.schemata where schema_name = 'bronze')
     and not exists (select 1 from information_schema.schemata where schema_name = 'bronce') then
    execute 'alter schema bronze rename to bronce';
  end if;

  if exists (select 1 from information_schema.schemata where schema_name = 'silver')
     and not exists (select 1 from information_schema.schemata where schema_name = 'plata') then
    execute 'alter schema silver rename to plata';
  end if;

  if exists (select 1 from information_schema.schemata where schema_name = 'gold')
     and not exists (select 1 from information_schema.schemata where schema_name = 'oro') then
    execute 'alter schema gold rename to oro';
  end if;

  -- Metadatos (CON DATOS: catálogo, canónico, ingesta, conexiones)
  if exists (select 1 from information_schema.schemata where schema_name = 'metadata')
     and not exists (select 1 from information_schema.schemata where schema_name = 'metadatos') then
    execute 'alter schema metadata rename to metadatos';
  end if;
end $$;

-- Asegura que existan todos (si la base es nueva, no había nada que renombrar)
create schema if not exists bronce;
create schema if not exists plata;
create schema if not exists oro;
create schema if not exists metadatos;
create schema if not exists gobierno;

-- Columnas con nombre en inglés heredado del esquema anterior: tabla_gold → tabla_oro
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'metadatos' and table_name = 'catalogo_hechos'
                and column_name = 'tabla_gold') then
    execute 'alter table metadatos.catalogo_hechos rename column tabla_gold to tabla_oro';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'metadatos' and table_name = 'catalogo_dimensiones'
                and column_name = 'tabla_gold') then
    execute 'alter table metadatos.catalogo_dimensiones rename column tabla_gold to tabla_oro';
  end if;
end $$;

comment on schema bronce    is 'Crudo por ERP. Bronce es distinto por fuente. Trazabilidad de origen.';
comment on schema plata     is 'Modelo canónico agnóstico + calidad + cuarentena. Costura agnóstica; no se salta.';
comment on schema oro       is 'Estrella (hecho_/dim_) + métricas materializadas. Consumo y semántica.';
comment on schema metadatos is 'Catálogo de metadatos. El portal escribe; el plano de datos lee.';
comment on schema gobierno  is 'Roles, autorizaciones, RLS y auditoría del tenant.';
