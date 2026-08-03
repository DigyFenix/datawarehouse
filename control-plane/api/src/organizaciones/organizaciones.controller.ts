/** Endpoints REST de organizaciones. La respuesta se envuelve en { success, data, error }. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  actualizarOrganizacionSchema,
  ActualizarOrganizacionDto,
  crearOrganizacionSchema,
  CrearOrganizacionDto,
  subirLogoSchema,
  SubirLogoDto,
} from './organizacion.dto';
import { Actor, OrganizacionesService } from './organizaciones.service';

@Controller('organizaciones')
export class OrganizacionesController {
  constructor(private readonly servicio: OrganizacionesService) {}

  /** Extrae el actor del request (lo llena el guard de auth en P4; hoy queda anónimo). */
  private actor(req: Request): Actor {
    const usuario = (req as Request & { user?: { id: number; email: string } }).user;
    return {
      id: usuario?.id ?? null,
      email: usuario?.email ?? null,
      ip: req.ip ?? null,
    };
  }

  @Get()
  listar() {
    return this.servicio.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(crearOrganizacionSchema))
  crear(@Body() dto: CrearOrganizacionDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarOrganizacionSchema)) dto: ActualizarOrganizacionDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminar(id, this.actor(req));
  }

  // --- Logo del tenant (white-label del portal de usuario) ---

  @Put(':id/logo')
  subirLogo(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(subirLogoSchema)) dto: SubirLogoDto,
    @Req() req: Request,
  ) {
    return this.servicio.subirLogo(id, dto, this.actor(req));
  }

  @Delete(':id/logo')
  @HttpCode(204)
  eliminarLogo(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminarLogo(id, this.actor(req));
  }

  /** Binario del logo. Respuesta cruda (no envuelta): se consume como imagen. */
  @Get(':id/logo')
  async obtenerLogo(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const logo = await this.servicio.obtenerLogo(id);
    if (!logo) throw new NotFoundException('La organización no tiene logo');
    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Defensa en profundidad: aunque el upload valida MIME + magic bytes, este
    // binario jamás debe ejecutarse como documento en nuestro origen.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="logo"');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(logo.datos);
  }
}
