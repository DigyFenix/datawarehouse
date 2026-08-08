/**
 * Autoadministración de la organización (solo su admin): usuarios, perfiles,
 * asignación de tableros y alcances (chatbot futuro). Todo ocurre en la BD del
 * PROPIO tenant; no hay forma de tocar otra organización. Cada mutación queda
 * en portal.auditoria.
 */
import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { ControlDbService } from '../db/control-db.service';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import {
  ActualizarPerfilDto,
  ActualizarUsuarioDto,
  AsignarAlcancesDto,
  AsignarPerfilesDto,
  AsignarTablerosDto,
  CrearPerfilDto,
  CrearUsuarioDto,
  RestablecerPasswordDto,
  TerminoGlosarioDto,
} from './admin.dto';

const COLUMNAS_USUARIO = `id, email, nombre,
  es_admin AS "esAdmin", debe_cambiar_password AS "debeCambiarPassword",
  activo, creado_en AS "creadoEn"`;

const COLUMNAS_PERFIL = `id, clave, nombre, descripcion, activo, creado_en AS "creadoEn"`;

@Injectable()
export class AdminService {
  constructor(
    private readonly sesion: SesionService,
    private readonly auditoria: AuditoriaPortalService,
    private readonly controlDb: ControlDbService,
  ) {}

  private pool(actor: UsuarioPortal): Promise<Pool> {
    return this.sesion.contexto(actor.hash).then((c) => c.pool);
  }

  private async auditar(
    pool: Pool,
    actor: UsuarioPortal,
    accion: string,
    entidad: string,
    entidadId: string,
    antes: unknown,
    despues: unknown,
    ip: string | null,
  ): Promise<void> {
    await this.auditoria.registrar(pool, {
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion,
      entidad,
      entidadId,
      antes,
      despues,
      ip,
    });
  }

  // --- Usuarios ---

  async listarUsuarios(actor: UsuarioPortal) {
    const pool = await this.pool(actor);
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_USUARIO},
              COALESCE(
                (SELECT json_agg(json_build_object('id', p.id, 'clave', p.clave, 'nombre', p.nombre) ORDER BY p.nombre)
                   FROM portal.usuario_perfiles up
                   JOIN portal.perfiles p ON p.id = up.perfil_id
                  WHERE up.usuario_id = u.id),
                '[]'::json
              ) AS perfiles
         FROM portal.usuarios u
        ORDER BY u.nombre`,
    );
    return resultado.rows as unknown[];
  }

  async crearUsuario(actor: UsuarioPortal, dto: CrearUsuarioDto, ip: string | null) {
    const pool = await this.pool(actor);
    const hash = await argon2.hash(dto.password);
    let insertado;
    try {
      insertado = await pool.query(
        `INSERT INTO portal.usuarios (email, nombre, hash_password, es_admin)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNAS_USUARIO}`,
        [dto.email.toLowerCase(), dto.nombre, hash, dto.esAdmin],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
      throw e;
    }
    const usuario = insertado.rows[0] as { id: number; email: string };
    await this.auditar(pool, actor, 'crear', 'usuarios', String(usuario.id), null, usuario, ip);
    return usuario;
  }

  async actualizarUsuario(
    actor: UsuarioPortal,
    usuarioId: number,
    dto: ActualizarUsuarioDto,
    ip: string | null,
  ) {
    if (usuarioId === actor.id && (dto.esAdmin === false || dto.activo === false)) {
      throw new BadRequestException('No puedes quitarte a ti mismo el acceso ni el rol de admin');
    }
    const pool = await this.pool(actor);
    const antes = await this.usuarioPorId(pool, usuarioId);
    const resultado = await pool.query(
      `UPDATE portal.usuarios
          SET nombre   = COALESCE($2, nombre),
              es_admin = COALESCE($3, es_admin),
              activo   = COALESCE($4, activo),
              actualizado_en = now()
        WHERE id = $1
        RETURNING ${COLUMNAS_USUARIO}`,
      [usuarioId, dto.nombre ?? null, dto.esAdmin ?? null, dto.activo ?? null],
    );
    const usuario = resultado.rows[0] as unknown;
    await this.auditar(pool, actor, 'actualizar', 'usuarios', String(usuarioId), antes, usuario, ip);
    return usuario;
  }

  /** El admin restablece la contraseña de un usuario (temporal, cambio forzado). */
  async restablecerPassword(
    actor: UsuarioPortal,
    usuarioId: number,
    dto: RestablecerPasswordDto,
    ip: string | null,
  ) {
    const pool = await this.pool(actor);
    await this.usuarioPorId(pool, usuarioId);
    const hash = await argon2.hash(dto.password);
    await pool.query(
      `UPDATE portal.usuarios
          SET hash_password = $1, debe_cambiar_password = true, actualizado_en = now()
        WHERE id = $2`,
      [hash, usuarioId],
    );
    await this.auditar(pool, actor, 'restablecer_password', 'usuarios', String(usuarioId), null, null, ip);
    return { restablecida: true };
  }

  async asignarPerfiles(
    actor: UsuarioPortal,
    usuarioId: number,
    dto: AsignarPerfilesDto,
    ip: string | null,
  ) {
    const pool = await this.pool(actor);
    await this.usuarioPorId(pool, usuarioId);
    const antes = await pool.query(
      `SELECT perfil_id FROM portal.usuario_perfiles WHERE usuario_id = $1 ORDER BY perfil_id`,
      [usuarioId],
    );
    // Reemplazo completo de asignaciones en una transacción.
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(`DELETE FROM portal.usuario_perfiles WHERE usuario_id = $1`, [usuarioId]);
      for (const perfilId of dto.perfilIds) {
        await cliente.query(
          `INSERT INTO portal.usuario_perfiles (usuario_id, perfil_id) VALUES ($1, $2)`,
          [usuarioId, perfilId],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      if ((e as { code?: string }).code === '23503') {
        throw new BadRequestException('Alguno de los perfiles no existe');
      }
      throw e;
    } finally {
      cliente.release();
    }
    await this.auditar(
      pool,
      actor,
      'asignar_perfiles',
      'usuario_perfiles',
      String(usuarioId),
      { perfilIds: antes.rows.map((r) => (r as { perfil_id: number }).perfil_id) },
      { perfilIds: dto.perfilIds },
      ip,
    );
    return { asignados: dto.perfilIds.length };
  }

  private async usuarioPorId(pool: Pool, usuarioId: number) {
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_USUARIO} FROM portal.usuarios WHERE id = $1`,
      [usuarioId],
    );
    const usuario = resultado.rows[0] as unknown;
    if (!usuario) throw new NotFoundException(`Usuario ${usuarioId} no encontrado`);
    return usuario;
  }

  // --- Perfiles ---

  async listarPerfiles(actor: UsuarioPortal) {
    const pool = await this.pool(actor);
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_PERFIL},
              COALESCE(
                (SELECT json_agg(pt.tablero_id ORDER BY pt.tablero_id)
                   FROM portal.perfil_tableros pt WHERE pt.perfil_id = p.id),
                '[]'::json
              ) AS "tableroIds",
              COALESCE(
                (SELECT json_agg(json_build_object('recursoTipo', pa.recurso_tipo, 'recursoClave', pa.recurso_clave) ORDER BY pa.id)
                   FROM portal.perfil_alcances pa WHERE pa.perfil_id = p.id),
                '[]'::json
              ) AS alcances,
              (SELECT count(*)::int FROM portal.usuario_perfiles up WHERE up.perfil_id = p.id) AS usuarios
         FROM portal.perfiles p
        ORDER BY p.nombre`,
    );
    return resultado.rows as unknown[];
  }

  async crearPerfil(actor: UsuarioPortal, dto: CrearPerfilDto, ip: string | null) {
    const pool = await this.pool(actor);
    let insertado;
    try {
      insertado = await pool.query(
        `INSERT INTO portal.perfiles (clave, nombre, descripcion, activo)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNAS_PERFIL}`,
        [dto.clave, dto.nombre, dto.descripcion ?? null, dto.activo],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException('Ya existe un perfil con esa clave');
      }
      throw e;
    }
    const perfil = insertado.rows[0] as { id: number };
    await this.auditar(pool, actor, 'crear', 'perfiles', String(perfil.id), null, perfil, ip);
    return perfil;
  }

  async actualizarPerfil(
    actor: UsuarioPortal,
    perfilId: number,
    dto: ActualizarPerfilDto,
    ip: string | null,
  ) {
    const pool = await this.pool(actor);
    const antes = await this.perfilPorId(pool, perfilId);
    const resultado = await pool.query(
      `UPDATE portal.perfiles
          SET nombre      = COALESCE($2, nombre),
              descripcion = COALESCE($3, descripcion),
              activo      = COALESCE($4, activo),
              actualizado_en = now()
        WHERE id = $1
        RETURNING ${COLUMNAS_PERFIL}`,
      [perfilId, dto.nombre ?? null, dto.descripcion ?? null, dto.activo ?? null],
    );
    const perfil = resultado.rows[0] as unknown;
    await this.auditar(pool, actor, 'actualizar', 'perfiles', String(perfilId), antes, perfil, ip);
    return perfil;
  }

  async eliminarPerfil(actor: UsuarioPortal, perfilId: number, ip: string | null): Promise<void> {
    const pool = await this.pool(actor);
    const antes = await this.perfilPorId(pool, perfilId);
    await pool.query(`DELETE FROM portal.perfiles WHERE id = $1`, [perfilId]);
    await this.auditar(pool, actor, 'eliminar', 'perfiles', String(perfilId), antes, null, ip);
  }

  async asignarTableros(
    actor: UsuarioPortal,
    perfilId: number,
    dto: AsignarTablerosDto,
    ip: string | null,
  ) {
    const pool = await this.pool(actor);
    await this.perfilPorId(pool, perfilId);
    const antes = await pool.query(
      `SELECT tablero_id FROM portal.perfil_tableros WHERE perfil_id = $1 ORDER BY tablero_id`,
      [perfilId],
    );
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(`DELETE FROM portal.perfil_tableros WHERE perfil_id = $1`, [perfilId]);
      for (const tableroId of dto.tableroIds) {
        await cliente.query(
          `INSERT INTO portal.perfil_tableros (perfil_id, tablero_id) VALUES ($1, $2)`,
          [perfilId, tableroId],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      if ((e as { code?: string }).code === '23503') {
        throw new BadRequestException('Alguno de los tableros no existe');
      }
      throw e;
    } finally {
      cliente.release();
    }
    await this.auditar(
      pool,
      actor,
      'asignar_tableros',
      'perfil_tableros',
      String(perfilId),
      { tableroIds: antes.rows.map((r) => (r as { tablero_id: number }).tablero_id) },
      { tableroIds: dto.tableroIds },
      ip,
    );
    return { asignados: dto.tableroIds.length };
  }

  async asignarAlcances(
    actor: UsuarioPortal,
    perfilId: number,
    dto: AsignarAlcancesDto,
    ip: string | null,
  ) {
    const pool = await this.pool(actor);
    await this.perfilPorId(pool, perfilId);
    const antes = await pool.query(
      `SELECT recurso_tipo AS "recursoTipo", recurso_clave AS "recursoClave"
         FROM portal.perfil_alcances WHERE perfil_id = $1 ORDER BY id`,
      [perfilId],
    );
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(`DELETE FROM portal.perfil_alcances WHERE perfil_id = $1`, [perfilId]);
      for (const alcance of dto.alcances) {
        await cliente.query(
          `INSERT INTO portal.perfil_alcances (perfil_id, recurso_tipo, recurso_clave)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [perfilId, alcance.recursoTipo, alcance.recursoClave],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
    await this.auditar(
      pool,
      actor,
      'asignar_alcances',
      'perfil_alcances',
      String(perfilId),
      { alcances: antes.rows },
      { alcances: dto.alcances },
      ip,
    );
    return { asignados: dto.alcances.length };
  }

  private async perfilPorId(pool: Pool, perfilId: number) {
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_PERFIL} FROM portal.perfiles WHERE id = $1`,
      [perfilId],
    );
    const perfil = resultado.rows[0] as unknown;
    if (!perfil) throw new NotFoundException(`Perfil ${perfilId} no encontrado`);
    return perfil;
  }

  // --- Tableros (lectura para asignar; el alta la hace el proveedor) ---

  async listarTableros(actor: UsuarioPortal) {
    const pool = await this.pool(actor);
    const resultado = await pool.query(
      `SELECT id, clave, nombre, descripcion, modulo, orden, activo
         FROM portal.tableros
        ORDER BY orden, id`,
    );
    return resultado.rows as unknown[];
  }

  // --- Glosario de la organización ---

  /**
   * Vocabulario propio del negocio. Se superpone al glosario base del producto:
   * ante un término repetido, el agente usa el de la organización.
   */
  async listarGlosario(actor: UsuarioPortal) {
    const pool = await this.pool(actor);
    const resultado = await pool.query(
      `SELECT id, termino, definicion, equivale_a AS "equivaleA", dominio,
              creado_por AS "creadoPor", actualizado_en AS "actualizadoEn"
         FROM portal.glosario
        ORDER BY termino`,
    );
    return resultado.rows as unknown[];
  }

  async crearTermino(actor: UsuarioPortal, dto: TerminoGlosarioDto, ip: string | null) {
    const pool = await this.pool(actor);
    const existente = await pool.query(
      `SELECT id FROM portal.glosario WHERE lower(termino) = lower($1)`,
      [dto.termino],
    );
    if (existente.rowCount) {
      throw new ConflictException(`El término «${dto.termino}» ya está definido.`);
    }
    const resultado = await pool.query(
      `INSERT INTO portal.glosario (termino, definicion, equivale_a, dominio, creado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, termino, definicion, equivale_a AS "equivaleA", dominio`,
      [dto.termino, dto.definicion, dto.equivaleA ?? null, dto.dominio ?? null, actor.email],
    );
    const creado = resultado.rows[0];
    await this.auditoria.registrar(pool, {
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: 'crear',
      entidad: 'glosario',
      entidadId: String((creado as { id: number }).id),
      despues: creado as Record<string, unknown>,
      ip,
    });
    return creado;
  }

  async actualizarTermino(
    actor: UsuarioPortal,
    id: number,
    dto: TerminoGlosarioDto,
    ip: string | null,
  ) {
    const pool = await this.pool(actor);
    const antes = await pool.query(`SELECT * FROM portal.glosario WHERE id = $1`, [id]);
    if (!antes.rowCount) throw new NotFoundException('Término no encontrado');

    const resultado = await pool.query(
      `UPDATE portal.glosario
          SET termino = $2, definicion = $3, equivale_a = $4, dominio = $5, actualizado_en = now()
        WHERE id = $1
        RETURNING id, termino, definicion, equivale_a AS "equivaleA", dominio`,
      [id, dto.termino, dto.definicion, dto.equivaleA ?? null, dto.dominio ?? null],
    );
    await this.auditoria.registrar(pool, {
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: 'actualizar',
      entidad: 'glosario',
      entidadId: String(id),
      antes: antes.rows[0] as Record<string, unknown>,
      despues: resultado.rows[0] as Record<string, unknown>,
      ip,
    });
    return resultado.rows[0];
  }

  async eliminarTermino(actor: UsuarioPortal, id: number, ip: string | null): Promise<void> {
    const pool = await this.pool(actor);
    const antes = await pool.query(`SELECT * FROM portal.glosario WHERE id = $1`, [id]);
    if (!antes.rowCount) throw new NotFoundException('Término no encontrado');
    await pool.query(`DELETE FROM portal.glosario WHERE id = $1`, [id]);
    await this.auditoria.registrar(pool, {
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: 'eliminar',
      entidad: 'glosario',
      entidadId: String(id),
      antes: antes.rows[0] as Record<string, unknown>,
      ip,
    });
  }

  /** Métricas que el agente puede consultar: alimentan el desplegable de «equivale a». */
  async metricasConsumibles() {
    const filas = await this.controlDb.query(
      `SELECT clave, nombre_oficial AS "nombreOficial", estado
         FROM metadatos.catalogo_metricas
        WHERE estado IN ('certificada', 'exploratoria')
        ORDER BY nombre_oficial`,
      [],
    );
    return filas;
  }

  // --- Auditoría de la organización ---

  async listarAuditoria(actor: UsuarioPortal, limite: number, desdeId?: number) {
    const pool = await this.pool(actor);
    return this.auditoria.listar(pool, limite, desdeId);
  }
}
