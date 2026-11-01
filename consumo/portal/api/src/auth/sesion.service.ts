/**
 * Resolución de la sesión por request: organización por hash (base de control)
 * + estado FRESCO del usuario en la base del tenant. Leer de la BD en cada
 * request hace inmediata la revocación (desactivar usuario o quitarle admin).
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';

import { ControlDbService, OrganizacionTenant } from '../db/control-db.service';
import { TenantPoolsService } from '../db/tenant-pools.service';
import { UsuarioPortal } from './tipos';

export interface ContextoTenant {
  organizacion: OrganizacionTenant;
  pool: Pool;
}

interface FilaUsuario {
  id: number;
  email: string;
  nombre: string;
  esAdmin: boolean;
  debeCambiarPassword: boolean;
  activo: boolean;
  /** Segundos epoch (piso) del último cambio de contraseña; null = nunca cambiada. */
  passwordCambiadaEn: number | null;
}

@Injectable()
export class SesionService {
  constructor(
    private readonly controlDb: ControlDbService,
    private readonly tenantPools: TenantPoolsService,
  ) {}

  /** Organización + pool del tenant a partir del hash de la URL. */
  async contexto(hash: string): Promise<ContextoTenant> {
    const organizacion = await this.controlDb.organizacionPorHash(hash);
    return { organizacion, pool: this.tenantPools.obtenerPool(organizacion.baseDatosDw) };
  }

  /**
   * Usuario vigente del tenant (401 si no existe o está inactivo).
   * @param emitidoEn `iat` del JWT (segundos): si es anterior al último cambio de contraseña,
   *                  la sesión se revoca (auditoría M3). Se compara contra el piso en segundos
   *                  para que el token nuevo que se emite al cambiarla siga siendo válido.
   */
  async usuarioVigente(hash: string, usuarioId: number, emitidoEn?: number): Promise<UsuarioPortal> {
    const { pool } = await this.contexto(hash);
    const resultado = await pool.query(
      `SELECT id, email, nombre,
              es_admin              AS "esAdmin",
              debe_cambiar_password AS "debeCambiarPassword",
              activo,
              floor(extract(epoch FROM password_cambiada_en))::float8 AS "passwordCambiadaEn"
         FROM portal.usuarios
        WHERE id = $1`,
      [usuarioId],
    );
    const fila = resultado.rows[0] as FilaUsuario | undefined;
    if (!fila || !fila.activo) {
      throw new UnauthorizedException('Sesión no vigente');
    }
    if (emitidoEn !== undefined && fila.passwordCambiadaEn !== null && emitidoEn < fila.passwordCambiadaEn) {
      throw new UnauthorizedException('La contraseña cambió: vuelve a iniciar sesión');
    }
    return {
      id: fila.id,
      email: fila.email,
      nombre: fila.nombre,
      esAdmin: fila.esAdmin,
      debeCambiarPassword: fila.debeCambiarPassword,
      hash,
    };
  }
}
