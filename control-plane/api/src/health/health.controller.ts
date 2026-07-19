/** Healthcheck: verifica que la API responde y que Postgres (metadata-store) está accesible. */
import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { Publico } from '../auth/publico.decorator';
import { DB, DRIZZLE } from '../db/drizzle.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: DB) {}

  @Publico()
  @Get()
  async check(): Promise<{ estado: string; db: string }> {
    await this.db.execute(sql`SELECT 1`);
    return { estado: 'ok', db: 'ok' };
  }
}
