/**
 * Administración del PORTAL DE USUARIO de cada tenant desde el plano de control:
 * estado del esquema `portal`, siembra del primer admin de la organización y alta
 * de tableros (URLs de Publish to Web). Opera sobre la base del tenant vía
 * TenantDbService; cada mutación queda auditada en gobierno.auditoria (control)
 * y en portal.auditoria (tenant).
 */
import { createHash, randomBytes } from 'node:crypto';

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
import { ActualizarTableroDto, CrearTableroDto, RotarEnlaceDto, SembrarAdminDto } from './portal-org.dto';

/** Vida del ticket de impersonación: lo justo para abrir la pestaña, no una credencial. */
const VIDA_TICKET_MS = 2 * 60 * 1000;

export interface TableroPortal {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  urlPublica: string;
  orden: number;
  activo: boolean;
  mostrarBarra: boolean;
  grupo: string | null;
}

/** Un código de Publish to Web (`r=`) en uso por los tableros de la organización. */
export interface EnlacePublico {
  /** Abreviatura del código: identifica el enlace sin repetirlo completo en pantalla. */
  huella: string;
  tableros: number;
  activos: number;
  /** Última rotación registrada; si nunca se rotó, el alta del tablero más antiguo que lo usa. */
  vigenteDesde: string;
  diasVigente: number;
}

export interface ResultadoRotacion {
  huellaAnterior: string;
  huellaNueva: string;
  tablerosActualizados: number;
}

/** Código `r=` tal como está escrito en la URL (sin decodificar: se reemplaza literal). */
const CODIGO_R = /[?&]r=([^&#]+)/;

function codigoDe(url: string): string | null {
  return CODIGO_R.exec(url)?.[1] ?? null;
}

/**
 * Huella del código: SHA-256 abreviado. Los códigos de Power BI son JSON en base64 y todos
 * empiezan y terminan casi igual (`eyJrIjoi…`), así que recortarlos no los distingue.
 */
function huellaDe(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex').slice(0, 10);
}

const COLUMNAS_TABLERO = `id, clave, nombre, descripcion, modulo,
  url_publica AS "urlPublica", orden, activo, mostrar_barra AS "mostrarBarra", grupo`;

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
      organizacionId: orgId,
      accion: 'siembra_admin',
      entidad: 'portal_usuarios',
      entidadId: `${orgId}:${usuario.id}`,
      antes: null,
      despues: usuario,
    });
    return usuario;
  }

  // --- Impersonación (soporte) ---

  /** Usuarios del portal de la organización, para elegir a quién ver. */
  async listarUsuariosPortal(orgId: number) {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const resultado = await pool.query(
      `SELECT id, email, nombre, es_admin AS "esAdmin", activo
         FROM portal.usuarios
        ORDER BY nombre`,
    );
    return resultado.rows as unknown[];
  }

  /**
   * Emite un ticket de un solo uso para ver el portal como un usuario concreto.
   *
   * No devuelve ni conoce su contraseña: el portal de usuario canjea el ticket por
   * una sesión SUYA, marcada como suplantada y de solo lectura. Se guarda el hash
   * del ticket —no el ticket— para que leer la tabla no sirva de nada, y vive dos
   * minutos: es un pase para abrir la pestaña, no una credencial.
   *
   * @throws 404 si la organización o el usuario no existen · 400 si está inactivo
   */
  async emitirImpersonacion(orgId: number, usuarioId: number, actor: Actor) {
    const org = await this.organizaciones.obtener(orgId);
    const { pool } = await this.poolDeOrganizacion(orgId);

    const objetivo = await pool.query(
      `SELECT id, email, nombre, activo FROM portal.usuarios WHERE id = $1`,
      [usuarioId],
    );
    const usuario = objetivo.rows[0] as
      | { id: number; email: string; nombre: string; activo: boolean }
      | undefined;
    if (!usuario) throw new NotFoundException(`Usuario ${usuarioId} no encontrado`);
    if (!usuario.activo) {
      throw new BadRequestException(
        `«${usuario.email}» está inactivo: reactívalo antes de ver el portal como él.`,
      );
    }

    const ticket = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(ticket).digest('hex');
    const expiraEn = new Date(Date.now() + VIDA_TICKET_MS);

    await pool.query(
      `INSERT INTO portal.impersonaciones (token_hash, usuario_id, emitido_por, expira_en, ip_emisor)
       VALUES ($1, $2, $3, $4, $5)`,
      [tokenHash, usuarioId, actor.email, expiraEn, actor.ip ?? null],
    );
    await pool.query(
      `INSERT INTO portal.auditoria (usuario_email, accion, entidad, entidad_id, despues, ip)
       VALUES ($1, 'impersonar', 'usuarios', $2, $3, $4)`,
      [
        actor.email,
        String(usuarioId),
        JSON.stringify({ email: usuario.email, emitidoPor: actor.email }),
        actor.ip ?? null,
      ],
    );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: orgId,
      accion: 'impersonar',
      entidad: 'portal_usuarios',
      entidadId: `${orgId}:${usuarioId}`,
      antes: null,
      despues: { email: usuario.email, expiraEn },
    });

    return {
      ticket,
      hashTenant: org.hashTenant,
      usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      expiraEn: expiraEn.toISOString(),
    };
  }

  /**
   * Restablece la contraseña de un usuario del portal de la organización —incluido
   * su admin, que no tiene a nadie arriba que lo haga—. Genera una temporal, fuerza
   * el cambio en el siguiente ingreso y la devuelve UNA sola vez: no se guarda ni
   * se audita en claro.
   *
   * @throws 404 si la organización o el usuario no existen
   */
  async restablecerPassword(orgId: number, usuarioId: number, actor: Actor) {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const temporal = randomBytes(9).toString('base64url'); // 12 caracteres
    const hash = await argon2.hash(temporal);
    const actualizado = await pool.query(
      `UPDATE portal.usuarios
          SET hash_password = $1, debe_cambiar_password = true, actualizado_en = now()
        WHERE id = $2
        RETURNING id, email, nombre`,
      [hash, usuarioId],
    );
    const usuario = actualizado.rows[0] as { id: number; email: string; nombre: string } | undefined;
    if (!usuario) throw new NotFoundException(`Usuario ${usuarioId} no encontrado`);

    await pool.query(
      `INSERT INTO portal.auditoria (usuario_email, accion, entidad, entidad_id, despues, ip)
       VALUES ($1, 'restablecer_password', 'usuarios', $2, $3, $4)`,
      [actor.email, String(usuarioId), JSON.stringify({ email: usuario.email }), actor.ip ?? null],
    );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: orgId,
      accion: 'restablecer_password',
      entidad: 'portal_usuarios',
      entidadId: `${orgId}:${usuarioId}`,
      antes: null,
      despues: { email: usuario.email },
    });
    return { email: usuario.email, passwordTemporal: temporal };
  }

  // --- Tableros (URLs de Publish to Web, alta del proveedor) ---

  async listarTableros(orgId: number): Promise<TableroPortal[]> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const resultado = await pool.query(
      `SELECT ${COLUMNAS_TABLERO} FROM portal.tableros ORDER BY orden, id`,
    );
    return resultado.rows as TableroPortal[];
  }

  /**
   * Códigos de Publish to Web en uso, con su antigüedad. Sirve para decidir cuándo rotar: un
   * vínculo copiado del navegador sirve hasta que se elimina su código en Power BI.
   * @returns un elemento por código distinto (normalmente uno: todas las hojas del reporte)
   */
  async listarEnlaces(orgId: number): Promise<EnlacePublico[]> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const tableros = await pool.query<{ url: string; activo: boolean; creado: Date }>(
      `SELECT url_publica AS url, activo, creado_en AS creado FROM portal.tableros`,
    );
    const rotaciones = await pool.query<{ huella: string; cuando: Date }>(
      `SELECT despues->>'huella' AS huella, max(ocurrido_en) AS cuando
         FROM portal.auditoria
        WHERE entidad = 'tableros' AND accion = 'rotar_enlace'
        GROUP BY 1`,
    );
    const ultimaRotacion = new Map(rotaciones.rows.map((f) => [f.huella, f.cuando]));
    const porCodigo = new Map<string, { tableros: number; activos: number; masAntiguo: Date }>();
    for (const t of tableros.rows) {
      const codigo = codigoDe(t.url);
      if (!codigo) continue;
      const g = porCodigo.get(codigo) ?? { tableros: 0, activos: 0, masAntiguo: t.creado };
      g.tableros++;
      if (t.activo) g.activos++;
      if (t.creado < g.masAntiguo) g.masAntiguo = t.creado;
      porCodigo.set(codigo, g);
    }
    const ahora = Date.now();
    return [...porCodigo.entries()]
      .map(([codigo, g]) => {
        const huella = huellaDe(codigo);
        const desde = ultimaRotacion.get(huella) ?? g.masAntiguo;
        return {
          huella,
          tableros: g.tableros,
          activos: g.activos,
          vigenteDesde: desde.toISOString(),
          diasVigente: Math.floor((ahora - desde.getTime()) / 86_400_000),
        };
      })
      .sort((a, b) => b.activos - a.activos);
  }

  /**
   * Rota el vínculo público: reemplaza el código `r=` en TODOS los tableros que lo usan (cada
   * hoja conserva su `&pageName=`), en una transacción y con una sola entrada de auditoría.
   * Orden recomendado: generar el código nuevo en Power BI, rotar aquí y recién entonces
   * eliminar el viejo en Power BI (así no hay minutos sin tablero).
   * @param dto.urlNueva URL de Publish to Web recién generada (solo se usa su `r=`)
   * @param dto.huellaActual qué código reemplazar si la organización usa más de uno
   * @returns huellas anterior/nueva y cuántos tableros cambiaron
   * @throws BadRequestException sin tableros, código igual al actual o huella ambigua/inexistente
   */
  async rotarEnlace(orgId: number, dto: RotarEnlaceDto, actor: Actor): Promise<ResultadoRotacion> {
    const codigoNuevo = codigoDe(dto.urlNueva);
    if (!codigoNuevo) throw new BadRequestException('La URL no trae el código r= de Publish to Web');
    const { pool } = await this.poolDeOrganizacion(orgId);
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const filas = await cliente.query<{ id: number; url: string }>(
        `SELECT id, url_publica AS url FROM portal.tableros FOR UPDATE`,
      );
      const codigos = new Set(filas.rows.map((f) => codigoDe(f.url)).filter((c): c is string => !!c));
      let codigoActual: string | undefined;
      if (dto.huellaActual) {
        codigoActual = [...codigos].find((c) => huellaDe(c) === dto.huellaActual);
        if (!codigoActual) throw new BadRequestException('Ningún tablero usa ese enlace');
      } else if (codigos.size === 1) {
        codigoActual = [...codigos][0];
      } else if (codigos.size === 0) {
        throw new BadRequestException('La organización no tiene tableros con enlace de Publish to Web');
      } else {
        throw new BadRequestException('Hay más de un enlace en uso: indica cuál rotar (huellaActual)');
      }
      if (codigoActual === codigoNuevo) {
        throw new BadRequestException('La URL nueva trae el mismo código que el actual: genera uno nuevo en Power BI');
      }
      const actual = codigoActual;
      const afectados = filas.rows.filter((f) => codigoDe(f.url) === actual);
      for (const f of afectados) {
        await cliente.query(
          `UPDATE portal.tableros SET url_publica = $2, actualizado_en = now() WHERE id = $1`,
          [f.id, f.url.replace(`r=${actual}`, `r=${codigoNuevo}`)],
        );
      }
      const resultado: ResultadoRotacion = {
        huellaAnterior: huellaDe(actual),
        huellaNueva: huellaDe(codigoNuevo),
        tablerosActualizados: afectados.length,
      };
      // Solo huellas en la auditoría: el código completo es la credencial del reporte.
      await cliente.query(
        `INSERT INTO portal.auditoria (usuario_email, accion, entidad, entidad_id, antes, despues, ip)
         VALUES ($1, 'rotar_enlace', 'tableros', $2, $3, $4, $5)`,
        [
          actor.email,
          afectados.map((f) => f.id).join(','),
          JSON.stringify({ huella: resultado.huellaAnterior }),
          JSON.stringify({ huella: resultado.huellaNueva, tableros: afectados.length }),
          actor.ip ?? null,
        ],
      );
      await cliente.query('COMMIT');
      await this.auditoria.registrar({
        usuarioId: actor.id,
        usuarioEmail: actor.email,
        ip: actor.ip,
        organizacionId: orgId,
        accion: 'rotar_enlace',
        entidad: 'portal_tableros',
        entidadId: `${orgId}:*`,
        antes: { huella: resultado.huellaAnterior },
        despues: { huella: resultado.huellaNueva, tableros: afectados.length },
      });
      return resultado;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async crearTablero(orgId: number, dto: CrearTableroDto, actor: Actor): Promise<TableroPortal> {
    const { pool } = await this.poolDeOrganizacion(orgId);
    const resultado = await pool.query(
      `INSERT INTO portal.tableros (clave, nombre, descripcion, url_publica, orden, activo, mostrar_barra, grupo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNAS_TABLERO}`,
      [dto.clave, dto.nombre, dto.descripcion ?? null, dto.urlPublica, dto.orden, dto.activo, dto.mostrarBarra, dto.grupo ?? null],
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
              mostrar_barra = COALESCE($7, mostrar_barra),
              -- grupo admite volver a NULL: se aplica solo si vino en el body ($8).
              grupo        = CASE WHEN $8 THEN $9 ELSE grupo END,
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
        dto.mostrarBarra ?? null,
        dto.grupo !== undefined,
        dto.grupo ?? null,
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
      organizacionId: orgId,
      accion,
      entidad: 'portal_tableros',
      entidadId: `${orgId}:${tableroId}`,
      antes,
      despues,
    });
  }
}
