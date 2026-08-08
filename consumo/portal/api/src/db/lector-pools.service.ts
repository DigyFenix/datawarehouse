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
        max: 5,
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

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
    this.pools.clear();
  }
}
