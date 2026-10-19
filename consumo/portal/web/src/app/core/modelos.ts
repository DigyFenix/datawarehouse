/** Contrato de respuesta de la API y modelos del portal de usuario. */
export interface Respuesta<T> {
  success: boolean;
  data: T | null;
  error: { codigo: string; mensaje: string; detalles?: unknown } | null;
}

/** Branding público del tenant (pre-login). */
export interface Branding {
  nombre: string;
  colorMarca: string | null;
  tieneLogo: boolean;
  /** Módulo Asistente (IA) contratado; se vende aparte. */
  moduloAsistente: boolean;
}

export interface SesionUsuario {
  id: number;
  email: string;
  nombre: string;
  esAdmin: boolean;
  debeCambiarPassword: boolean;
}

export interface PerfilSesion extends SesionUsuario {
  perfiles: { id: number; clave: string; nombre: string }[];
}

/** Tablero en listado: SIN la URL pública (se pide al abrir el visor). */
export interface TableroResumen {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  orden: number;
  /** Familia (Ventas, Inventario…): agrupa en el inicio y da las pestañas del visor. */
  grupo: string | null;
}

/** Detalle al abrir: la URL de Power BI se queda en el servidor; `visor` es nuestra ruta con pase de un solo uso. */
export interface TableroDetalle extends TableroResumen {
  visor: string;
  /** Mostrar la barra de Power BI (navegación entre páginas; trae el botón «compartir»). */
  mostrarBarra: boolean;
}

export interface UsuarioOrg {
  id: number;
  email: string;
  nombre: string;
  esAdmin: boolean;
  debeCambiarPassword: boolean;
  activo: boolean;
  creadoEn: string;
  perfiles: { id: number; clave: string; nombre: string }[];
}

export interface AlcancePerfil {
  // 'empresa' es RLS del agente (qué filas ve); 'dominio'/'metrica' son autorización (qué invoca).
  recursoTipo: 'dominio' | 'metrica' | 'empresa';
  recursoClave: string;
}

export interface PerfilOrg {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  creadoEn: string;
  tableroIds: number[];
  alcances: AlcancePerfil[];
  usuarios: number;
}

export interface TableroAdmin {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  orden: number;
  activo: boolean;
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
