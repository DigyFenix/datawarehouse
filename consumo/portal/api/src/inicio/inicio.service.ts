/**
 * Resumen de la pantalla de inicio: frescura del dato y accesos del usuario.
 *
 * La frescura sale de `oro.estado_carga`, que lleva DOS relojes por dominio:
 * cuándo corrió el pipeline y cuál es el dato más reciente del ERP. Al usuario
 * le importa el segundo — "¿hasta cuándo llegan mis números?" — así que es el
 * que se muestra.
 */
import { Injectable } from '@nestjs/common';

import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';

export interface FrescuraDominio {
  dominio: string;
  fechaDatoMasReciente: string | null;
  estado: string | null;
}

export interface ResumenInicio {
  frescura: FrescuraDominio[];
  tableros: number;
  /** Últimos tableros que este usuario abrió (de su propia auditoría). */
  recientes: { clave: string; nombre: string; visto: string }[];
}

@Injectable()
export class InicioService {
  constructor(private readonly sesion: SesionService) {}

  async resumen(usuario: UsuarioPortal): Promise<ResumenInicio> {
    const { pool } = await this.sesion.contexto(usuario.hash);

    // La tabla puede no existir aún en un tenant recién provisionado: la
    // pantalla de inicio no debe romperse por eso.
    let frescura: FrescuraDominio[] = [];
    try {
      const r = await pool.query<{ dominio: string; fecha: string | null; estado: string | null }>(
        `SELECT dominio,
                max(fecha_dato_mas_reciente)::text AS fecha,
                min(estado_frescura)               AS estado
           FROM oro.estado_carga
          GROUP BY dominio
          ORDER BY dominio`,
      );
      frescura = r.rows.map((f) => ({
        dominio: f.dominio,
        fechaDatoMasReciente: f.fecha,
        estado: f.estado,
      }));
    } catch {
      frescura = [];
    }

    const tableros = await pool.query<{ n: string }>(
      usuario.esAdmin
        ? `SELECT count(*)::text AS n FROM portal.tableros WHERE activo`
        : `SELECT count(DISTINCT t.id)::text AS n
             FROM portal.tableros t
             JOIN portal.perfil_tableros pt ON pt.tablero_id = t.id
             JOIN portal.usuario_perfiles up ON up.perfil_id = pt.perfil_id
            WHERE up.usuario_id = $1 AND t.activo`,
      usuario.esAdmin ? [] : [usuario.id],
    );

    // Los últimos tableros vistos salen de la auditoría del propio usuario:
    // es el registro que ya existe, sin tabla nueva ni doble escritura.
    const recientes = await pool.query<{ clave: string; nombre: string; visto: string }>(
      `SELECT DISTINCT ON (t.clave) t.clave, t.nombre, max(a.ocurrido_en)::text AS visto
         FROM portal.auditoria a
         JOIN portal.tableros t ON t.id::text = a.entidad_id
        WHERE a.usuario_id = $1 AND a.accion = 'ver_tablero' AND t.activo
        GROUP BY t.clave, t.nombre
        ORDER BY t.clave, visto DESC
        LIMIT 4`,
      [usuario.id],
    );

    return {
      frescura,
      tableros: Number(tableros.rows[0]?.n ?? 0),
      recientes: recientes.rows,
    };
  }
}
