/**
 * Conexiones a orígenes + catálogo de entornos de ejecución. El portal (plano de
 * control) las administra; guardan SOLO la referencia al secreto, nunca la credencial (§12).
 * Cambios auditados (§12).
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { conexiones, entornosEjecucion } from '../db/schema';
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

  listar() {
    return this.db.select().from(conexiones).orderBy(conexiones.id);
  }

  async crear(dto: CrearConexionDto, actor: Actor) {
    const [existe] = await this.db
      .select({ id: conexiones.id })
      .from(conexiones)
      .where(eq(conexiones.nombre, dto.nombre));
    if (existe) throw new ConflictException(`Ya existe una conexión con nombre '${dto.nombre}'`);
    const [creado] = await this.db.insert(conexiones).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'crear', entidad: 'conexiones', entidadId: String(creado.id), despues: creado,
    });
    return creado;
  }

  async actualizar(id: number, dto: ActualizarConexionDto, actor: Actor) {
    const [antes] = await this.db.select().from(conexiones).where(eq(conexiones.id, id));
    if (!antes) throw new NotFoundException(`Conexión ${id} no encontrada`);
    const [act] = await this.db
      .update(conexiones)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(conexiones.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'actualizar', entidad: 'conexiones', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(conexiones).where(eq(conexiones.id, id));
    if (!antes) throw new NotFoundException(`Conexión ${id} no encontrada`);
    await this.db.delete(conexiones).where(eq(conexiones.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'eliminar', entidad: 'conexiones', entidadId: String(id), antes,
    });
  }
}
