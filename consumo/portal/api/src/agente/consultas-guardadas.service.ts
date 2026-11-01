/**
 * Consultas GUARDADAS del asistente (`portal.consultas_guardadas`).
 *
 * Se guarda la especificación (tool + parámetros validados), nunca el resultado. Al
 * abrir una, `AgenteService.ejecutarGuardada` la vuelve a correr con datos frescos bajo
 * las guardas y el alcance de quien la abre. Mismo aislamiento que las conversaciones:
 * un usuario solo ve y toca SUS consultas (404 genérico si intenta otra).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { validarEspecificacion } from '@quilate/agente';
import { Pool } from 'pg';

import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import { ControlDbService } from '../db/control-db.service';

export type VistaConsulta = 'tabla' | 'barras' | 'lineas';

export interface ConsultaGuardada {
  id: number;
  titulo: string;
  descripcion: string | null;
  tool: string;
  params: Record<string, unknown>;
  vista: VistaConsulta;
  metricaClave: string | null;
  versionDefinicion: number | null;
  creadaEn: Date;
  actualizadaEn: Date;
  ultimaEjecucionEn: Date | null;
  /** «Mi tablero»: si la consulta está fijada como widget, su posición y su ancho (1 o 2 columnas). */
  enTablero: boolean;
  tableroOrden: number | null;
  tableroAncho: 1 | 2;
}

export interface NuevaConsultaGuardada {
  titulo: string;
  descripcion?: string | null;
  tool: string;
  params: Record<string, unknown>;
  vista: VistaConsulta;
  enTablero?: boolean;
}

export interface CambiosConsultaGuardada {
  titulo?: string;
  descripcion?: string | null;
  vista?: VistaConsulta;
  enTablero?: boolean;
  tableroAncho?: 1 | 2;
}

/** Tope de widgets por tablero: cada uno es una lectura del warehouse al abrirlo. */
export const MAX_WIDGETS_TABLERO = 30;

const COLUMNAS = `id, titulo, descripcion, tool, params, vista,
                  metrica_clave AS "metricaClave", version_definicion AS "versionDefinicion",
                  creada_en AS "creadaEn", actualizada_en AS "actualizadaEn", ultima_ejecucion_en AS "ultimaEjecucionEn",
                  en_tablero AS "enTablero", tablero_orden AS "tableroOrden", tablero_ancho AS "tableroAncho"`;

@Injectable()
export class ConsultasGuardadasService {
  constructor(
    private readonly sesion: SesionService,
    private readonly controlDb: ControlDbService,
  ) {}

  private async pool(usuario: UsuarioPortal): Promise<Pool> {
    return (await this.sesion.contexto(usuario.hash)).pool;
  }

  async listar(usuario: UsuarioPortal): Promise<ConsultaGuardada[]> {
    const pool = await this.pool(usuario);
    const r = await pool.query(
      `SELECT ${COLUMNAS} FROM portal.consultas_guardadas WHERE usuario_id = $1 ORDER BY actualizada_en DESC`,
      [usuario.id],
    );
    return r.rows as ConsultaGuardada[];
  }

  async obtenerPropia(usuario: UsuarioPortal, id: number): Promise<ConsultaGuardada> {
    const pool = await this.pool(usuario);
    const r = await pool.query(
      `SELECT ${COLUMNAS} FROM portal.consultas_guardadas WHERE id = $1 AND usuario_id = $2`,
      [id, usuario.id],
    );
    const fila = r.rows[0] as ConsultaGuardada | undefined;
    if (!fila) throw new NotFoundException('Consulta guardada no encontrada');
    return fila;
  }

  /**
   * Guarda la especificación. La versión de la definición de la métrica se toma del
   * catálogo de control en este momento: si después la recertifican, al abrir la
   * consulta se le avisa al usuario que la definición cambió.
   */
  async crear(usuario: UsuarioPortal, entrada: NuevaConsultaGuardada): Promise<ConsultaGuardada> {
    // Misma validación estricta que al ejecutar la tool (Zod del paquete): una
    // especificación que no pasaría al ejecutarse no se guarda.
    const v = validarEspecificacion(entrada.tool, entrada.params);
    if (!v.ok) throw new BadRequestException(`Consulta inválida: ${v.motivo}`);
    const nueva: NuevaConsultaGuardada = { ...entrada, params: v.params };
    const pool = await this.pool(usuario);
    if (nueva.enTablero) await this.exigirCupoTablero(pool, usuario.id);
    const metricaClave = this.metricaDe(nueva);
    const version = metricaClave ? await this.versionDefinicion(metricaClave) : null;
    // Al tablero entra al final: el orden se toma del máximo actual del usuario.
    const r = await pool.query(
      `INSERT INTO portal.consultas_guardadas
         (usuario_id, titulo, descripcion, tool, params, vista, metrica_clave, version_definicion, en_tablero, tablero_orden)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9,
               CASE WHEN $9 THEN (SELECT COALESCE(max(tablero_orden), 0) + 1 FROM portal.consultas_guardadas WHERE usuario_id = $1) END)
       RETURNING ${COLUMNAS}`,
      [usuario.id, nueva.titulo, nueva.descripcion ?? null, nueva.tool, JSON.stringify(nueva.params), nueva.vista, metricaClave, version, nueva.enTablero === true],
    );
    return r.rows[0] as ConsultaGuardada;
  }

  /** Consultas fijadas a «Mi tablero», en el orden que el usuario les dio (acotadas al tope). */
  async listarTablero(usuario: UsuarioPortal): Promise<ConsultaGuardada[]> {
    const pool = await this.pool(usuario);
    const r = await pool.query(
      `SELECT ${COLUMNAS} FROM portal.consultas_guardadas
        WHERE usuario_id = $1 AND en_tablero
        ORDER BY tablero_orden NULLS LAST, actualizada_en DESC
        LIMIT $2`,
      [usuario.id, MAX_WIDGETS_TABLERO],
    );
    return r.rows as ConsultaGuardada[];
  }

  /** 400 si el usuario ya llenó su tablero: abrirlo ejecuta una lectura por widget. */
  private async exigirCupoTablero(pool: Pool, usuarioId: number): Promise<void> {
    const r = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM portal.consultas_guardadas WHERE usuario_id = $1 AND en_tablero`,
      [usuarioId],
    );
    if (Number(r.rows[0]?.n ?? 0) >= MAX_WIDGETS_TABLERO) {
      throw new BadRequestException(`Mi tablero admite hasta ${MAX_WIDGETS_TABLERO} widgets; quita alguno antes de agregar otro.`);
    }
  }

  /**
   * Reordena el tablero: los ids llegan en el orden deseado. Solo se tocan consultas del
   * propio usuario; un id ajeno o inexistente se ignora (no hay nada que revelar).
   */
  async reordenarTablero(usuario: UsuarioPortal, ids: number[]): Promise<ConsultaGuardada[]> {
    const pool = await this.pool(usuario);
    await pool.query(
      `UPDATE portal.consultas_guardadas c
          SET tablero_orden = o.pos, actualizada_en = now()
         FROM unnest($2::bigint[]) WITH ORDINALITY AS o(id, pos)
        WHERE c.id = o.id AND c.usuario_id = $1 AND c.en_tablero`,
      [usuario.id, ids],
    );
    return this.listarTablero(usuario);
  }

  async actualizar(usuario: UsuarioPortal, id: number, cambios: CambiosConsultaGuardada): Promise<ConsultaGuardada> {
    const pool = await this.pool(usuario);
    const actual = await this.obtenerPropia(usuario, id);
    if (cambios.enTablero === true && !actual.enTablero) await this.exigirCupoTablero(pool, usuario.id);
    // Al fijar al tablero se coloca al final; al quitar se libera la posición.
    const r = await pool.query(
      `UPDATE portal.consultas_guardadas
          SET titulo = COALESCE($3, titulo),
              descripcion = CASE WHEN $4::boolean THEN $5 ELSE descripcion END,
              vista = COALESCE($6, vista),
              en_tablero = COALESCE($7, en_tablero),
              tablero_orden = CASE
                WHEN $7::boolean IS TRUE AND NOT en_tablero
                  THEN (SELECT COALESCE(max(tablero_orden), 0) + 1 FROM portal.consultas_guardadas WHERE usuario_id = $2)
                WHEN $7::boolean IS FALSE THEN NULL
                ELSE tablero_orden END,
              tablero_ancho = COALESCE($8, tablero_ancho),
              actualizada_en = now()
        WHERE id = $1 AND usuario_id = $2
        RETURNING ${COLUMNAS}`,
      [
        id, usuario.id, cambios.titulo ?? null, cambios.descripcion !== undefined, cambios.descripcion ?? null,
        cambios.vista ?? null, cambios.enTablero ?? null, cambios.tableroAncho ?? null,
      ],
    );
    return r.rows[0] as ConsultaGuardada;
  }

  async marcarEjecutada(usuario: UsuarioPortal, id: number): Promise<void> {
    await this.marcarEjecutadas(usuario, [id]);
  }

  /** Marca varias de una vez (el tablero): un UPDATE en lugar de uno por widget. */
  async marcarEjecutadas(usuario: UsuarioPortal, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const pool = await this.pool(usuario);
    await pool.query(
      `UPDATE portal.consultas_guardadas SET ultima_ejecucion_en = now() WHERE id = ANY($1::bigint[]) AND usuario_id = $2`,
      [ids, usuario.id],
    );
  }

  async eliminar(usuario: UsuarioPortal, id: number): Promise<void> {
    const pool = await this.pool(usuario);
    const r = await pool.query(
      `DELETE FROM portal.consultas_guardadas WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, usuario.id],
    );
    if (r.rowCount === 0) throw new NotFoundException('Consulta guardada no encontrada');
  }

  /** Versión vigente de la definición en el catálogo (null si la clave no existe). */
  async versionDefinicion(metricaClave: string): Promise<number | null> {
    const filas = await this.controlDb.query<{ version: number }>(
      `SELECT version_definicion AS version FROM metadatos.catalogo_metricas WHERE clave = $1`,
      [metricaClave],
    );
    return filas[0]?.version ?? null;
  }

  /** Versión vigente de varias métricas en una sola consulta (el tablero). */
  async versionesDefinicion(claves: string[]): Promise<Map<string, number>> {
    const unicas = [...new Set(claves)];
    if (unicas.length === 0) return new Map();
    const filas = await this.controlDb.query<{ clave: string; version: number }>(
      `SELECT clave, version_definicion AS version FROM metadatos.catalogo_metricas WHERE clave = ANY($1::text[])`,
      [unicas],
    );
    return new Map(filas.map((f) => [f.clave, f.version]));
  }

  /** Clave de métrica que sustenta la especificación (el aging se ancla al saldo de su cartera). */
  metricaDe(espec: { tool: string; params: Record<string, unknown> }): string | null {
    if (espec.tool === 'consultar_aging') {
      return espec.params['tipo_cartera'] === 'pagar' ? 'saldo_cxp' : 'saldo_cxc';
    }
    const clave = espec.params['metrica_clave'];
    return typeof clave === 'string' ? clave : null;
  }
}
