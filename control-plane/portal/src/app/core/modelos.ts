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
  creadoEn: string;
  actualizadoEn: string;
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
