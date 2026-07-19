/** Endpoints REST de usuarios y su asignación de roles. Requieren token (guard global). */
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

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import {
  actualizarUsuarioSchema,
  ActualizarUsuarioDto,
  asignarRolSchema,
  AsignarRolDto,
  crearUsuarioSchema,
  CrearUsuarioDto,
} from './usuario.dto';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly servicio: UsuariosService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return { id: u?.id ?? null, email: u?.email ?? null, ip: req.ip ?? null };
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
  crear(
    @Body(new ZodValidationPipe(crearUsuarioSchema)) dto: CrearUsuarioDto,
    @Req() req: Request,
  ) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarUsuarioSchema)) dto: ActualizarUsuarioDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  @Get(':id/roles')
  rolesDeUsuario(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.listarRolesDeUsuario(id);
  }

  @Post(':id/roles')
  asignarRol(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(asignarRolSchema)) dto: AsignarRolDto,
    @Req() req: Request,
  ) {
    return this.servicio.asignarRol(id, dto, this.actor(req));
  }

  @Delete(':id/roles/:rolId')
  @HttpCode(204)
  quitarRol(
    @Param('id', ParseIntPipe) id: number,
    @Param('rolId', ParseIntPipe) rolId: number,
    @Req() req: Request,
  ) {
    return this.servicio.quitarRol(id, rolId, this.actor(req));
  }
}
