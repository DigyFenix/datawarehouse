/** Roles y autorizaciones (grants). Control de AUTORIZACIÓN (§12): qué invoca cada rol. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import type { Actor } from '../organizaciones/organizaciones.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { autorizaciones, roles } from '../db/schema';
import { CrearAutorizacionDto } from './acceso.dto';

@Injectable()
export class AccesoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarRoles() {
    return this.db.select().from(roles);
  }

  /**
   * Habilita o retira la capacidad de firmar certificaciones de un rol.
   *
   * Quién puede aprobar dejó de estar clavado en el código: se configura aquí. La
   * guarda impide dejar CERO roles habilitados, porque entonces ninguna métrica
   * podría volver a certificarse y no habría forma de arreglarlo desde el portal.
   *
   * @throws 400 si fuera el último rol aprobador · 404 si el rol no existe
   */
  async definirAprobador(rolId: number, puedeAprobar: boolean, actor: Actor) {
    const [rol] = await this.db.select().from(roles).where(eq(roles.id, rolId));
    if (!rol) throw new NotFoundException(`Rol ${rolId} no encontrado`);

    if (!puedeAprobar) {
      const habilitados = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.puedeAprobar, true));
      if (habilitados.filter((r) => r.id !== rolId).length === 0) {
        throw new BadRequestException(
          'Es el último rol habilitado para aprobar: sin él ninguna métrica podría certificarse.',
        );
      }
    }

    const [actualizado] = await this.db
      .update(roles)
      .set({ puedeAprobar })
      .where(eq(roles.id, rolId))
      .returning();

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'actualizar',
      entidad: 'roles',
      entidadId: String(rolId),
      antes: { puedeAprobar: rol.puedeAprobar },
      despues: { puedeAprobar },
    });
    return actualizado;
  }

  listarAutorizaciones(rolId: number) {
    return this.db.select().from(autorizaciones).where(eq(autorizaciones.rolId, rolId));
  }

  async crearAutorizacion(dto: CrearAutorizacionDto, actor: Actor) {
    const [rol] = await this.db.select().from(roles).where(eq(roles.id, dto.rolId));
    if (!rol) throw new NotFoundException(`Rol ${dto.rolId} no encontrado`);

    const [creada] = await this.db
      .insert(autorizaciones)
      .values(dto)
      .onConflictDoNothing()
      .returning();

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear',
      entidad: 'autorizaciones',
      entidadId: creada ? String(creada.id) : null,
      despues: creada ?? { ...dto, yaExistia: true },
    });
    return creada ?? { ...dto, yaExistia: true };
  }

  async eliminarAutorizacion(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(autorizaciones).where(eq(autorizaciones.id, id));
    if (!antes) throw new NotFoundException(`Autorización ${id} no encontrada`);
    await this.db.delete(autorizaciones).where(eq(autorizaciones.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'eliminar',
      entidad: 'autorizaciones',
      entidadId: String(id),
      antes,
    });
  }
}
