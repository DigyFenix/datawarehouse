/** Contrato de respuesta de la API y modelos del dominio de administración. */
export interface Respuesta<T> {
  success: boolean;
  data: T | null;
  error: { codigo: string; mensaje: string; detalles?: unknown } | null;
}

export interface Organizacion {
  id: number;
  codigo: string;
  nombre: string;
  sector: string | null;
  erpTipo: string;
  estado: string;
  secretoConexionRef: string | null;
  colorMarca: string | null;
  baseDatosDw: string | null;
  // Identificador opaco de la URL de ingreso del portal de usuario del tenant.
  hashTenant: string;
  logoMime: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Tablero del portal de usuario (URL de Publish to Web, alta del proveedor). */
export interface TableroPortal {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  urlPublica: string;
  orden: number;
  activo: boolean;
}

/** Estado del portal de usuario en la base del tenant. */
export interface EstadoPortalOrg {
  baseDatos: string;
  esquemaAplicado: boolean;
  adminExiste: boolean;
  usuarios: number;
  tableros: number;
}

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Rol {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
}

export interface RolDeUsuario {
  rolId: number;
  clave: string;
  nombre: string;
  organizacionId: number | null;
}

export interface EntradaAuditoria {
  id: number;
  ocurridoEn: string;
  usuarioEmail: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  ip: string | null;
}

export interface SesionUsuario {
  id: number;
  email: string;
  nombre: string;
}

export interface TerminoGlosario {
  id: number;
  termino: string;
  definicion: string;
  equivaleA: string | null;
  dominio: string | null;
}

export interface Hecho {
  clave: string;
  nombreNegocio: string;
  dominio: string;
}

export interface Metrica {
  id: number;
  clave: string;
  nombreOficial: string;
  definicionNegocio: string;
  formula: string | null;
  hechoOrigen: string;
  owner: string;
  estado: string;
  aprobadores: string[];
  versionDefinicion: number;
}

export interface AprobacionMetrica {
  id: number;
  aprobador: string;
  aprobado: boolean | null;
  comentario: string | null;
}

export interface VersionMetrica {
  id: number;
  version: number;
  formula: string;
  definicionNegocio: string;
  estado: string;
  aprobaciones: AprobacionMetrica[];
}

export interface MetricaDetalle extends Metrica {
  versiones: VersionMetrica[];
}

export interface PoliticaIngesta {
  id: number;
  organizacionId: number;
  objeto: string;
  nombreNegocio: string;
  dominio: string;
  tipoObjeto: 'hecho' | 'maestro';
  estrategia: 'incremental_ventana' | 'abiertos' | 'full_replace' | 'versionado';
  fuenteObjeto: string;
  campoFecha: string | null;
  lookbackValor: number | null;
  lookbackUnidad: 'dias' | 'meses' | null;
  claveNatural: string;
  columnasVersionado: string[];
  modelosDbt: string | null;
  activo: boolean;
  owner: string;
  version: number;
}

export interface PlanIngesta {
  id: number;
  organizacionId: number;
  nombre: string;
  descripcion: string | null;
  cron: string;
  empresas: string[];
  objetos: string[];
  encadenaTransformacion: boolean;
  activo: boolean;
}

export interface Dominio {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Entorno {
  id: number;
  clave: string;
  nombre: string;
  erp: string;
  motor: string;
  driver: string;
  puertoDefault: number | null;
  activo: boolean;
}

export interface Conexion {
  id: number;
  nombre: string;
  entornoClave: string;
  host: string;
  puerto: number;
  baseDatos: string | null;
  secretoRef: string;
  activo: boolean;
  notas: string | null;
}

export interface Sociedad {
  id: number;
  organizacionId: number;
  empresaId: string;
  nombre: string;
  nit: string | null;
  moneda: string | null;
  monedaPresentacion: string | null;
  conexionId: number | null;
  esquemaOrigen: string | null;
  activo: boolean;
  orden: number;
}

// NIT de compañía afiliada (intercompañía). nitNormalizado lo calcula la BD:
// mayúsculas y solo [0-9K]; es la forma con la que Oro marca es_intercompania.
export interface NitAfiliado {
  id: number;
  organizacionId: number;
  nit: string;
  nitNormalizado: string;
  nombre: string | null;
  activo: boolean;
}

export interface CampoIngesta {
  id: number;
  organizacionId: number;
  objeto: string;
  tablaOrigen: string;
  campoOrigen: string;
  esUdf: boolean;
  tipoOrigen: string | null;
  descripcion: string | null;
  canonicoEntidad: string | null;
  campoCanonico: string | null;
  transformacion: string;
  sugerido: boolean;
  incluido: boolean;
  tieneDatos: boolean | null;
  origen: string;
}

export interface CanonicoEntidad {
  id: number;
  clave: string;
  nombre: string;
  dominio: string;
  tipo: string;
  descripcion: string | null;
  activo: boolean;
}

export interface CanonicoCampo {
  id: number;
  entidadClave: string;
  nombre: string;
  tipo: string;
  requerido: boolean;
  descripcion: string | null;
  orden: number;
  activo: boolean;
}
