/** Lógica de negocio de organizaciones (tenants). Cada mutación queda auditada (§12). */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { organizaciones } from '../db/schema';
import { ActualizarOrganizacionDto, CrearOrganizacionDto } from './organizacion.dto';

/** Actor que ejecuta la acción (viene del token de auth; null hasta que P4 conecte el guard). */
export interface Actor {
  id: number | null;
  email: string | null;
  ip?: string | null;
}

@Injectable()
export class OrganizacionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  listar() {
    return this.db.select().from(organizaciones);
  }

  async obtener(id: number) {
    const [org] = await this.db.select().from(organizaciones).where(eq(organizaciones.id, id));
    if (!org) throw new NotFoundException(`Organización ${id} no encontrada`);
    return org;
  }

  async crear(dto: CrearOrganizacionDto, actor: Actor) {
    // La base del plano de datos es obligatoria para el worker: si no viene, se deriva del
    // código. Crear la BD física y sus esquemas sigue siendo un paso de infraestructura
    // (createdb + schema/101), documentado en el runbook de onboarding.
    const valores = { ...dto, baseDatosDw: dto.baseDatosDw ?? `dw_${dto.codigo}` };
    const [creada] = await this.db.insert(organizaciones).values(valores).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear',
      entidad: 'organizaciones',
      entidadId: String(creada.id),
      antes: null,
      despues: creada,
    });
    return creada;
  }

  async actualizar(id: number, dto: ActualizarOrganizacionDto, actor: Actor) {
    const antes = await this.obtener(id);
    const [actualizada] = await this.db
      .update(organizaciones)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(organizaciones.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'actualizar',
      entidad: 'organizaciones',
      entidadId: String(id),
      antes,
      despues: actualizada,
    });
    return actualizada;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const antes = await this.obtener(id);
    await this.db.delete(organizaciones).where(eq(organizaciones.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'eliminar',
      entidad: 'organizaciones',
      entidadId: String(id),
      antes,
      despues: null,
    });
  }
}
