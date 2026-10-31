/** Chat con el agente de IA gobernado y consultas guardadas, bajo el tenant de la URL (/t/:hash/agente). */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequestPortal } from '../auth/jwt-auth.guard';
import { UsuarioPortal } from '../auth/tipos';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AgenteService } from './agente.service';
import {
  actualizarConsultaGuardadaSchema,
  ActualizarConsultaGuardadaDto,
  crearConsultaGuardadaSchema,
  CrearConsultaGuardadaDto,
  enviarMensajeSchema,
  EnviarMensajeDto,
  ordenTableroSchema,
  OrdenTableroDto,
} from './agente.dto';
import { ConsultasGuardadasService } from './consultas-guardadas.service';
import { ConversacionesService } from './conversaciones.service';
import { LimiteAgenteGuard } from './limite-agente.guard';
import { ModuloAsistenteGuard } from './modulo-asistente.guard';

@Controller('t/:hash/agente')
@UseGuards(ModuloAsistenteGuard, LimiteAgenteGuard)
export class AgenteController {
  constructor(
    private readonly conversaciones: ConversacionesService,
    private readonly guardadas: ConsultasGuardadasService,
    private readonly agente: AgenteService,
  ) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  // ---------------------------------------------------------------- conversaciones

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

  // ---------------------------------------------------------------- consultas guardadas

  @Get('consultas')
  listarConsultas(@Req() req: RequestPortal) {
    return this.guardadas.listar(this.usuario(req));
  }

  @Post('consultas')
  crearConsulta(
    @Body(new ZodValidationPipe(crearConsultaGuardadaSchema)) dto: CrearConsultaGuardadaDto,
    @Req() req: RequestPortal,
  ) {
    return this.guardadas.crear(this.usuario(req), dto);
  }

  /** Reejecuta la consulta con datos frescos (sin pasar por el modelo). */
  @Get('consultas/:id/ejecutar')
  ejecutarConsulta(@Param('id', ParseIntPipe) id: number, @Req() req: RequestPortal) {
    return this.agente.ejecutarGuardada(this.usuario(req), id, req.ip ?? null);
  }

  @Patch('consultas/:id')
  actualizarConsulta(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarConsultaGuardadaSchema)) dto: ActualizarConsultaGuardadaDto,
    @Req() req: RequestPortal,
  ) {
    return this.guardadas.actualizar(this.usuario(req), id, dto);
  }

  @Delete('consultas/:id')
  @HttpCode(204)
  eliminarConsulta(@Param('id', ParseIntPipe) id: number, @Req() req: RequestPortal) {
    return this.guardadas.eliminar(this.usuario(req), id);
  }

  // ---------------------------------------------------------------- mi tablero

  /**
   * Widgets de «Mi tablero» con datos frescos: cada consulta fijada se reejecuta bajo las
   * guardas y el alcance de quien abre (sin pasar por el modelo).
   *
   * @returns EjecucionGuardada[] en el orden del tablero
   */
  @Get('tablero')
  tablero(@Req() req: RequestPortal) {
    return this.agente.ejecutarTablero(this.usuario(req), req.ip ?? null);
  }

  /** Reordena los widgets (ids propios en el orden deseado). */
  @Put('tablero/orden')
  ordenarTablero(@Body(new ZodValidationPipe(ordenTableroSchema)) dto: OrdenTableroDto, @Req() req: RequestPortal) {
    return this.guardadas.reordenarTablero(this.usuario(req), dto.ids);
  }
}
