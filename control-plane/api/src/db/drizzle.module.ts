/**
 * Módulo global de acceso a Postgres (metadata-store) vía Drizzle.
 * Expone el token DRIZZLE para inyectar el cliente tipado en cualquier servicio.
 */
import { Global, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../config/env';
import { schema } from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

export type DB = NodePgDatabase<typeof schema>;

const poolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    new Pool({
      host: config.get('POSTGRES_HOST', { infer: true }),
      port: config.get('POSTGRES_PORT', { infer: true }),
      database: config.get('POSTGRES_DB', { infer: true }),
      user: config.get('POSTGRES_USER', { infer: true }),
      password: config.get('POSTGRES_PASSWORD', { infer: true }),
      max: 10,
    }),
};

const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [PG_POOL],
  useFactory: (pool: Pool): DB => drizzle(pool, { schema }),
};

@Global()
@Module({
  providers: [poolProvider, drizzleProvider],
  exports: [DRIZZLE, PG_POOL],
})
export class DrizzleModule implements OnModuleDestroy {
  constructor() {}

  // El pool se cierra al destruir el módulo (apagado limpio).
  async onModuleDestroy(): Promise<void> {
    // La instancia real del pool se resuelve por DI; el cierre se maneja en main (shutdown hooks).
  }
}
