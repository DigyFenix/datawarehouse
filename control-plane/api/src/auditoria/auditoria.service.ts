/**
 * Registro de auditoría (§12): cada cambio del portal deja rastro con quién,
 * qué, cuándo y el antes/después. Append-only; nunca se actualiza ni borra.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, SQL } from 'drizzle-orm';

import { DB, DRIZZLE } from '../db/drizzle.module';
import { auditoria } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { FiltroAuditoriaDto } from './auditoria.dto';

export interface EntradaAuditoria {
  usuarioId?: number | null;
  usuarioEmail?: string | null;
  /** Organización afectada; null/ausente = evento global (login, bootstrap, catálogos). */
  organizacionId?: number | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string | null;
}

const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 200;

@Injectable()
export class AuditoriaService {
  constructor(@Inject(DRIZZLE) private readonly db: DB) {}

  /**
   * Página de auditoría por cursor (orden id DESC; `desdeId` = id menor de la
   * página previa). Actor sin rol global: solo eventos de SUS organizaciones —
   * los eventos globales (organizacion_id NULL) quedan reservados al rol global.
   */
  async listar(actor: Actor, filtro: FiltroAuditoriaDto) {
    const limite = Math.min(Math.max(filtro.limite ?? LIMITE_DEFAULT, 1), LIMITE_MAX);
    const condiciones: SQL[] = [];
    if (filtro.desdeId !== undefined) condiciones.push(lt(auditoria.id, filtro.desdeId));
    if (filtro.organizacionId !== undefined) {
      condiciones.push(eq(auditoria.organizacionId, filtro.organizacionId));
    }
    if (!actor.esGlobal) {
      const ids = actor.orgIds ?? [];
      if (ids.length === 0) return [];
      condiciones.push(inArray(auditoria.organizacionId, ids));
    }
    return this.db
      .select()
      .from(auditoria)
      .where(condiciones.length ? and(...condiciones) : undefined)
      .orderBy(desc(auditoria.id))
      .limit(limite);
  }

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    await this.db.insert(auditoria).values({
      usuarioId: entrada.usuarioId ?? null,
      usuarioEmail: entrada.usuarioEmail ?? null,
      organizacionId: entrada.organizacionId ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId ?? null,
      antes: (entrada.antes ?? null) as never,
      despues: (entrada.despues ?? null) as never,
      ip: entrada.ip ?? null,
    });
  }
}
