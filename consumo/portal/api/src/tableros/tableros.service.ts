/**
 * Tableros visibles para el usuario según sus perfiles. La URL pública de
 * Publish to Web NUNCA viaja en el listado: solo se entrega al abrir el visor
 * (detalle por clave) y cada apertura queda auditada (ver_tablero).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';

export interface TableroResumen {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  orden: number;
}

@Injectable()
export class TablerosService {
  constructor(
    private readonly sesion: SesionService,
    private readonly auditoria: AuditoriaPortalService,
  ) {}

  /** Listado SIN url_publica. El admin de la org ve todos los tableros activos. */
  async listar(usuario: UsuarioPortal): Promise<TableroResumen[]> {
    const { pool } = await this.sesion.contexto(usuario.hash);
    const resultado = usuario.esAdmin
      ? await pool.query(
          `SELECT id, clave, nombre, descripcion, modulo, orden
             FROM portal.tableros
            WHERE activo
            ORDER BY orden, id`,
        )
      : await pool.query(
          `SELECT DISTINCT t.id, t.clave, t.nombre, t.descripcion, t.modulo, t.orden
             FROM portal.tableros t
             JOIN portal.perfil_tableros pt ON pt.tablero_id = t.id
             JOIN portal.usuario_perfiles up ON up.perfil_id = pt.perfil_id
             JOIN portal.perfiles p ON p.id = pt.perfil_id AND p.activo
            WHERE t.activo AND up.usuario_id = $1
            ORDER BY t.orden, t.id`,
          [usuario.id],
        );
    return resultado.rows as TableroResumen[];
  }

  /**
   * Detalle CON url_publica, solo si el usuario tiene acceso por perfil (o es
   * admin). 404 genérico si no existe o no está autorizado (no distinguir).
   */
  async abrir(usuario: UsuarioPortal, clave: string, ip: string | null) {
    const { pool } = await this.sesion.contexto(usuario.hash);
    const resultado = usuario.esAdmin
      ? await pool.query(
          `SELECT id, clave, nombre, descripcion, modulo, orden,
                  url_publica AS "urlPublica"
             FROM portal.tableros
            WHERE activo AND clave = $1`,
          [clave],
        )
      : await pool.query(
          `SELECT DISTINCT t.id, t.clave, t.nombre, t.descripcion, t.modulo, t.orden,
                  t.url_publica AS "urlPublica"
             FROM portal.tableros t
             JOIN portal.perfil_tableros pt ON pt.tablero_id = t.id
             JOIN portal.usuario_perfiles up ON up.perfil_id = pt.perfil_id
             JOIN portal.perfiles p ON p.id = pt.perfil_id AND p.activo
            WHERE t.activo AND t.clave = $1 AND up.usuario_id = $2`,
          [clave, usuario.id],
        );
    const tablero = resultado.rows[0] as (TableroResumen & { urlPublica: string }) | undefined;
    if (!tablero) throw new NotFoundException('Tablero no encontrado');
    await this.auditoria.registrar(pool, {
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      accion: 'ver_tablero',
      entidad: 'tableros',
      entidadId: String(tablero.id),
      despues: { clave: tablero.clave },
      ip,
    });
    return tablero;
  }
}
