/**
 * Branding público del tenant (pre-login): nombre, color y logo. Un hash
 * inválido devuelve 404 genérico sin revelar nada.
 */
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';

import { Publico } from '../auth/publico.decorator';
import { ControlDbService } from '../db/control-db.service';

@Controller('t/:hash')
export class OrganizacionController {
  constructor(private readonly controlDb: ControlDbService) {}

  @Publico()
  @Get('branding')
  async branding(@Param('hash') hash: string) {
    const org = await this.controlDb.organizacionPorHash(hash);
    return {
      nombre: org.nombre,
      colorMarca: org.colorMarca,
      tieneLogo: org.logoMime !== null,
    };
  }

  /** Binario del logo. Respuesta cruda (no envuelta): se consume como <img>. */
  @Publico()
  @Get('logo')
  async logo(@Param('hash') hash: string, @Res() res: Response): Promise<void> {
    const logo = await this.controlDb.logoPorHash(hash);
    if (!logo) throw new NotFoundException('Recurso no encontrado');
    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    // Defensa en profundidad: el upload (portal admin) valida MIME allowlist +
    // magic bytes, pero este binario jamás debe ejecutarse como documento en
    // nuestro origen (XSS almacenado si algo se colara).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="logo"');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(logo.datos);
  }
}
