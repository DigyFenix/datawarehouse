/** Tipos compartidos de autenticación del portal de usuario. */

/** Payload del JWT del portal de usuario (secreto propio, distinto del admin). */
export interface PayloadPortal {
  sub: number;
  email: string;
  /** hash_tenant de la organización: un token jamás opera sobre otro tenant. */
  org: string;
  esAdmin: boolean;
}

/** Usuario autenticado adjunto al request (estado FRESCO leído de la BD del tenant). */
export interface UsuarioPortal {
  id: number;
  email: string;
  nombre: string;
  esAdmin: boolean;
  debeCambiarPassword: boolean;
  /** hash_tenant validado contra la URL. */
  hash: string;
}
