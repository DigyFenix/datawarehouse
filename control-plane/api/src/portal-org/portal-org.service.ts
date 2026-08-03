/**
 * Administración del PORTAL DE USUARIO de cada tenant desde el plano de control:
 * estado del esquema `portal`, siembra del primer admin de la organización y alta
 * de tableros (URLs de Publish to Web). Opera sobre la base del tenant vía
 * TenantDbService; cada mutación queda auditada en gobierno.auditoria (control)
 * y en portal.auditoria (tenant).
 */
import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { TenantDbService } from '../db/tenant-db.service';
import { Actor, OrganizacionesService } from '../organizaciones/organizaciones.service';
import { ActualizarTableroDto, CrearTableroDto, SembrarAdminDto } from './portal-org.dto';

export interface TableroPortal {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  urlPublica: string;
  orden: number;
  activo: boolean;
}

const COLUMNAS_TABLERO = `id, clave, nombre, descripcion, modulo,
  url_publica AS "urlPublica", orden, activo`;

@Injectable()
export class PortalOrgService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly organizaciones: OrganizacionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Pool hacia la base del tenant de la organización (404/400 si no procede). */
  private async poolDeOrganizacion(orgId: number): Promise<{ pool: Pool; baseDatos: string }> {
    const org = await this.organizaciones.obtener(orgId);
    if (!org.baseDatosDw) {
      throw new BadRequestException(
        `La organización ${org.codigo} no tiene base de datos aprovisionada (base_datos_dw)`,
      );
    }
    return { pool: this.tenantDb.obtenerPool(org.baseDatosDw), baseDatos: org.baseDatosDw };
  }

  /** ¿La base del tenant tiene aplicado el esquema portal (110)? ¿Ya hay admin? */
  async estado(orgId: number) {
    const { pool, baseDatos } = await this.poolDeOrganizacion(orgId);
    const esquema = await pool.query(
      `SELECT count(*)::int AS tablas
         FROM information_schema.tables
        WHERE table_schema = 'portal'`,
    );
    const tablas = (esquema.rows[0] as { tablas: number }).tablas;
    if (tablas === 0) {
      return { baseDatos, esquemaAplicado: false, adminExiste: false, usuarios: 0, tableros: 0 };
    }
    const conteos = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM portal.usuarios)                      AS usuarios,
         (SELECT count(*)::int FROM portal.usuarios WHERE es_admin)       AS admins,
         (SELECT count(*)::int FROM portal.tableros)                      AS tableros`,
    );
    const fila = conteos.rows[0] as { usuarios: number; admins: number; tableros: number };
    return {
      baseDatos,
      esquemaAplicado: true,
      adminExiste: fila.admins > 0,
      usuarios: fila.usuarios,
      tableros: fila.tableros,
    };
  }

  /** Siembra el PRIMER admin del portal de usuario de la organización. */
  async sembrarAdmin(orgId: number, dto: SembrarAdminDto, actor: Actor) {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const existente = await pool.query(
      `SELECT count(*)::int AS admins FROM portal.usuarios WHERE es_admin`,
    );
    if ((existente.rows[0] as { admins: number }).admins > 0) {
      throw new ConflictException(
        'La organización ya tiene un admin; los demás usuarios los crea ella desde su portal',
      );
    }
    const hash = await argon2.hash(dto.password);
    const insertado = await pool.query(
      `INSERT INTO portal.usuarios (email, nombre, hash_password, es_admin)
       VALUES ($1, $2, $3, true)
       RETURNING id, email, nombre`,
      [dto.email.toLowerCase(), dto.nombre, hash],
    );
    const usuario = insertado.rows[0] as { id: number; email: string; nombre: string };
    await pool.query(
      `INSERT INTO portal.auditoria (usuario_email, accion, entidad, entidad_id, despues, ip)
       VALUES ($1, 'siembra_admin', 'usuarios', $2, $3, $4)`,
      [actor.email, String(usuario.id), JSON.stringify(usuario), actor.ip ?? null],
    );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'siembra_admin',
      entidad: 'portal_usuarios',
      entidadId: `${orgId}:${usuario.id}`,
      antes: null,
      despues: usuario,
    });
    return usuario;
  }

  // --- Tableros (URLs de Publish to Web, alta del proveedor) ---

  async listarTableros(orgId: number): Promise<TableroPortal[]> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_TABLERO} FROM portal.tableros ORDER BY orden, id`,
    );
    return resultado.rows as TableroPortal[];
  }

  async crearTablero(orgId: number, dto: CrearTableroDto, actor: Actor): Promise<TableroPortal> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const resultado = await pool.query(
      `INSERT INTO portal.tableros (clave, nombre, descripcion, url_publica, orden, activo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNAS_TABLERO}`,
      [dto.clave, dto.nombre, dto.descripcion ?? null, dto.urlPublica, dto.orden, dto.activo],
    );
    const tablero = resultado.rows[0] as TableroPortal;
    await this.auditarTablero(pool, orgId, actor, 'crear', tablero.id, null, tablero);
    return tablero;
  }

  async actualizarTablero(
    orgId: number,
    tableroId: number,
    dto: ActualizarTableroDto,
    actor: Actor,
  ): Promise<TableroPortal> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const antes = await this.obtenerTablero(pool, tableroId);
    const resultado = await pool.query(
      `UPDATE portal.tableros
          SET nombre       = COALESCE($2, nombre),
              descripcion  = COALESCE($3, descripcion),
              url_publica  = COALESCE($4, url_publica),
              orden        = COALESCE($5, orden),
              activo       = COALESCE($6, activo),
              actualizado_en = now()
        WHERE id = $1
        RETURNING ${COLUMNAS_TABLERO}`,
      [
        tableroId,
        dto.nombre ?? null,
        dto.descripcion ?? null,
        dto.urlPublica ?? null,
        dto.orden ?? null,
        dto.activo ?? null,
      ],
    );
    const tablero = resultado.rows[0] as TableroPortal;
    await this.auditarTablero(pool, orgId, actor, 'actualizar', tableroId, antes, tablero);
    return tablero;
  }

  async eliminarTablero(orgId: number, tableroId: number, actor: Actor): Promise<void> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const antes = await this.obtenerTablero(pool, tableroId);
    await pool.query(`DELETE FROM portal.tableros WHERE id = $1`, [tableroId]);
    await this.auditarTablero(pool, orgId, actor, 'eliminar', tableroId, antes, null);
  }

  private async obtenerTablero(pool: Pool, tableroId: number): Promise<TableroPortal> {
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_TABLERO} FROM portal.tableros WHERE id = $1`,
      [tableroId],
    );
    const tablero = resultado.rows[0] as TableroPortal | undefined;
    if (!tablero) throw new NotFoundException(`Tablero ${tableroId} no encontrado`);
    return tablero;
  }

  /** Auditoría doble: en la base del tenant (portal) y en la de control (gobierno). */
  private async auditarTablero(
    pool: Pool,
    orgId: number,
    actor: Actor,
    accion: string,
    tableroId: number,
    antes: TableroPortal | null,
    despues: TableroPortal | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO portal.auditoria (usuario_email, accion, entidad, entidad_id, antes, despues, ip)
       VALUES ($1, $2, 'tableros', $3, $4, $5, $6)`,
      [
        actor.email,
        accion,
        String(tableroId),
        antes ? JSON.stringify(antes) : null,
        despues ? JSON.stringify(despues) : null,
        actor.ip ?? null,
      ],
    );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion,
      entidad: 'portal_tableros',
      entidadId: `${orgId}:${tableroId}`,
      antes,
      despues,
    });
  }
}
