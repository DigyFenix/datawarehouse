/**
 * Pools de conexión hacia las bases de los tenants (dw_<codigo>), cacheados por
 * base de datos. El API solo opera sobre el esquema `portal` de cada tenant.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import type { Env } from '../config/env';

const NOMBRE_BD_VALIDO = /^[a-z0-9_]+$/;

@Injectable()
export class TenantPoolsService implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly config: ConfigService<Env, true>) {}

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
        max: 5,
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
