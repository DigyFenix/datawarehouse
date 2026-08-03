/**
 * Pools de conexión hacia las bases de datos de los TENANTS (dw_<codigo>).
 * El plano de control solo los usa para administrar el esquema `portal` del
 * portal de usuario (tableros, siembra del admin); nunca toca bronce/plata/oro.
 * Mismo clúster Postgres que la base de control: solo cambia `database`.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import type { Env } from '../config/env';

const NOMBRE_BD_VALIDO = /^[a-z0-9_]+$/;

@Injectable()
export class TenantDbService implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Pool hacia la base del tenant (cacheado). Lanza si el nombre no es seguro. */
  obtenerPool(baseDatosDw: string): Pool {
    if (!NOMBRE_BD_VALIDO.test(baseDatosDw)) {
      throw new Error(`Nombre de base de datos de tenant inválido: ${baseDatosDw}`);
    }
    let pool = this.pools.get(baseDatosDw);
    if (!pool) {
      pool = new Pool({
        host: this.config.get('POSTGRES_HOST', { infer: true }),
        port: this.config.get('POSTGRES_PORT', { infer: true }),
        database: baseDatosDw,
        user: this.config.get('POSTGRES_USER', { infer: true }),
        password: this.config.get('POSTGRES_PASSWORD', { infer: true }),
        max: 3,
        idleTimeoutMillis: 30_000,
      });
      this.pools.set(baseDatosDw, pool);
    }
    return pool;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
    this.pools.clear();
  }
}
