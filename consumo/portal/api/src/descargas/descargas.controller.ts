/** Descargas autoservicio a Excel, bajo el tenant de la URL (/t/:hash/descargas). */
import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { esquemaDescarga } from '@quilate/agente';
import type { Response } from 'express';

import { LimiteAgenteGuard } from '../agente/limite-agente.guard';
import { RequestPortal } from '../auth/jwt-auth.guard';
import { UsuarioPortal } from '../auth/tipos';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DescargasService } from './descargas.service';

@Controller('t/:hash/descargas')
// Mismo límite por usuario que el asistente: el .xlsx cuenta en el cubo caro (12/min).
@UseGuards(LimiteAgenteGuard)
export class DescargasController {
  constructor(private readonly servicio: DescargasService) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  /**
   * Catálogo descargable del usuario: módulos (dominios) con sus métricas autorizadas,
   * dimensiones admitidas, rango de períodos, empresas y frescura.
   *
   * @returns CatalogoDescargas
   * @throws 401 sin sesión del tenant
   */
  @Get('catalogo')
  catalogo(@Req() req: RequestPortal) {
    return this.servicio.catalogo(this.usuario(req));
  }

  /**
   * Genera el .xlsx. El cuerpo es la especificación (métricas, nivel, período, empresa,
   * dimensión); se valida con el MISMO esquema Zod del paquete antes de tocar el servicio.
   * Responde el binario directo (sin la envoltura { success, data }).
   *
   * @returns application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   * @throws 400 especificación inválida o fuera del alcance (motivo en el cuerpo JSON)
   * @throws 401 sin sesión del tenant
   */
  @Post('excel')
  async excel(
    @Body(new ZodValidationPipe(esquemaDescarga)) dto: unknown,
    @Req() req: RequestPortal,
    @Res() res: Response,
  ) {
    const archivo = await this.servicio.excel(this.usuario(req), dto, req.ip ?? null);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
    res.setHeader('X-Filas', String(archivo.filas));
    res.send(archivo.contenido);
  }
}
