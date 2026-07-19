/** Al arrancar, garantiza que exista un usuario admin (bootstrap desde .env). */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { UsuariosService } from './usuarios.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly usuarios: UsuariosService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('PORTAL_ADMIN_EMAIL', { infer: true });
    const password = this.config.get('PORTAL_ADMIN_PASSWORD', { infer: true });
    const resultado = await this.usuarios.asegurarAdmin(email, password);
    if (resultado === 'creado') {
      this.logger.warn(`Usuario admin de arranque creado: ${email}. Cambia su contraseña.`);
    }
  }
}
