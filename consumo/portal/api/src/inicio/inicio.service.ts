/**
 * Resumen de la pantalla de inicio: frescura del dato y accesos del usuario.
 *
 * La frescura sale de `oro.estado_carga`, que lleva DOS relojes por dominio:
 * cuándo corrió el pipeline y cuál es el dato más reciente del ERP. Al usuario
 * le importa el segundo — "¿hasta cuándo llegan mis números?" — así que es la
 * fecha que se muestra. El semáforo, en cambio, sale del primero y se calcula
 * aquí contra `now()` (ver `estadoFrescura`).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { proximaCarga, type ProximaCarga } from '../agente/frescura';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import type { Env } from '../config/env';

export type EstadoFrescura = 'Al día' | 'Atrasado' | 'Desactualizado';

export interface FrescuraDominio {
  dominio: string;
  fechaDatoMasReciente: string | null;
  estado: EstadoFrescura | null;
}

/**
 * Semáforo de frescura con los MISMOS umbrales que `oro.estado_carga` (estado_carga.sql),
 * pero calculado AHORA: la columna `estado_frescura` del modelo se congela en el build, así
 * que si el pipeline deja de correr seguiría diciendo «Al día» para siempre.
 * @param dias días calendario (zona del negocio) desde la última extracción
 */
export function estadoFrescura(dias: number): EstadoFrescura {
  if (dias <= 1) return 'Al día';
  if (dias <= 3) return 'Atrasado';
  return 'Desactualizado';
}

/** Orden explícito de gravedad: por dominio se informa el PEOR estado entre sus empresas. */
const GRAVEDAD: Record<EstadoFrescura, number> = { 'Al día': 0, Atrasado: 1, Desactualizado: 2 };

export interface ResumenInicio {
  frescura: FrescuraDominio[];
  /** Próxima carga programada del warehouse (null si no hay horario configurado). */
  proximaCarga: ProximaCarga | null;
  tableros: number;
  /** Últimos tableros que este usuario abrió (de su propia auditoría). */
  recientes: { clave: string; nombre: string; visto: string }[];
}

@Injectable()
export class InicioService {
  private readonly log = new Logger(InicioService.name);

  constructor(
    private readonly sesion: SesionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async resumen(usuario: UsuarioPortal): Promise<ResumenInicio> {
    const { pool } = await this.sesion.contexto(usuario.hash);

    const zona = this.config.get('ZONA_HORARIA', { infer: true });
    let frescura: FrescuraDominio[] = [];
    try {
      // Una fila por (empresa, dominio); los días se cuentan en la zona del negocio.
      const r = await pool.query<{ dominio: string; fecha: string | null; dias: number | null }>(
        `SELECT dominio,
                fecha_dato_mas_reciente::text AS fecha,
                ((now() AT TIME ZONE $1)::date - (ultima_extraccion AT TIME ZONE $1)::date)::int AS dias
           FROM oro.estado_carga`,
        [zona],
      );
      const porDominio = new Map<string, FrescuraDominio>();
      for (const f of r.rows) {
        // Sin extracción registrada no se puede afirmar que esté al día.
        const estado = f.dias === null ? 'Desactualizado' : estadoFrescura(f.dias);
        const actual = porDominio.get(f.dominio);
        if (!actual) {
          porDominio.set(f.dominio, { dominio: f.dominio, fechaDatoMasReciente: f.fecha, estado });
          continue;
        }
        if (f.fecha && (!actual.fechaDatoMasReciente || f.fecha > actual.fechaDatoMasReciente)) {
          actual.fechaDatoMasReciente = f.fecha;
        }
        if (actual.estado === null || GRAVEDAD[estado] > GRAVEDAD[actual.estado]) actual.estado = estado;
      }
      frescura = [...porDominio.values()].sort((a, b) => a.dominio.localeCompare(b.dominio));
    } catch (e) {
      // La tabla puede no existir aún en un tenant recién provisionado: Inicio no se rompe.
      this.log.warn(`Frescura no disponible: ${(e as Error).message}`);
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
    // ocurrido_en sale como timestamptz (ISO con zona al serializar): el texto de Postgres
    // («2026-10-31 14:05:00.123-06») no lo parsea DatePipe en Firefox/Safari.
    const recientes = await pool.query<{ clave: string; nombre: string; visto: Date }>(
      `SELECT t.clave, t.nombre, max(a.ocurrido_en) AS visto
         FROM portal.auditoria a
         JOIN portal.tableros t ON t.id::text = a.entidad_id
        WHERE a.usuario_id = $1 AND a.accion = 'ver_tablero' AND a.entidad = 'tableros' AND t.activo
        GROUP BY t.clave, t.nombre
        ORDER BY max(a.ocurrido_en) DESC
        LIMIT 4`,
      [usuario.id],
    );

    return {
      frescura,
      proximaCarga: proximaCarga(this.config.get('HORAS_CARGA', { infer: true }), this.config.get('ZONA_HORARIA', { infer: true })),
      tableros: Number(tableros.rows[0]?.n ?? 0),
      recientes: recientes.rows.map((f) => ({ clave: f.clave, nombre: f.nombre, visto: f.visto.toISOString() })),
    };
  }
}
