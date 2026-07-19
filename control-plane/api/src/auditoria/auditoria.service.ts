/**
 * Registro de auditoría (§12): cada cambio del portal deja rastro con quién,
 * qué, cuándo y el antes/después. Append-only; nunca se actualiza ni borra.
 */
import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';

import { DB, DRIZZLE } from '../db/drizzle.module';
import { auditoria } from '../db/schema';

export interface EntradaAuditoria {
  usuarioId?: number | null;
  usuarioEmail?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditoriaService {
  constructor(@Inject(DRIZZLE) private readonly db: DB) {}

  /** Últimas entradas de auditoría (orden descendente). */
  listar(limite = 300) {
    return this.db.select().from(auditoria).orderBy(desc(auditoria.id)).limit(limite);
  }

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    await this.db.insert(auditoria).values({
      usuarioId: entrada.usuarioId ?? null,
      usuarioEmail: entrada.usuarioEmail ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId ?? null,
      antes: (entrada.antes ?? null) as never,
      despues: (entrada.despues ?? null) as never,
      ip: entrada.ip ?? null,
    });
  }
}
