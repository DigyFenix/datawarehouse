/**
 * Conversaciones del agente de IA por usuario del portal
 * (`portal.chat_conversaciones` / `portal.chat_mensajes`). Mismo aislamiento que
 * tableros/admin: un usuario solo lee o escribe SUS conversaciones — 404 genérico
 * si intenta otra (no se distingue "no existe" de "no es tuya").
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { MensajeHistorial, TarjetaDato } from '@pulso/agente';
import { Pool } from 'pg';

import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';

export const TITULO_CONVERSACION_DEFECTO = 'Nueva conversación';

export interface ConversacionResumen {
  id: number;
  titulo: string;
  creadaEn: Date;
  actualizadaEn: Date;
}

export interface MensajeChat {
  id: number;
  rol: 'usuario' | 'asistente';
  contenido: string;
  tarjetas: TarjetaDato[] | null;
  creadoEn: Date;
}

@Injectable()
export class ConversacionesService {
  constructor(private readonly sesion: SesionService) {}

  private async pool(usuario: UsuarioPortal): Promise<Pool> {
    return (await this.sesion.contexto(usuario.hash)).pool;
  }

  async listar(usuario: UsuarioPortal): Promise<ConversacionResumen[]> {
    const pool = await this.pool(usuario);
    const resultado = await pool.query(
      `SELECT id, titulo, creada_en AS "creadaEn", actualizada_en AS "actualizadaEn"
         FROM portal.chat_conversaciones
        WHERE usuario_id = $1
        ORDER BY actualizada_en DESC`,
      [usuario.id],
    );
    return resultado.rows as ConversacionResumen[];
  }

  async crear(usuario: UsuarioPortal): Promise<ConversacionResumen> {
    const pool = await this.pool(usuario);
    const resultado = await pool.query(
      `INSERT INTO portal.chat_conversaciones (usuario_id, titulo)
       VALUES ($1, $2)
       RETURNING id, titulo, creada_en AS "creadaEn", actualizada_en AS "actualizadaEn"`,
      [usuario.id, TITULO_CONVERSACION_DEFECTO],
    );
    return resultado.rows[0] as ConversacionResumen;
  }

  /** 404 genérico si la conversación no existe o no es del usuario. */
  async obtenerPropia(usuario: UsuarioPortal, conversacionId: number): Promise<ConversacionResumen> {
    const pool = await this.pool(usuario);
    return this.obtenerPropiaConPool(pool, usuario, conversacionId);
  }

  private async obtenerPropiaConPool(
    pool: Pool,
    usuario: UsuarioPortal,
    conversacionId: number,
  ): Promise<ConversacionResumen> {
    const resultado = await pool.query(
      `SELECT id, titulo, creada_en AS "creadaEn", actualizada_en AS "actualizadaEn"
         FROM portal.chat_conversaciones
        WHERE id = $1 AND usuario_id = $2`,
      [conversacionId, usuario.id],
    );
    const fila = resultado.rows[0] as ConversacionResumen | undefined;
    if (!fila) throw new NotFoundException('Conversación no encontrada');
    return fila;
  }

  async mensajes(usuario: UsuarioPortal, conversacionId: number): Promise<MensajeChat[]> {
    const pool = await this.pool(usuario);
    await this.obtenerPropiaConPool(pool, usuario, conversacionId);
    const resultado = await pool.query(
      `SELECT id, rol, contenido, tarjetas, creado_en AS "creadoEn"
         FROM portal.chat_mensajes
        WHERE conversacion_id = $1
        ORDER BY id`,
      [conversacionId],
    );
    return resultado.rows as MensajeChat[];
  }

  /** Últimos `limite` turnos, en orden CRONOLÓGICO, solo rol+contenido (para el prompt). */
  async historialReciente(
    pool: Pool,
    conversacionId: number,
    limite: number,
  ): Promise<MensajeHistorial[]> {
    const resultado = await pool.query(
      `SELECT rol, contenido
         FROM portal.chat_mensajes
        WHERE conversacion_id = $1
        ORDER BY id DESC
        LIMIT $2`,
      [conversacionId, limite],
    );
    return (resultado.rows as MensajeHistorial[]).reverse();
  }

  /**
   * Persiste el turno usuario+asistente en una transacción y actualiza la
   * conversación: `actualizada_en` siempre; `titulo` solo si seguía en el
   * valor por defecto (primeros ~60 caracteres del mensaje del usuario).
   */
  async registrarTurno(
    pool: Pool,
    conversacion: ConversacionResumen,
    mensajeUsuario: string,
    respuesta: { texto: string; tarjetas: TarjetaDato[] },
  ): Promise<void> {
    const tituloNuevo =
      conversacion.titulo === TITULO_CONVERSACION_DEFECTO ? mensajeUsuario.slice(0, 60) : null;
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(
        `INSERT INTO portal.chat_mensajes (conversacion_id, rol, contenido)
         VALUES ($1, 'usuario', $2)`,
        [conversacion.id, mensajeUsuario],
      );
      await cliente.query(
        `INSERT INTO portal.chat_mensajes (conversacion_id, rol, contenido, tarjetas)
         VALUES ($1, 'asistente', $2, $3::jsonb)`,
        [conversacion.id, respuesta.texto, JSON.stringify(respuesta.tarjetas)],
      );
      await cliente.query(
        `UPDATE portal.chat_conversaciones
            SET actualizada_en = now(),
                titulo = COALESCE($2, titulo)
          WHERE id = $1`,
        [conversacion.id, tituloNuevo],
      );
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }

  async eliminar(usuario: UsuarioPortal, conversacionId: number): Promise<void> {
    const pool = await this.pool(usuario);
    const resultado = await pool.query(
      `DELETE FROM portal.chat_conversaciones WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [conversacionId, usuario.id],
    );
    if (resultado.rowCount === 0) throw new NotFoundException('Conversación no encontrada');
  }
}
