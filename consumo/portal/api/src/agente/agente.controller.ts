/** Chat con el agente de IA gobernado, bajo el tenant de la URL (/t/:hash/agente). */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';

import { RequestPortal } from '../auth/jwt-auth.guard';
import { UsuarioPortal } from '../auth/tipos';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AgenteService } from './agente.service';
import { enviarMensajeSchema, EnviarMensajeDto } from './agente.dto';
import { ConversacionesService } from './conversaciones.service';

@Controller('t/:hash/agente')
export class AgenteController {
  constructor(
    private readonly conversaciones: ConversacionesService,
    private readonly agente: AgenteService,
  ) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  @Get('conversaciones')
  listarConversaciones(@Req() req: RequestPortal) {
    return this.conversaciones.listar(this.usuario(req));
  }

  @Post('conversaciones')
  crearConversacion(@Req() req: RequestPortal) {
    return this.conversaciones.crear(this.usuario(req));
  }

  @Get('conversaciones/:id/mensajes')
  mensajes(@Param('id', ParseIntPipe) id: number, @Req() req: RequestPortal) {
    return this.conversaciones.mensajes(this.usuario(req), id);
  }

  @Post('conversaciones/:id/mensajes')
  enviarMensaje(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(enviarMensajeSchema)) dto: EnviarMensajeDto,
    @Req() req: RequestPortal,
  ) {
    return this.agente.responderMensaje(this.usuario(req), id, dto.contenido, req.ip ?? null);
  }

  @Delete('conversaciones/:id')
  @HttpCode(204)
  eliminarConversacion(@Param('id', ParseIntPipe) id: number, @Req() req: RequestPortal) {
    return this.conversaciones.eliminar(this.usuario(req), id);
  }
}
