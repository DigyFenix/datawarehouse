/** Consumo de tableros bajo el tenant de la URL (/t/:hash/tableros). */
import { Controller, Get, Param, Req } from '@nestjs/common';

import { RequestPortal } from '../auth/jwt-auth.guard';
import { UsuarioPortal } from '../auth/tipos';
import { TablerosService } from './tableros.service';

@Controller('t/:hash/tableros')
export class TablerosController {
  constructor(private readonly servicio: TablerosService) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  @Get()
  listar(@Req() req: RequestPortal) {
    return this.servicio.listar(this.usuario(req));
  }

  @Get(':clave')
  abrir(@Param('clave') clave: string, @Req() req: RequestPortal) {
    return this.servicio.abrir(this.usuario(req), clave, req.ip ?? null);
  }
}
