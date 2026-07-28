/**
 * Modelo canónico (capa plata) administrable. El portal define las entidades y campos canónicos;
 * el mapeo de ingesta (campo_ingesta.campo_canonico) apunta a estos. Cambios auditados (§12).
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { canonicoCampo, canonicoEntidad } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  ActualizarCampoCanonicoDto,
  CrearCampoCanonicoDto,
  CrearEntidadDto,
} from './canonico.dto';

@Injectable()
export class CanonicoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarEntidades() {
    return this.db.select().from(canonicoEntidad).orderBy(canonicoEntidad.clave);
  }

  /** Campos canónicos; si se pasa `entidad`, solo los de esa entidad. Ordenados por orden. */
  listarCampos(entidad?: string) {
    const q = this.db.select().from(canonicoCampo);
    const base = entidad ? q.where(eq(canonicoCampo.entidadClave, entidad)) : q;
    return base.orderBy(asc(canonicoCampo.entidadClave), asc(canonicoCampo.orden), asc(canonicoCampo.id));
  }

  async crearEntidad(dto: CrearEntidadDto, actor: Actor) {
    const [existe] = await this.db
      .select({ id: canonicoEntidad.id })
      .from(canonicoEntidad)
      .where(eq(canonicoEntidad.clave, dto.clave));
    if (existe) throw new ConflictException(`Ya existe la entidad canónica '${dto.clave}'`);
    const [creado] = await this.db.insert(canonicoEntidad).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'crear', entidad: 'canonico_entidad', entidadId: String(creado.id), despues: creado,
    });
    return creado;
  }

  async crearCampo(dto: CrearCampoCanonicoDto, actor: Actor) {
    const [ent] = await this.db
      .select({ id: canonicoEntidad.id })
      .from(canonicoEntidad)
      .where(eq(canonicoEntidad.clave, dto.entidadClave));
    if (!ent) throw new NotFoundException(`Entidad canónica '${dto.entidadClave}' no existe`);
    // La unicidad (entidad, nombre) la garantiza la BD; un duplicado devuelve 409 vía el filtro.
    const [creado] = await this.db.insert(canonicoCampo).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'crear', entidad: 'canonico_campo', entidadId: String(creado.id), despues: creado,
    });
    return creado;
  }

  async actualizarCampo(id: number, dto: ActualizarCampoCanonicoDto, actor: Actor) {
    const [antes] = await this.db.select().from(canonicoCampo).where(eq(canonicoCampo.id, id));
    if (!antes) throw new NotFoundException(`Campo canónico ${id} no encontrado`);
    const [act] = await this.db
      .update(canonicoCampo)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(canonicoCampo.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'actualizar', entidad: 'canonico_campo', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  async eliminarCampo(id: number, actor: Actor): Promise<{ id: number }> {
    const [antes] = await this.db.select().from(canonicoCampo).where(eq(canonicoCampo.id, id));
    if (!antes) throw new NotFoundException(`Campo canónico ${id} no encontrado`);
    await this.db.delete(canonicoCampo).where(eq(canonicoCampo.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      accion: 'eliminar', entidad: 'canonico_campo', entidadId: String(id), antes,
    });
    return { id };
  }
}
