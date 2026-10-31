/**
 * Bitácora de DEMANDA NO ATENDIDA (`portal.solicitudes_no_atendidas`).
 *
 * Lo que la gente pide al asistente y la capa semántica no puede dar: una métrica que no
 * existe, un dato más reciente que la última carga, un desglose que la métrica no admite o
 * algo fuera de su autorización. Se escribe desde el turno del agente (tool explícita o
 * denegación deducida) y la lee SOLO el administrador de la organización, para decidir qué
 * agregar al catálogo o qué carga adelantar. No altera el alcance del agente: es metadato
 * de demanda, no dato.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { SolicitudNoAtendida } from '@quilate/agente';
import { Pool } from 'pg';

import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';

export type EstadoSolicitud = 'nueva' | 'en_revision' | 'atendida' | 'descartada';

export interface SolicitudRegistrada {
  id: number;
  usuarioEmail: string | null;
  usuarioNombre: string | null;
  conversacionId: number | null;
  tipo: SolicitudNoAtendida['tipo'];
  pregunta: string;
  resumen: string;
  metricaClave: string | null;
  dominio: string | null;
  origen: 'tool' | 'denegacion';
  estado: EstadoSolicitud;
  notaAdmin: string | null;
  creadaEn: Date;
  actualizadaEn: Date;
}

export interface ResumenDemanda {
  total: number;
  nuevas: number;
  porTipo: { tipo: string; total: number }[];
  /** Métricas/dominios más pedidos (solo solicitudes no descartadas). */
  masPedidas: { clave: string; total: number }[];
}

const COLUMNAS = `s.id, u.email AS "usuarioEmail", u.nombre AS "usuarioNombre", s.conversacion_id AS "conversacionId",
                  s.tipo, s.pregunta, s.resumen, s.metrica_clave AS "metricaClave", s.dominio, s.origen, s.estado,
                  s.nota_admin AS "notaAdmin", s.creada_en AS "creadaEn", s.actualizada_en AS "actualizadaEn"`;

@Injectable()
export class SolicitudesService {
  constructor(private readonly sesion: SesionService) {}

  /** Persiste las solicitudes de un turno. Una sesión suplantada (soporte) no genera demanda. */
  async registrar(
    pool: Pool,
    usuario: UsuarioPortal,
    conversacionId: number,
    pregunta: string,
    solicitudes: SolicitudNoAtendida[],
  ): Promise<void> {
    if (solicitudes.length === 0 || usuario.impersonadoPor) return;
    for (const s of solicitudes) {
      await pool.query(
        `INSERT INTO portal.solicitudes_no_atendidas
           (usuario_id, conversacion_id, tipo, pregunta, resumen, metrica_clave, dominio, origen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [usuario.id, conversacionId, s.tipo, pregunta.slice(0, 4000), s.resumen.slice(0, 300), s.metricaClave ?? null, s.dominio ?? null, s.origen],
      );
    }
  }

  async listar(admin: UsuarioPortal, estado?: EstadoSolicitud, limite = 200): Promise<SolicitudRegistrada[]> {
    const { pool } = await this.sesion.contexto(admin.hash);
    const r = await pool.query(
      `SELECT ${COLUMNAS}
         FROM portal.solicitudes_no_atendidas s
         LEFT JOIN portal.usuarios u ON u.id = s.usuario_id
        WHERE ($1::text IS NULL OR s.estado = $1)
        ORDER BY s.creada_en DESC
        LIMIT $2`,
      [estado ?? null, limite],
    );
    return r.rows as SolicitudRegistrada[];
  }

  async resumen(admin: UsuarioPortal): Promise<ResumenDemanda> {
    const { pool } = await this.sesion.contexto(admin.hash);
    const [totales, porTipo, masPedidas] = await Promise.all([
      pool.query<{ total: string; nuevas: string }>(
        `SELECT count(*)::text AS total, count(*) FILTER (WHERE estado = 'nueva')::text AS nuevas
           FROM portal.solicitudes_no_atendidas`,
      ),
      pool.query<{ tipo: string; total: string }>(
        `SELECT tipo, count(*)::text AS total
           FROM portal.solicitudes_no_atendidas
          WHERE estado <> 'descartada'
          GROUP BY tipo ORDER BY count(*) DESC`,
      ),
      pool.query<{ clave: string; total: string }>(
        `SELECT COALESCE(metrica_clave, dominio) AS clave, count(*)::text AS total
           FROM portal.solicitudes_no_atendidas
          WHERE estado <> 'descartada' AND COALESCE(metrica_clave, dominio) IS NOT NULL
          GROUP BY 1 ORDER BY count(*) DESC LIMIT 8`,
      ),
    ]);
    return {
      total: Number(totales.rows[0]?.total ?? 0),
      nuevas: Number(totales.rows[0]?.nuevas ?? 0),
      porTipo: porTipo.rows.map((f) => ({ tipo: f.tipo, total: Number(f.total) })),
      masPedidas: masPedidas.rows.map((f) => ({ clave: f.clave, total: Number(f.total) })),
    };
  }

  async actualizar(
    admin: UsuarioPortal,
    id: number,
    cambios: { estado?: EstadoSolicitud; notaAdmin?: string | null },
  ): Promise<SolicitudRegistrada> {
    const { pool } = await this.sesion.contexto(admin.hash);
    const r = await pool.query(
      `UPDATE portal.solicitudes_no_atendidas s
          SET estado = COALESCE($2, estado),
              nota_admin = CASE WHEN $3::boolean THEN $4 ELSE nota_admin END,
              actualizada_en = now()
        WHERE s.id = $1
        RETURNING s.id`,
      [id, cambios.estado ?? null, cambios.notaAdmin !== undefined, cambios.notaAdmin ?? null],
    );
    if (r.rowCount === 0) throw new NotFoundException('Solicitud no encontrada');
    const fila = await pool.query(
      `SELECT ${COLUMNAS}
         FROM portal.solicitudes_no_atendidas s
         LEFT JOIN portal.usuarios u ON u.id = s.usuario_id
        WHERE s.id = $1`,
      [id],
    );
    return fila.rows[0] as SolicitudRegistrada;
  }
}
