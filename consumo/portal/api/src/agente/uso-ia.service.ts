/**
 * Costo del asistente por usuario (sesión 37, pedido de Edwin): cada turno del chat deja
 * una fila en `portal.uso_ia` con los tokens de todas las llamadas al modelo (compuerta +
 * agente) y su costo estimado en USD. Lo lee SOLO el administrador de la organización
 * (Administración → Uso de IA) para ver cuánto gasta cada usuario y cada perfil y decidir
 * cuándo recargar su saldo de Anthropic. El usuario nunca lo ve.
 *
 * La tarifa vive en el servidor (`AGENTE_PRECIOS_USD`, JSON por modelo, USD por millón de
 * tokens) con valores por defecto para los modelos conocidos. Registrar nunca bloquea la
 * respuesta: si falla, se registra en el log y el chat sigue.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { UsoModelo } from '@quilate/agente';

import { UsuarioPortal } from '../auth/tipos';
import type { Env } from '../config/env';

/** USD por millón de tokens. `cacheLectura`/`cacheEscritura` opcionales: 10 % y 125 % de entrada si faltan. */
export interface TarifaModelo {
  entrada: number;
  salida: number;
  cacheLectura?: number;
  cacheEscritura?: number;
}

/** Tarifas de referencia (API de Anthropic, 2026-10). Se sobreescriben por modelo con AGENTE_PRECIOS_USD. */
const TARIFAS_BASE: Record<string, TarifaModelo> = {
  'claude-fable-5-1': { entrada: 10, salida: 50, cacheLectura: 0.25 },
  'claude-fable-5': { entrada: 10, salida: 50 },
  'claude-opus-5-5': { entrada: 4, salida: 20, cacheLectura: 0.2 },
  'claude-opus-5': { entrada: 5, salida: 25, cacheLectura: 0.5 },
  'claude-opus-4-8': { entrada: 5, salida: 25 },
  'claude-opus-4-7': { entrada: 5, salida: 25 },
  'claude-opus-4-6': { entrada: 5, salida: 25 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cacheLectura: 0.2 },
  'claude-sonnet-5': { entrada: 2, salida: 10 },
  'claude-sonnet-4-6': { entrada: 3, salida: 15 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
  'claude-haiku-4-5': { entrada: 1, salida: 5 },
};

export interface UsoPorUsuario {
  usuarioId: number;
  nombre: string;
  email: string;
  activo: boolean;
  perfiles: string[];
  turnos: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  ultimoUso: string | null;
}

export interface UsoPorPerfil {
  perfilId: number;
  nombre: string;
  usuarios: number;
  costoUsd: number;
}

export interface ResumenUsoIa {
  /** Mes consultado (YYYY-MM) en la zona del negocio. */
  mes: string;
  costoMesUsd: number;
  turnosMes: number;
  costoAcumuladoUsd: number;
  porUsuario: UsoPorUsuario[];
  porPerfil: UsoPorPerfil[];
  /** Serie diaria del mes para la gráfica. */
  porDia: { dia: string; costoUsd: number; turnos: number }[];
  /** Tarifa vigente por modelo, para que el admin sepa con qué se calculó. */
  tarifas: Record<string, TarifaModelo>;
}

@Injectable()
export class UsoIaService {
  private readonly log = new Logger(UsoIaService.name);
  private readonly tarifas: Record<string, TarifaModelo>;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.tarifas = { ...TARIFAS_BASE, ...this.config.get('AGENTE_PRECIOS_USD', { infer: true }) };
  }

  /** Costo en USD de una llamada según la tarifa del modelo (0 si el modelo no tiene tarifa: se avisa en el log una vez). */
  costoDe(uso: UsoModelo): number {
    const t = this.tarifas[uso.modelo];
    if (!t) {
      this.avisarSinTarifa(uso.modelo);
      return 0;
    }
    const lectura = t.cacheLectura ?? t.entrada * 0.1;
    const escritura = t.cacheEscritura ?? t.entrada * 1.25;
    return (
      (uso.tokensEntrada * t.entrada +
        uso.tokensSalida * t.salida +
        uso.tokensCacheLectura * lectura +
        uso.tokensCacheEscritura * escritura) /
      1_000_000
    );
  }

  private readonly avisados = new Set<string>();
  private avisarSinTarifa(modelo: string): void {
    if (this.avisados.has(modelo)) return;
    this.avisados.add(modelo);
    this.log.warn(`Sin tarifa para el modelo ${modelo}: su costo se registra como 0. Agregalo en AGENTE_PRECIOS_USD.`);
  }

  /** Persiste el consumo de un turno. Nunca lanza: el chat no se rompe por la contabilidad. */
  async registrar(pool: Pool, usuario: UsuarioPortal, conversacionId: number, uso: UsoModelo[]): Promise<void> {
    if (!uso.length) return;
    const total = uso.reduce(
      (acc, u) => ({
        entrada: acc.entrada + u.tokensEntrada,
        salida: acc.salida + u.tokensSalida,
        lectura: acc.lectura + u.tokensCacheLectura,
        escritura: acc.escritura + u.tokensCacheEscritura,
        costo: acc.costo + this.costoDe(u),
      }),
      { entrada: 0, salida: 0, lectura: 0, escritura: 0, costo: 0 },
    );
    try {
      await pool.query(
        `INSERT INTO portal.uso_ia
           (usuario_id, conversacion_id, modelos, llamadas, tokens_entrada, tokens_salida,
            tokens_cache_lectura, tokens_cache_escritura, costo_usd, detalle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          usuario.id,
          conversacionId,
          [...new Set(uso.map((u) => u.modelo))],
          uso.length,
          total.entrada,
          total.salida,
          total.lectura,
          total.escritura,
          total.costo.toFixed(6),
          JSON.stringify(uso.map((u) => ({ ...u, costoUsd: Number(this.costoDe(u).toFixed(6)) }))),
        ],
      );
    } catch (e) {
      this.log.error(`No se pudo registrar el uso de IA del usuario ${usuario.id}: ${(e as Error).message}`);
    }
  }

  /** Mes en curso (YYYY-MM) en la zona horaria del negocio, no en UTC. */
  mesActual(ahora: Date = new Date()): string {
    const zona = this.config.get('ZONA_HORARIA', { infer: true });
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit' }).formatToParts(ahora);
    const v = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
    return `${v('year')}-${v('month')}`;
  }

  /**
   * Resumen para el administrador: mes elegido (YYYY-MM, zona del negocio) por usuario, por
   * perfil y por día, más el acumulado histórico. Un usuario con varios perfiles suma su costo
   * en cada uno de ellos (es lo que responde «cuánto gasta el perfil Ventas»).
   */
  async resumen(pool: Pool, mes: string): Promise<ResumenUsoIa> {
    const zona = this.config.get('ZONA_HORARIA', { infer: true });
    // Rango [inicio, fin) del mes en la zona del negocio, como timestamptz: comparar la columna
    // directo usa los índices por fecha (to_char sobre la columna obligaba a recorrer la tabla).
    const inicioMes = `((($1 || '-01')::date)::timestamp AT TIME ZONE $2)`;
    const finMes = `(((($1 || '-01')::date) + interval '1 month')::timestamp AT TIME ZONE $2)`;
    const filtroMes = `u.ocurrido_en >= ${inicioMes} AND u.ocurrido_en < ${finMes}`;

    const [usuarios, perfiles, dias, totales] = await Promise.all([
      pool.query(
        `SELECT us.id AS "usuarioId", us.nombre, us.email, us.activo,
                COALESCE((SELECT array_agg(p.nombre ORDER BY p.nombre)
                            FROM portal.usuario_perfiles up JOIN portal.perfiles p ON p.id = up.perfil_id
                           WHERE up.usuario_id = us.id), '{}') AS perfiles,
                count(u.id)::int AS turnos,
                COALESCE(sum(u.tokens_entrada + u.tokens_cache_lectura + u.tokens_cache_escritura), 0)::bigint AS "tokensEntrada",
                COALESCE(sum(u.tokens_salida), 0)::bigint AS "tokensSalida",
                COALESCE(sum(u.costo_usd), 0)::float AS "costoUsd",
                max(u.ocurrido_en) AS "ultimoUso"
           FROM portal.usuarios us
           LEFT JOIN portal.uso_ia u ON u.usuario_id = us.id AND ${filtroMes}
          GROUP BY us.id
         HAVING count(u.id) > 0
          ORDER BY "costoUsd" DESC, us.nombre`,
        [mes, zona],
      ),
      pool.query(
        `SELECT p.id AS "perfilId", p.nombre,
                count(DISTINCT u.usuario_id)::int AS usuarios,
                COALESCE(sum(u.costo_usd), 0)::float AS "costoUsd"
           FROM portal.perfiles p
           JOIN portal.usuario_perfiles up ON up.perfil_id = p.id
           JOIN portal.uso_ia u ON u.usuario_id = up.usuario_id AND ${filtroMes}
          GROUP BY p.id
          ORDER BY "costoUsd" DESC, p.nombre`,
        [mes, zona],
      ),
      pool.query(
        `SELECT to_char(u.ocurrido_en AT TIME ZONE $2, 'YYYY-MM-DD') AS dia,
                sum(u.costo_usd)::float AS "costoUsd", count(*)::int AS turnos
           FROM portal.uso_ia u
          WHERE ${filtroMes}
          GROUP BY 1 ORDER BY 1`,
        [mes, zona],
      ),
      pool.query(
        `SELECT COALESCE(sum(costo_usd), 0)::float AS acumulado,
                COALESCE(sum(u.costo_usd) FILTER (WHERE ${filtroMes}), 0)::float AS mes,
                count(*) FILTER (WHERE ${filtroMes})::int AS turnos
           FROM portal.uso_ia u`,
        [mes, zona],
      ),
    ]);
    const t = totales.rows[0] as { acumulado: number; mes: number; turnos: number };
    return {
      mes,
      costoMesUsd: t.mes,
      turnosMes: t.turnos,
      costoAcumuladoUsd: t.acumulado,
      porUsuario: usuarios.rows.map((r) => ({ ...(r as UsoPorUsuario), tokensEntrada: Number((r as UsoPorUsuario).tokensEntrada), tokensSalida: Number((r as UsoPorUsuario).tokensSalida) })),
      porPerfil: perfiles.rows as UsoPorPerfil[],
      porDia: dias.rows as ResumenUsoIa['porDia'],
      tarifas: this.tarifas,
    };
  }
}
