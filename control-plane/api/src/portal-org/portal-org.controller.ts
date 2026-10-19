/** Endpoints de administración del portal de usuario por organización (proveedor). */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarTableroSchema,
  ActualizarTableroDto,
  crearTableroSchema,
  CrearTableroDto,
  rotarEnlaceSchema,
  RotarEnlaceDto,
  sembrarAdminSchema,
  SembrarAdminDto,
} from './portal-org.dto';
import { PortalOrgService } from './portal-org.service';

// Todas las rutas cuelgan de /organizaciones/:id/portal: el alcance se declara una vez.
@Controller('organizaciones/:id/portal')
@AlcanceOrg({ desde: 'param', campo: 'id' })
export class PortalOrgController {
  constructor(private readonly servicio: PortalOrgService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return {
      id: u?.id ?? null,
      email: u?.email ?? null,
      ip: req.ip ?? null,
      esGlobal: u?.esGlobal ?? false,
      orgIds: u?.orgIds ?? [],
    };
  }

  @Get('estado')
  estado(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.estado(id);
  }

  @Post('admin')
  sembrarAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(sembrarAdminSchema)) dto: SembrarAdminDto,
    @Req() req: Request,
  ) {
    return this.servicio.sembrarAdmin(id, dto, this.actor(req));
  }

  /** Usuarios del portal de la organización: a quién se puede ver como. */
  @Get('usuarios')
  listarUsuariosPortal(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.listarUsuariosPortal(id);
  }

  /**
   * Emite un pase de un solo uso para abrir el portal de la organización viendo
   * exactamente lo que ve ese usuario. No expone su contraseña y la sesión
   * resultante es de solo lectura, marcada y auditada en ambos planos.
   */
  @Post('usuarios/:usuarioId/impersonar')
  impersonar(
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Req() req: Request,
  ) {
    return this.servicio.emitirImpersonacion(id, usuarioId, this.actor(req));
  }

  /**
   * Restablece la contraseña de un usuario del portal (incluido el admin de la
   * organización). Devuelve la temporal una sola vez; el cambio es obligatorio al entrar.
   * @returns { email, passwordTemporal } · 404 si el usuario no existe
   */
  @Post('usuarios/:usuarioId/restablecer-password')
  restablecerPassword(
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Req() req: Request,
  ) {
    return this.servicio.restablecerPassword(id, usuarioId, this.actor(req));
  }

  @Get('tableros')
  listarTableros(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.listarTableros(id);
  }

  /** Códigos de Publish to Web en uso y su antigüedad. @returns EnlacePublico[] */
  @Get('tableros/enlaces')
  listarEnlaces(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.listarEnlaces(id);
  }

  /**
   * Rota el vínculo público en todos los tableros que lo usan.
   * @param dto.urlNueva URL de Publish to Web recién generada
   * @returns ResultadoRotacion · 400 si la URL no sirve, es el mismo código o la huella es ambigua
   */
  @Post('tableros/rotar-enlace')
  @HttpCode(200)
  rotarEnlace(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(rotarEnlaceSchema)) dto: RotarEnlaceDto,
    @Req() req: Request,
  ) {
    return this.servicio.rotarEnlace(id, dto, this.actor(req));
  }

  @Post('tableros')
  crearTablero(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(crearTableroSchema)) dto: CrearTableroDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearTablero(id, dto, this.actor(req));
  }

  @Put('tableros/:tableroId')
  actualizarTablero(
    @Param('id', ParseIntPipe) id: number,
    @Param('tableroId', ParseIntPipe) tableroId: number,
    @Body(new ZodValidationPipe(actualizarTableroSchema)) dto: ActualizarTableroDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizarTablero(id, tableroId, dto, this.actor(req));
  }

  @Delete('tableros/:tableroId')
  @HttpCode(204)
  eliminarTablero(
    @Param('id', ParseIntPipe) id: number,
    @Param('tableroId', ParseIntPipe) tableroId: number,
    @Req() req: Request,
  ) {
    return this.servicio.eliminarTablero(id, tableroId, this.actor(req));
  }
}
