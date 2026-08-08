/** Lógica de negocio de organizaciones (tenants). Cada mutación queda auditada (§12). */
import { randomBytes } from 'node:crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { orgIdsVisibles } from '../common/acceso';
import { DB, DRIZZLE, PG_POOL } from '../db/drizzle.module';
import { organizaciones } from '../db/schema';
import { ActualizarOrganizacionDto, CrearOrganizacionDto, SubirLogoDto } from './organizacion.dto';

/**
 * Actor que ejecuta la acción (sesión fresca que puebla JwtAuthGuard).
 * `esGlobal`/`orgIds` alimentan el scoping por organización (exigirAccesoOrg):
 * quedan opcionales para no romper llamadas internas (bootstrap) que auditan sin sesión.
 */
export interface Actor {
  id: number | null;
  email: string | null;
  ip?: string | null;
  esGlobal?: boolean;
  orgIds?: number[];
}

/** Qué se retiró del metadata-store al dar de baja una organización. */
export interface ResultadoEliminacion {
  codigo: string;
  /** Filas borradas por entidad, para que el portal lo muestre y quede en auditoría. */
  borradas: Record<string, number>;
  /** Base del tenant que sigue viva: los datos NO se borran desde aquí. */
  baseDatosRemanente: string | null;
}

@Injectable()
export class OrganizacionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Organizaciones visibles para el actor: rol global = todas; si no, solo su membresía. */
  async listar(actor: Actor) {
    const ids = orgIdsVisibles(actor);
    if (ids === null) return this.db.select().from(organizaciones);
    if (ids.length === 0) return [];
    return this.db.select().from(organizaciones).where(inArray(organizaciones.id, ids));
  }

  async obtener(id: number) {
    const [org] = await this.db.select().from(organizaciones).where(eq(organizaciones.id, id));
    if (!org) throw new NotFoundException(`Organización ${id} no encontrada`);
    return org;
  }

  async crear(dto: CrearOrganizacionDto, actor: Actor) {
    // La base del plano de datos es obligatoria para el worker: si no viene, se deriva del
    // código. Crear la BD física y sus esquemas sigue siendo un paso de infraestructura
    // (createdb + schema/101), documentado en el runbook de onboarding.
    const valores = {
      ...dto,
      baseDatosDw: dto.baseDatosDw ?? `dw_${dto.codigo}`,
      // Identificador opaco de la URL de ingreso del portal de usuario (no adivinable,
      // no derivado del código). Rotarlo invalida la URL entregada al cliente.
      hashTenant: randomBytes(16).toString('hex'),
    };
    const [creada] = await this.db.insert(organizaciones).values(valores).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: creada.id,
      accion: 'crear',
      entidad: 'organizaciones',
      entidadId: String(creada.id),
      antes: null,
      despues: creada,
    });
    return creada;
  }

  async actualizar(id: number, dto: ActualizarOrganizacionDto, actor: Actor) {
    const antes = await this.obtener(id);
    const [actualizada] = await this.db
      .update(organizaciones)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(organizaciones.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: id,
      accion: 'actualizar',
      entidad: 'organizaciones',
      entidadId: String(id),
      antes,
      despues: actualizada,
    });
    return actualizada;
  }

  /**
   * Sube o reemplaza el logo del tenant (white-label del portal de usuario).
   * El binario se maneja con SQL directo para no arrastrarlo en los listados.
   */
  async subirLogo(id: number, dto: SubirLogoDto, actor: Actor) {
    const antes = await this.obtener(id);
    const binario = Buffer.from(dto.datosBase64, 'base64');
    if (binario.byteLength === 0 || binario.byteLength > 300 * 1024) {
      throw new Error('El logo debe pesar entre 1 byte y 300 KB');
    }
    // Los magic bytes deben coincidir con el MIME declarado: el binario se sirve
    // same-origin en el portal de usuario, así que nada que no sea imagen real.
    if (!this.magicBytesValidos(binario, dto.mime)) {
      throw new Error('El contenido del archivo no coincide con el tipo de imagen declarado');
    }
    await this.pool.query(
      `UPDATE gobierno.organizaciones
          SET logo = $1, logo_mime = $2, actualizado_en = now()
        WHERE id = $3`,
      [binario, dto.mime, id],
    );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: id,
      accion: 'actualizar',
      entidad: 'organizaciones_logo',
      entidadId: String(id),
      antes: { logoMime: antes.logoMime },
      despues: { logoMime: dto.mime, bytes: binario.byteLength },
    });
    return { logoMime: dto.mime, bytes: binario.byteLength };
  }

  async eliminarLogo(id: number, actor: Actor): Promise<void> {
    const antes = await this.obtener(id);
    await this.pool.query(
      `UPDATE gobierno.organizaciones
          SET logo = NULL, logo_mime = NULL, actualizado_en = now()
        WHERE id = $1`,
      [id],
    );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: id,
      accion: 'eliminar',
      entidad: 'organizaciones_logo',
      entidadId: String(id),
      antes: { logoMime: antes.logoMime },
      despues: null,
    });
  }

  /** ¿El binario empieza con los magic bytes del MIME declarado? */
  private magicBytesValidos(binario: Buffer, mime: string): boolean {
    switch (mime) {
      case 'image/png':
        return binario.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      case 'image/jpeg':
        return binario.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
      case 'image/webp':
        return (
          binario.subarray(0, 4).toString('ascii') === 'RIFF' &&
          binario.subarray(8, 12).toString('ascii') === 'WEBP'
        );
      default:
        return false;
    }
  }

  /** Binario del logo (o null si el tenant no tiene). */
  async obtenerLogo(id: number): Promise<{ datos: Buffer; mime: string } | null> {
    await this.obtener(id); // 404 si la organización no existe
    const resultado = await this.pool.query<{ logo: Buffer | null; logo_mime: string | null }>(
      `SELECT logo, logo_mime FROM gobierno.organizaciones WHERE id = $1`,
      [id],
    );
    const fila = resultado.rows[0];
    if (!fila?.logo || !fila.logo_mime) return null;
    return { datos: fila.logo, mime: fila.logo_mime };
  }

  /**
   * Da de baja una organización y toda su configuración del metadata-store.
   *
   * `sociedades`, `conexiones` y `nits_afiliados` son RESTRICT en la base, así que
   * un DELETE plano fallaba con un error de llave foránea y la organización no se
   * podía retirar nunca desde el portal. El borrado se hace aquí en una sola
   * transacción, en orden de dependencia.
   *
   * NO se elimina la base de datos del tenant: son los datos del cliente y
   * borrarlos no puede ser efecto colateral de un clic. Se devuelve su nombre para
   * que quien opera decida.
   *
   * @param id organización a retirar
   * @returns qué se borró y qué base quedó viva
   * @throws 404 si la organización no existe
   */
  async eliminar(id: number, actor: Actor): Promise<ResultadoEliminacion> {
    const antes = await this.obtener(id);
    const cliente = await this.pool.connect();
    const borradas: Record<string, number> = {};
    try {
      await cliente.query('BEGIN');
      // Orden de dependencia: primero lo que apunta a sociedades/conexiones.
      for (const [etiqueta, sql] of [
        ['campos de ingesta', `DELETE FROM metadatos.campo_ingesta WHERE organizacion_id = $1`],
        ['planes de ingesta', `DELETE FROM metadatos.plan_ingesta WHERE organizacion_id = $1`],
        [
          'políticas de ingesta',
          `DELETE FROM metadatos.politica_ingesta WHERE organizacion_id = $1`,
        ],
        ['NITs afiliados', `DELETE FROM gobierno.nits_afiliados WHERE organizacion_id = $1`],
        ['roles de usuario', `DELETE FROM gobierno.usuario_roles WHERE organizacion_id = $1`],
        ['sociedades', `DELETE FROM gobierno.sociedades WHERE organizacion_id = $1`],
        ['conexiones', `DELETE FROM gobierno.conexiones WHERE organizacion_id = $1`],
      ] as const) {
        const r = await cliente.query(sql, [id]);
        if (r.rowCount) borradas[etiqueta] = r.rowCount;
      }
      await cliente.query(`DELETE FROM gobierno.organizaciones WHERE id = $1`, [id]);
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: id,
      accion: 'eliminar',
      entidad: 'organizaciones',
      entidadId: String(id),
      antes,
      despues: { borradas },
    });

    return {
      codigo: antes.codigo,
      borradas,
      baseDatosRemanente: antes.baseDatosDw ?? null,
    };
  }
}
