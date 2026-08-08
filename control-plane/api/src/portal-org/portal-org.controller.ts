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

  @Get('tableros')
  listarTableros(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.listarTableros(id);
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
