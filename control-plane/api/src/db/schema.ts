/**
 * Definición Drizzle de las tablas de administración (esquema `gobierno`).
 * Refleja el DDL versionado en metadata-store/schema/60-80. La FUENTE DE VERDAD
 * del schema es ese DDL SQL (versionado + rollback); aquí solo se declara para
 * tipado y queries. No usar drizzle-kit para migrar: el schema lo gobierna el DDL.
 */
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const gobierno = pgSchema('gobierno');
export const metadata = pgSchema('metadata');

export const organizaciones = gobierno.table('organizaciones', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  codigo: text('codigo').notNull().unique(),
  nombre: text('nombre').notNull(),
  sector: text('sector'),
  erpTipo: text('erp_tipo').notNull().default('sap_b1'),
  estado: text('estado').notNull().default('en_arranque'),
  secretoConexionRef: text('secreto_conexion_ref'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const usuarios = gobierno.table('usuarios', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull(),
  hashPassword: text('hash_password').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = gobierno.table('roles', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
});

export const usuarioRoles = gobierno.table(
  'usuario_roles',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: bigint('usuario_id', { mode: 'number' }).notNull(),
    rolId: bigint('rol_id', { mode: 'number' }).notNull(),
    organizacionId: bigint('organizacion_id', { mode: 'number' }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.usuarioId, t.rolId, t.organizacionId)],
);

export const autorizaciones = gobierno.table(
  'autorizaciones',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    rolId: bigint('rol_id', { mode: 'number' }).notNull(),
    recursoTipo: text('recurso_tipo').notNull(),
    recursoClave: text('recurso_clave').notNull(),
    permiso: text('permiso').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.rolId, t.recursoTipo, t.recursoClave, t.permiso)],
);

export const auditoria = gobierno.table('auditoria', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull().defaultNow(),
  usuarioId: bigint('usuario_id', { mode: 'number' }),
  usuarioEmail: text('usuario_email'),
  accion: text('accion').notNull(),
  entidad: text('entidad').notNull(),
  entidadId: text('entidad_id'),
  antes: jsonb('antes'),
  despues: jsonb('despues'),
  ip: text('ip'),
});

// ---------------------------------------------------------------------------
// Catálogo de metadatos (esquema `metadata`). El estado se maneja como text;
// el tipo enum estado_metrica lo valida la BD (DDL 10_tipos.sql).
// ---------------------------------------------------------------------------

export const catalogoHechos = metadata.table('catalogo_hechos', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombreNegocio: text('nombre_negocio').notNull(),
  grano: text('grano').notNull(),
  dominio: text('dominio').notNull(),
  descripcion: text('descripcion'),
  tablaGold: text('tabla_gold'),
});

export const glosarioNegocio = metadata.table('glosario_negocio', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  termino: text('termino').notNull().unique(),
  definicion: text('definicion').notNull(),
  equivaleA: text('equivale_a'),
  dominio: text('dominio'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogoMetricas = metadata.table('catalogo_metricas', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombreOficial: text('nombre_oficial').notNull(),
  definicionNegocio: text('definicion_negocio').notNull(),
  formula: text('formula'),
  hechoOrigen: text('hecho_origen').notNull(),
  filtros: jsonb('filtros').notNull().default({}),
  periodicidad: text('periodicidad'),
  owner: text('owner').notNull(),
  estado: text('estado').notNull().default('borrador'),
  rolesAutorizados: text('roles_autorizados').array().notNull().default([]),
  aprobadores: text('aprobadores').array().notNull().default([]),
  versionDefinicion: integer('version_definicion').notNull().default(1),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const metricaVersiones = metadata.table(
  'metrica_versiones',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    metricaId: bigint('metrica_id', { mode: 'number' }).notNull(),
    version: integer('version').notNull(),
    formula: text('formula').notNull(),
    definicionNegocio: text('definicion_negocio').notNull(),
    estado: text('estado').notNull().default('en_revision'),
    fechaCertificacion: timestamp('fecha_certificacion', { withTimezone: true }),
    certificadaPor: text('certificada_por'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    creadoPor: text('creado_por').notNull(),
    notas: text('notas'),
  },
  (t) => [unique().on(t.metricaId, t.version)],
);

export const metricaAprobaciones = metadata.table(
  'metrica_aprobaciones',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    metricaVersionId: bigint('metrica_version_id', { mode: 'number' }).notNull(),
    aprobador: text('aprobador').notNull(),
    aprobado: boolean('aprobado'),
    fecha: timestamp('fecha', { withTimezone: true }),
    comentario: text('comentario'),
  },
  (t) => [unique().on(t.metricaVersionId, t.aprobador)],
);

export const schema = {
  organizaciones,
  usuarios,
  roles,
  usuarioRoles,
  autorizaciones,
  auditoria,
  catalogoHechos,
  glosarioNegocio,
  catalogoMetricas,
  metricaVersiones,
  metricaAprobaciones,
};
