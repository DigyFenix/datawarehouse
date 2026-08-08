/** Resumen de la pantalla de inicio, bajo el tenant de la URL (/t/:hash/inicio). */
import { Controller, Get, Req } from '@nestjs/common';

import { RequestPortal } from '../auth/jwt-auth.guard';
import { UsuarioPortal } from '../auth/tipos';
import { InicioService } from './inicio.service';

@Controller('t/:hash/inicio')
export class InicioController {
  constructor(private readonly servicio: InicioService) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  /**
   * Frescura del dato por dominio, conteo de tableros accesibles y los últimos
   * tableros abiertos por este usuario.
   *
   * @returns `{ frescura, tableros, recientes }`
   * @throws 401 sin token o con token de otro tenant
   */
  @Get()
  resumen(@Req() req: RequestPortal) {
    return this.servicio.resumen(this.usuario(req));
  }
}
