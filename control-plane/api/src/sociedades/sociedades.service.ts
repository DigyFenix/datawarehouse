/**
 * Sociedades (empresas del grupo). El portal las administra; cada una apunta a una
 * conexión y define su esquema de origen. Cambios auditados (§12). No mueve datos.
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { organizaciones, sociedades } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarSociedadDto, CrearSociedadDto } from './sociedades.dto';

@Injectable()
export class SociedadesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Sociedades de una organización. Sin organización no hay listado: cada tenant ve las suyas. */
  listar(organizacionId: number) {
    return this.db
      .select()
      .from(sociedades)
      .where(eq(sociedades.organizacionId, organizacionId))
      .orderBy(sociedades.orden, sociedades.id);
  }

  async crear(dto: CrearSociedadDto, actor: Actor) {
    const [org] = await this.db
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.id, dto.organizacionId));
    if (!org) throw new NotFoundException(`Organización ${dto.organizacionId} no encontrada`);

    // empresa_id es único global a propósito: es la etiqueta de trazabilidad en Bronce
    // y el worker resuelve la sociedad por ella (ver migración 105).
    const [existe] = await this.db
      .select({ id: sociedades.id })
      .from(sociedades)
      .where(eq(sociedades.empresaId, dto.empresaId));
    if (existe) throw new ConflictException(`Ya existe una sociedad con empresa_id '${dto.empresaId}'`);
    const [creado] = await this.db.insert(sociedades).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'crear', entidad: 'sociedades', entidadId: String(creado.id), despues: creado,
    });
    return creado;
  }

  async actualizar(id: number, dto: ActualizarSociedadDto, actor: Actor) {
    const [antes] = await this.db.select().from(sociedades).where(eq(sociedades.id, id));
    if (!antes) throw new NotFoundException(`Sociedad ${id} no encontrada`);
    const [act] = await this.db
      .update(sociedades)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(sociedades.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'actualizar', entidad: 'sociedades', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(sociedades).where(eq(sociedades.id, id));
    if (!antes) throw new NotFoundException(`Sociedad ${id} no encontrada`);
    await this.db.delete(sociedades).where(eq(sociedades.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'eliminar', entidad: 'sociedades', entidadId: String(id), antes,
    });
  }
}
