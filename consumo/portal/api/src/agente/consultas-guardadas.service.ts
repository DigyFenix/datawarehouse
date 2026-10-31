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
}

export interface NuevaConsultaGuardada {
  titulo: string;
  descripcion?: string | null;
  tool: string;
  params: Record<string, unknown>;
  vista: VistaConsulta;
}

const COLUMNAS = `id, titulo, descripcion, tool, params, vista,
                  metrica_clave AS "metricaClave", version_definicion AS "versionDefinicion",
                  creada_en AS "creadaEn", actualizada_en AS "actualizadaEn", ultima_ejecucion_en AS "ultimaEjecucionEn"`;

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
    const metricaClave = this.metricaDe(nueva);
    const version = metricaClave ? await this.versionDefinicion(metricaClave) : null;
    const r = await pool.query(
      `INSERT INTO portal.consultas_guardadas
         (usuario_id, titulo, descripcion, tool, params, vista, metrica_clave, version_definicion)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING ${COLUMNAS}`,
      [usuario.id, nueva.titulo, nueva.descripcion ?? null, nueva.tool, JSON.stringify(nueva.params), nueva.vista, metricaClave, version],
    );
    return r.rows[0] as ConsultaGuardada;
  }

  async actualizar(
    usuario: UsuarioPortal,
    id: number,
    cambios: { titulo?: string; descripcion?: string | null; vista?: VistaConsulta },
  ): Promise<ConsultaGuardada> {
    const pool = await this.pool(usuario);
    await this.obtenerPropia(usuario, id);
    const r = await pool.query(
      `UPDATE portal.consultas_guardadas
          SET titulo = COALESCE($3, titulo),
              descripcion = CASE WHEN $4::boolean THEN $5 ELSE descripcion END,
              vista = COALESCE($6, vista),
              actualizada_en = now()
        WHERE id = $1 AND usuario_id = $2
        RETURNING ${COLUMNAS}`,
      [id, usuario.id, cambios.titulo ?? null, cambios.descripcion !== undefined, cambios.descripcion ?? null, cambios.vista ?? null],
    );
    return r.rows[0] as ConsultaGuardada;
  }

  async marcarEjecutada(usuario: UsuarioPortal, id: number): Promise<void> {
    const pool = await this.pool(usuario);
    await pool.query(
      `UPDATE portal.consultas_guardadas SET ultima_ejecucion_en = now() WHERE id = $1 AND usuario_id = $2`,
      [id, usuario.id],
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

  /** Clave de métrica que sustenta la especificación (el aging se ancla al saldo de su cartera). */
  metricaDe(espec: { tool: string; params: Record<string, unknown> }): string | null {
    if (espec.tool === 'consultar_aging') {
      return espec.params['tipo_cartera'] === 'pagar' ? 'saldo_cxp' : 'saldo_cxc';
    }
    const clave = espec.params['metrica_clave'];
    return typeof clave === 'string' ? clave : null;
  }
}
