/**
 * NIT de compañías afiliadas (intercompañía) por organización. El portal los
 * administra aquí; el worker del plano de datos los lee al transformar y Oro
 * marca `es_intercompania` comparando por la forma normalizada (§4: el portal
 * escribe, el plano de datos lee). Cambios auditados (§12).
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { exigirAccesoOrg } from '../common/acceso';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { nitsAfiliados, organizaciones } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarNitAfiliadoDto, CrearNitsAfiliadosDto } from './nits-afiliados.dto';

/** Misma regla que la columna generada de la BD: mayúsculas y solo [0-9K]. */
function normalizarNit(nit: string): string {
  return nit.toUpperCase().replace(/[^0-9K]/g, '');
}

@Injectable()
export class NitsAfiliadosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** NITs de una organización. Cada tenant ve los suyos. */
  listar(organizacionId: number) {
    return this.db
      .select()
      .from(nitsAfiliados)
      .where(eq(nitsAfiliados.organizacionId, organizacionId))
      .orderBy(nitsAfiliados.id);
  }

  /**
   * Alta en lote. Omite silenciosamente los que ya existen (misma forma
   * normalizada) y rechaza los que quedan vacíos tras normalizar.
   * @returns { creados, omitidos } — omitidos = duplicados del lote o de la BD
   */
  async crearLote(dto: CrearNitsAfiliadosDto, actor: Actor) {
    const [org] = await this.db
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.id, dto.organizacionId));
    if (!org) throw new NotFoundException(`Organización ${dto.organizacionId} no encontrada`);

    const invalidos = dto.nits.filter((n) => normalizarNit(n) === '');
    if (invalidos.length) {
      throw new BadRequestException(
        `NIT sin dígitos tras normalizar: ${invalidos.join(', ')}`,
      );
    }

    // Dedup dentro del lote por forma normalizada (la BD lo exigiría igual).
    const vistos = new Set<string>();
    const unicos = dto.nits.filter((n) => {
      const norma = normalizarNit(n);
      if (vistos.has(norma)) return false;
      vistos.add(norma);
      return true;
    });

    const creados = await this.db
      .insert(nitsAfiliados)
      .values(unicos.map((nit) => ({ organizacionId: dto.organizacionId, nit })))
      .onConflictDoNothing()
      .returning();

    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'crear', entidad: 'nits_afiliados',
      entidadId: `org:${dto.organizacionId}`,
      despues: { nits: creados.map((c) => c.nit), omitidos: dto.nits.length - creados.length },
    });
    return { creados, omitidos: dto.nits.length - creados.length };
  }

  async actualizar(id: number, dto: ActualizarNitAfiliadoDto, actor: Actor) {
    const [antes] = await this.db.select().from(nitsAfiliados).where(eq(nitsAfiliados.id, id));
    if (!antes) throw new NotFoundException(`NIT afiliado ${id} no encontrado`);
    exigirAccesoOrg(actor, antes.organizacionId); // IDOR por PK: la fila debe ser de una org del actor
    if (dto.nit !== undefined && normalizarNit(dto.nit) === '') {
      throw new BadRequestException('El NIT queda vacío tras normalizar');
    }
    const [act] = await this.db
      .update(nitsAfiliados)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(nitsAfiliados.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'actualizar', entidad: 'nits_afiliados', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(nitsAfiliados).where(eq(nitsAfiliados.id, id));
    if (!antes) throw new NotFoundException(`NIT afiliado ${id} no encontrado`);
    exigirAccesoOrg(actor, antes.organizacionId);
    await this.db
      .delete(nitsAfiliados)
      .where(and(eq(nitsAfiliados.id, id), eq(nitsAfiliados.organizacionId, antes.organizacionId)));
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'eliminar', entidad: 'nits_afiliados', entidadId: String(id), antes,
    });
  }
}
