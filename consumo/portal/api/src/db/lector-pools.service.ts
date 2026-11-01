/**
 * Pools de conexión hacia las bases de los tenants, con el rol de SOLO LECTURA
 * `portal_lector` (NOBYPASSRLS). Es la vía por la que el agente de IA lee
 * `oro.*` bajo RLS (CLAUDE.md §11 "RLS siempre"): SIN `set_config('app.empresas', …)`
 * el rol no ve ninguna fila (fail-closed), igual que documenta
 * `data-plane/transformacion/macros/aplicar_rls_oro.sql`.
 *
 * Deliberadamente separado de `TenantPoolsService` (que usa el usuario admin del
 * portal): un pool con menos privilegios no debe compartirse con el que sí puede
 * escribir usuarios/perfiles.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

import type { Env } from '../config/env';

const NOMBRE_BD_VALIDO = /^[a-z0-9_]+$/;

/** Consulta dentro de la transacción RLS abierta por `conTransaccion` (mismo cliente). */
export type ConsultarRls = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

@Injectable()
export class LectorPoolsService implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  private obtenerPool(baseDatosDw: string): Pool {
    if (!NOMBRE_BD_VALIDO.test(baseDatosDw)) {
      throw new Error(`Nombre de base de datos de tenant inválido: ${baseDatosDw}`);
    }
    // Falla al USARSE (no al arrancar): el resto de la API no depende del agente.
    const password = this.config.get('PORTAL_LECTOR_PASSWORD', { infer: true });
    if (!password) {
      throw new Error(
        'PORTAL_LECTOR_PASSWORD no está configurada: el agente de IA no puede leer el warehouse.',
      );
    }
    let pool = this.pools.get(baseDatosDw);
    if (!pool) {
      pool = new Pool({
        host: this.config.get('POSTGRES_HOST', { infer: true }),
        port: this.config.get('POSTGRES_PORT', { infer: true }),
        database: baseDatosDw,
        user: 'portal_lector',
        password,
        max: this.config.get('POSTGRES_POOL_MAX', { infer: true }),
        idleTimeoutMillis: 30_000,
      });
      this.pools.set(baseDatosDw, pool);
    }
    return pool;
  }

  /**
   * Ejecuta `fn` bajo el contexto RLS del usuario, en una única transacción con
   * el MISMO cliente: BEGIN → set_config('app.empresas', empresasCsv, true) →
   * fn(cliente) → COMMIT. `empresasCsv` es '*' (todas) o un CSV de empresa_id;
   * '' (vacío) es válido y deliberado: fail-closed, cero filas.
   */
  async ejecutarConRls<T>(
    baseDatos: string,
    empresasCsv: string,
    fn: (cliente: PoolClient) => Promise<T>,
  ): Promise<T> {
    const pool = this.obtenerPool(baseDatos);
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(`SELECT set_config('app.empresas', $1, true)`, [empresasCsv]);
      const resultado = await fn(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }

  /**
   * Una sola transacción RLS para TODO un turno (mensaje del chat, tablero, consulta guardada):
   * BEGIN + set_config UNA vez y `fn` recibe `consultar`, que reutiliza el mismo cliente. Antes
   * cada consulta abría la suya (connect + BEGIN + set_config + query + COMMIT = 4 viajes extra).
   *
   * Garantías:
   * - Las consultas se SERIALIZAN sobre el cliente (una cola interna), así que `fn` puede
   *   lanzarlas en paralelo (`Promise.all`) sin mezclar resultados.
   * - Si una consulta falla, la transacción queda abortada en Postgres; se reabre (ROLLBACK +
   *   BEGIN + set_config) antes de propagar el error. Así los `.catch(() => [])` deliberados del
   *   paquete del agente (tabla opcional ausente) no envenenan las consultas siguientes.
   * - El contexto RLS es `is_local = true`: muere con la transacción y nunca pasa al siguiente
   *   usuario del pool.
   */
  async conTransaccion<T>(
    baseDatos: string,
    empresasCsv: string,
    fn: (consultar: ConsultarRls) => Promise<T>,
  ): Promise<T> {
    const pool = this.obtenerPool(baseDatos);
    const cliente = await pool.connect();
    const abrir = async (): Promise<void> => {
      await cliente.query('BEGIN READ ONLY');
      await cliente.query(`SELECT set_config('app.empresas', $1, true)`, [empresasCsv]);
    };
    let cola: Promise<unknown> = Promise.resolve();
    let conexionRota = false;
    const consultar: ConsultarRls = (sql, params) => {
      const turno = cola.then(async () => {
        try {
          const resultado = await cliente.query(sql, params);
          return resultado.rows as Record<string, unknown>[];
        } catch (error) {
          try {
            await cliente.query('ROLLBACK');
            await abrir();
          } catch {
            // No se pudo reabrir: el cliente se descarta al final (no vuelve al pool).
            conexionRota = true;
          }
          throw error;
        }
      });
      // La cola sigue aunque una consulta falle: el error lo recibe quien la pidió.
      cola = turno.catch(() => undefined);
      return turno;
    };

    try {
      await abrir();
      const resultado = await fn(consultar);
      await cola;
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cola;
      await cliente.query('ROLLBACK').catch(() => {
        conexionRota = true;
      });
      throw error;
    } finally {
      cliente.release(conexionRota);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
    this.pools.clear();
  }
}
