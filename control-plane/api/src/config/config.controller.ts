/** Configuración de ejecución que necesita el frontend admin (nada sensible). */
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env';

@Controller('config')
export class ConfigController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** @returns { portalUsuarioUrl } — base de la URL de ingreso de cada tenant */
  @Get()
  obtener(): { portalUsuarioUrl: string } {
    return { portalUsuarioUrl: this.config.get('PORTAL_USUARIO_URL', { infer: true }) };
  }
}
