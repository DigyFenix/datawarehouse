/**
 * Definición Drizzle de las tablas de administración (esquema `gobierno`).
 * Refleja el DDL versionado en metadata-store/schema/60-80. La FUENTE DE VERDAD
 * del schema es ese DDL SQL (versionado + rollback); aquí solo se declara para
 * tipado y queries. No usar drizzle-kit para migrar: el schema lo gobierna el DDL.
 */
import { sql } from 'drizzle-orm';
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
export const metadatos = pgSchema('metadatos');

export const organizaciones = gobierno.table('organizaciones', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  codigo: text('codigo').notNull().unique(),
  nombre: text('nombre').notNull(),
  sector: text('sector'),
  erpTipo: text('erp_tipo').notNull().default('sap_b1'),
  estado: text('estado').notNull().default('en_arranque'),
  secretoConexionRef: text('secreto_conexion_ref'),
  colorMarca: text('color_marca'),
  // Base de datos del PLANO DE DATOS del tenant (dw_<codigo>). El worker la exige para
  // extraer y transformar; sin ella la organización queda inextraíble (migración 100).
  baseDatosDw: text('base_datos_dw'),
  // Identificador opaco del tenant en la URL del portal de usuario (migración 111).
  hashTenant: text('hash_tenant').notNull().unique(),
  // El binario del logo NO se mapea aquí: los select() lo arrastrarían en cada listado.
  // Se lee/escribe con SQL directo (PG_POOL); logo_mime indica presencia y tipo.
  logoMime: text('logo_mime'),
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
// Catálogo de metadatos (esquema `metadatos`). El estado se maneja como text;
// el tipo enum estado_metrica lo valida la BD (DDL 10_tipos.sql).
// ---------------------------------------------------------------------------

export const catalogoHechos = metadatos.table('catalogo_hechos', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombreNegocio: text('nombre_negocio').notNull(),
  grano: text('grano').notNull(),
  dominio: text('dominio').notNull(),
  descripcion: text('descripcion'),
  tablaOro: text('tabla_oro'),
});

export const glosarioNegocio = metadatos.table('glosario_negocio', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  termino: text('termino').notNull().unique(),
  definicion: text('definicion').notNull(),
  equivaleA: text('equivale_a'),
  dominio: text('dominio'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogoMetricas = metadatos.table('catalogo_metricas', {
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

export const metricaVersiones = metadatos.table(
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

export const metricaAprobaciones = metadatos.table(
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

// ---------------------------------------------------------------------------
// Ingesta gobernada (esquema `metadatos`). Refleja el DDL 90/91. El portal
// escribe; el worker/extractor del plano de datos lee (§4). Los CHECK y la
// coherencia los gobierna la BD (DDL); aquí solo se declara para tipado/queries.
// ---------------------------------------------------------------------------

// La configuración de ingesta es propia de cada organización (migración 102): el mismo
// objeto canónico sale de OITM en SAP B1 y de product_product en Odoo. La unicidad es
// compuesta (organización, objeto) — nunca global por objeto.
export const politicaIngesta = metadatos.table(
  'politica_ingesta',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizacionId: bigint('organizacion_id', { mode: 'number' }).notNull(),
    objeto: text('objeto').notNull(),
    nombreNegocio: text('nombre_negocio').notNull(),
    dominio: text('dominio').notNull(),
    tipoObjeto: text('tipo_objeto').notNull(), // hecho | maestro
    estrategia: text('estrategia').notNull(), // incremental_ventana | abiertos | full_replace | versionado
    fuenteObjeto: text('fuente_objeto').notNull(),
    campoFecha: text('campo_fecha'),
    lookbackValor: integer('lookback_valor'),
    lookbackUnidad: text('lookback_unidad'), // dias | meses
    claveNatural: text('clave_natural').notNull(),
    columnasVersionado: text('columnas_versionado').array().notNull().default([]),
    modelosDbt: text('modelos_dbt'), // selección dbt --select para transformar el objeto (Bronze→Gold)
    filtroOrigen: text('filtro_origen'), // filtro WHERE aplicado en origen (migración 103)
    activo: boolean('activo').notNull().default(true),
    owner: text('owner').notNull(),
    version: integer('version').notNull().default(1),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_politica_org_objeto').on(t.organizacionId, t.objeto)],
);

export const entornosEjecucion = metadatos.table('entornos_ejecucion', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombre: text('nombre').notNull(),
  erp: text('erp').notNull(),
  motor: text('motor').notNull(),
  driver: text('driver').notNull(),
  puertoDefault: integer('puerto_default'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const conexiones = gobierno.table('conexiones', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  nombre: text('nombre').notNull().unique(),
  entornoClave: text('entorno_clave').notNull(),
  host: text('host').notNull(),
  puerto: integer('puerto').notNull(),
  baseDatos: text('base_datos'),
  secretoRef: text('secreto_ref').notNull(),
  activo: boolean('activo').notNull().default(true),
  notas: text('notas'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const sociedades = gobierno.table('sociedades', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizacionId: bigint('organizacion_id', { mode: 'number' }).notNull(),
  empresaId: text('empresa_id').notNull().unique(),
  nombre: text('nombre').notNull(),
  nit: text('nit'),
  // Moneda local de la sociedad (ISO 4217; migración 113). NULL = default de la organización.
  moneda: text('moneda'),
  // A qué moneda consolidan sus cifras (migración 114). Igual a moneda = sin conversión;
  // distinta = convertir con la serie de tipo de cambio de la PROPIA sociedad.
  monedaPresentacion: text('moneda_presentacion'),
  conexionId: bigint('conexion_id', { mode: 'number' }),
  esquemaOrigen: text('esquema_origen'),
  activo: boolean('activo').notNull().default(true),
  orden: integer('orden').notNull().default(0),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

// NIT de compañías afiliadas por organización (migración 112). El portal administra;
// el worker los pasa a dbt como var `nits_grupo` y Oro marca es_intercompania.
// `nit_normalizado` es columna GENERADA en la BD (upper + solo [0-9K]): se lee, nunca
// se escribe — la normalización tiene una sola definición y vive en el DDL.
export const nitsAfiliados = gobierno.table(
  'nits_afiliados',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizacionId: bigint('organizacion_id', { mode: 'number' }).notNull(),
    nit: text('nit').notNull(),
    nitNormalizado: text('nit_normalizado')
      .notNull()
      .generatedAlwaysAs(sql`regexp_replace(upper(nit), '[^0-9K]', '', 'g')`),
    nombre: text('nombre'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_nits_afiliados_org_nit').on(t.organizacionId, t.nitNormalizado)],
);

export const campoIngesta = metadatos.table(
  'campo_ingesta',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizacionId: bigint('organizacion_id', { mode: 'number' }).notNull(),
    objeto: text('objeto').notNull(),
    tablaOrigen: text('tabla_origen').notNull(),
    campoOrigen: text('campo_origen').notNull(),
    esUdf: boolean('es_udf').notNull().default(false),
    tipoOrigen: text('tipo_origen'),
    descripcion: text('descripcion'),
    canonicoEntidad: text('canonico_entidad'),
    campoCanonico: text('campo_canonico'),
    transformacion: text('transformacion').notNull().default('directo'),
    sugerido: boolean('sugerido').notNull().default(false),
    incluido: boolean('incluido').notNull().default(false),
    tieneDatos: boolean('tiene_datos'),
    origen: text('origen').notNull().default('diccionario'),
    filtroOp: text('filtro_op'), // filtro por campo aplicado en origen
    filtroValor: text('filtro_valor'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_campo_org').on(t.organizacionId, t.objeto, t.tablaOrigen, t.campoOrigen)],
);

export const canonicoEntidad = metadatos.table('canonico_entidad', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombre: text('nombre').notNull(),
  dominio: text('dominio').notNull(),
  tipo: text('tipo').notNull(),
  descripcion: text('descripcion'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const canonicoCampo = metadatos.table(
  'canonico_campo',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entidadClave: text('entidad_clave').notNull(),
    nombre: text('nombre').notNull(),
    tipo: text('tipo').notNull(),
    requerido: boolean('requerido').notNull().default(false),
    descripcion: text('descripcion'),
    orden: integer('orden').notNull().default(0),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.entidadClave, t.nombre)],
);

export const catalogoDominios = metadatos.table('catalogo_dominios', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clave: text('clave').notNull().unique(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

// Plan por organización (migración 104): los objetos y sociedades que lista solo
// tienen sentido dentro de su organización.
export const planIngesta = metadatos.table(
  'plan_ingesta',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizacionId: bigint('organizacion_id', { mode: 'number' }).notNull(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    cron: text('cron').notNull(),
    empresas: text('empresas').array().notNull(),
    objetos: text('objetos').array().notNull(),
    encadenaTransformacion: boolean('encadena_transformacion').notNull().default(true),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_plan_org_nombre').on(t.organizacionId, t.nombre)],
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
  politicaIngesta,
  planIngesta,
  catalogoDominios,
  entornosEjecucion,
  conexiones,
  sociedades,
  nitsAfiliados,
  campoIngesta,
  canonicoEntidad,
  canonicoCampo,
};
