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
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarTerminoSchema,
  ActualizarTerminoDto,
  crearTerminoSchema,
  CrearTerminoDto,
} from './glosario.dto';
import { GlosarioService } from './glosario.service';

@Controller('glosario')
export class GlosarioController {
  constructor(private readonly servicio: GlosarioService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return { id: u?.id ?? null, email: u?.email ?? null, ip: req.ip ?? null };
  }

  @Get()
  listar() {
    return this.servicio.listar();
  }

  @Post()
  crear(@Body(new ZodValidationPipe(crearTerminoSchema)) dto: CrearTerminoDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarTerminoSchema)) dto: ActualizarTerminoDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminar(id, this.actor(req));
  }
}
