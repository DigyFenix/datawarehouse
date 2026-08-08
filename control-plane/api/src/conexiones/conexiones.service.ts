/**
 * Conexiones a orígenes + catálogo de entornos de ejecución. El portal (plano de
 * control) las administra; guardan SOLO la referencia al secreto, nunca la credencial (§12).
 * Cambios auditados (§12).
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { exigirAccesoOrg, orgIdsVisibles } from '../common/acceso';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { conexiones, entornosEjecucion, organizaciones } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarConexionDto, CrearConexionDto } from './conexiones.dto';

@Injectable()
export class ConexionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarEntornos() {
    return this.db.select().from(entornosEjecucion).orderBy(entornosEjecucion.nombre);
  }

  /**
   * Conexiones visibles para el actor. Las filas llevan host/puerto/secreto_ref del
   * tenant: sin este filtro, cualquier usuario del portal vería las de TODOS (§12).
   */
  async listar(actor: Actor) {
    const ids = orgIdsVisibles(actor);
    if (ids === null) return this.db.select().from(conexiones).orderBy(conexiones.id);
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(conexiones)
      .where(inArray(conexiones.organizacionId, ids))
      .orderBy(conexiones.id);
  }

  async crear(dto: CrearConexionDto, actor: Actor) {
    const [org] = await this.db
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.id, dto.organizacionId));
    if (!org) throw new NotFoundException(`Organización ${dto.organizacionId} no encontrada`);

    // El nombre es único por organización (migración 116).
    const [existe] = await this.db
      .select({ id: conexiones.id })
      .from(conexiones)
      .where(
        and(eq(conexiones.organizacionId, dto.organizacionId), eq(conexiones.nombre, dto.nombre)),
      );
    if (existe)
      throw new ConflictException(
        `Esta organización ya tiene una conexión con nombre '${dto.nombre}'`,
      );
    const [creado] = await this.db.insert(conexiones).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'crear', entidad: 'conexiones', entidadId: String(creado.id), despues: creado,
    });
    return creado;
  }

  async actualizar(id: number, dto: ActualizarConexionDto, actor: Actor) {
    const [antes] = await this.db.select().from(conexiones).where(eq(conexiones.id, id));
    if (!antes) throw new NotFoundException(`Conexión ${id} no encontrada`);
    exigirAccesoOrg(actor, antes.organizacionId); // IDOR por PK: la fila debe ser de una org del actor
    const [act] = await this.db
      .update(conexiones)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(conexiones.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'actualizar', entidad: 'conexiones', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(conexiones).where(eq(conexiones.id, id));
    if (!antes) throw new NotFoundException(`Conexión ${id} no encontrada`);
    exigirAccesoOrg(actor, antes.organizacionId);
    await this.db.delete(conexiones).where(eq(conexiones.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'eliminar', entidad: 'conexiones', entidadId: String(id), antes,
    });
  }
}
