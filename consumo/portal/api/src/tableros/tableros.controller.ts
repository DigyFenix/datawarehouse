/** Consumo de tableros bajo el tenant de la URL (/t/:hash/tableros). */
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';

import { Publico } from '../auth/publico.decorator';
import { RequestPortal } from '../auth/jwt-auth.guard';
import { UsuarioPortal } from '../auth/tipos';
import { PasesVisorService } from './pases-visor.service';
import { TablerosService } from './tableros.service';

@Controller('t/:hash/tableros')
export class TablerosController {
  constructor(
    private readonly servicio: TablerosService,
    private readonly pases: PasesVisorService,
  ) {}

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

  /**
   * Destino del iframe del visor. Público porque un iframe no puede mandar el
   * token: lo protege el pase de un solo uso (60 s) que emitió `abrir` para este
   * tenant y este tablero. Responde 302 a Power BI sin dejar rastro en caché ni
   * en el Referer. @returns 302 · 404 si el pase no sirve
   */
  @Publico()
  @Get(':clave/visor')
  visor(
    @Param('hash') hash: string,
    @Param('clave') clave: string,
    @Query('pase') pase: string | undefined,
    @Res() res: Response,
  ): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = typeof pase === 'string' && pase.length > 0 ? this.pases.canjear(hash, clave, pase) : null;
    if (!url) {
      res
        .status(404)
        .type('html')
        .send('<p style="font-family:sans-serif;color:#666">El acceso al tablero venció. Vuelve a abrirlo desde el portal.</p>');
      return;
    }
    res.redirect(302, url);
  }
}
