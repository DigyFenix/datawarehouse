/**
 * Auditoría del portal de usuario: append-only en portal.auditoria de la BD del
 * TENANT (cada organización conserva su propio rastro). Incluye logins y cada
 * apertura de tablero (ver_tablero).
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

export interface EntradaAuditoriaPortal {
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
export class AuditoriaPortalService {
  async registrar(pool: Pool, entrada: EntradaAuditoriaPortal): Promise<void> {
    await pool.query(
      `INSERT INTO portal.auditoria
         (usuario_id, usuario_email, accion, entidad, entidad_id, antes, despues, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entrada.usuarioId ?? null,
        entrada.usuarioEmail ?? null,
        entrada.accion,
        entrada.entidad,
        entrada.entidadId ?? null,
        entrada.antes === undefined || entrada.antes === null ? null : JSON.stringify(entrada.antes),
        entrada.despues === undefined || entrada.despues === null ? null : JSON.stringify(entrada.despues),
        entrada.ip ?? null,
      ],
    );
  }

  /** Últimas entradas (para el módulo admin de la organización). */
  async listar(pool: Pool, limite = 200, desdeId?: number) {
    const filtro = desdeId ? 'WHERE id < $2' : '';
    const params: unknown[] = desdeId ? [limite, desdeId] : [limite];
    const resultado = await pool.query(
      `SELECT id, ocurrido_en AS "ocurridoEn", usuario_email AS "usuarioEmail",
              accion, entidad, entidad_id AS "entidadId", antes, despues, ip
         FROM portal.auditoria
         ${filtro}
        ORDER BY id DESC
        LIMIT $1`,
      params,
    );
    return resultado.rows as unknown[];
  }
}
