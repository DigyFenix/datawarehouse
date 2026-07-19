/** Glosario de negocio (§7): traduce el vocabulario al canónico. Cambios auditados (§12). */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { glosarioNegocio } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarTerminoDto, CrearTerminoDto } from './glosario.dto';

@Injectable()
export class GlosarioService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  listar() {
    return this.db.select().from(glosarioNegocio);
  }

  async crear(dto: CrearTerminoDto, actor: Actor) {
    const [existe] = await this.db
      .select({ id: glosarioNegocio.id })
      .from(glosarioNegocio)
      .where(eq(glosarioNegocio.termino, dto.termino));
    if (existe) throw new ConflictException('Ya existe un término con ese nombre');

    const [creado] = await this.db.insert(glosarioNegocio).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear',
      entidad: 'glosario_negocio',
      entidadId: String(creado.id),
      despues: creado,
    });
    return creado;
  }

  async actualizar(id: number, dto: ActualizarTerminoDto, actor: Actor) {
    const [antes] = await this.db.select().from(glosarioNegocio).where(eq(glosarioNegocio.id, id));
    if (!antes) throw new NotFoundException(`Término ${id} no encontrado`);
    const [act] = await this.db
      .update(glosarioNegocio)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(glosarioNegocio.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'actualizar',
      entidad: 'glosario_negocio',
      entidadId: String(id),
      antes,
      despues: act,
    });
    return act;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(glosarioNegocio).where(eq(glosarioNegocio.id, id));
    if (!antes) throw new NotFoundException(`Término ${id} no encontrado`);
    await this.db.delete(glosarioNegocio).where(eq(glosarioNegocio.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'eliminar',
      entidad: 'glosario_negocio',
      entidadId: String(id),
      antes,
    });
  }
}
