/**
 * Sesión del portal admin: relee el usuario y sus roles de la BD en CADA request.
 *
 * El JWT solo prueba identidad ({sub, email}); la autorización se resuelve fresca:
 * desactivar un usuario o quitarle un rol surte efecto en el siguiente request, sin
 * esperar a que expire el token (mismo patrón que el portal de usuario).
 */
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DB, DRIZZLE } from '../db/drizzle.module';
import { roles, usuarioRoles, usuarios } from '../db/schema';

export interface RolAsignado {
  clave: string;
  /** NULL = alcance global (todas las organizaciones). */
  organizacionId: number | null;
}

export interface SesionVigente {
  id: number;
  email: string;
  nombre: string;
  roles: RolAsignado[];
  /** true si tiene `admin_portal` con alcance global (operador del producto). */
  esGlobal: boolean;
  /** Organizaciones donde tiene alguna asignación (sin duplicados). */
  orgIds: number[];
}

@Injectable()
export class SesionService {
  constructor(@Inject(DRIZZLE) private readonly db: DB) {}

  /** Usuario ACTIVO con sus roles frescos, o null si no existe / está inactivo. */
  async usuarioVigente(id: number): Promise<SesionVigente | null> {
    const [usuario] = await this.db.select().from(usuarios).where(eq(usuarios.id, id));
    if (!usuario || !usuario.activo) return null;

    const asignaciones = await this.db
      .select({ clave: roles.clave, organizacionId: usuarioRoles.organizacionId })
      .from(usuarioRoles)
      .innerJoin(roles, eq(roles.id, usuarioRoles.rolId))
      .where(eq(usuarioRoles.usuarioId, id));

    const esGlobal = asignaciones.some(
      (a) => a.clave === 'admin_portal' && a.organizacionId === null,
    );
    const orgIds = [
      ...new Set(
        asignaciones
          .map((a) => a.organizacionId)
          .filter((o): o is number => o !== null),
      ),
    ];

    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      roles: asignaciones,
      esGlobal,
      orgIds,
    };
  }
}
