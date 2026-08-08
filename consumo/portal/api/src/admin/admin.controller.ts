/** Autoadministración de la organización (/t/:hash/admin). Solo su admin. */
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
  Query,
  Req,
} from '@nestjs/common';

import { RequestPortal } from '../auth/jwt-auth.guard';
import { SoloAdmin } from '../auth/solo-admin.decorator';
import { UsuarioPortal } from '../auth/tipos';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  actualizarPerfilSchema,
  ActualizarPerfilDto,
  actualizarUsuarioSchema,
  ActualizarUsuarioDto,
  asignarAlcancesSchema,
  AsignarAlcancesDto,
  asignarPerfilesSchema,
  AsignarPerfilesDto,
  asignarTablerosSchema,
  AsignarTablerosDto,
  crearPerfilSchema,
  CrearPerfilDto,
  crearUsuarioSchema,
  CrearUsuarioDto,
  metricaDerivadaSchema,
  MetricaDerivadaDto,
  restablecerPasswordSchema,
  RestablecerPasswordDto,
  terminoGlosarioSchema,
  TerminoGlosarioDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@SoloAdmin()
@Controller('t/:hash/admin')
export class AdminController {
  constructor(private readonly servicio: AdminService) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  // --- Usuarios ---

  @Get('usuarios')
  listarUsuarios(@Req() req: RequestPortal) {
    return this.servicio.listarUsuarios(this.usuario(req));
  }

  @Post('usuarios')
  crearUsuario(
    @Body(new ZodValidationPipe(crearUsuarioSchema)) dto: CrearUsuarioDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.crearUsuario(this.usuario(req), dto, req.ip ?? null);
  }

  @Put('usuarios/:usuarioId')
  actualizarUsuario(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body(new ZodValidationPipe(actualizarUsuarioSchema)) dto: ActualizarUsuarioDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.actualizarUsuario(this.usuario(req), usuarioId, dto, req.ip ?? null);
  }

  @Post('usuarios/:usuarioId/restablecer-password')
  restablecerPassword(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body(new ZodValidationPipe(restablecerPasswordSchema)) dto: RestablecerPasswordDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.restablecerPassword(this.usuario(req), usuarioId, dto, req.ip ?? null);
  }

  @Put('usuarios/:usuarioId/perfiles')
  asignarPerfiles(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body(new ZodValidationPipe(asignarPerfilesSchema)) dto: AsignarPerfilesDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.asignarPerfiles(this.usuario(req), usuarioId, dto, req.ip ?? null);
  }

  // --- Perfiles ---

  @Get('perfiles')
  listarPerfiles(@Req() req: RequestPortal) {
    return this.servicio.listarPerfiles(this.usuario(req));
  }

  @Post('perfiles')
  crearPerfil(
    @Body(new ZodValidationPipe(crearPerfilSchema)) dto: CrearPerfilDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.crearPerfil(this.usuario(req), dto, req.ip ?? null);
  }

  @Put('perfiles/:perfilId')
  actualizarPerfil(
    @Param('perfilId', ParseIntPipe) perfilId: number,
    @Body(new ZodValidationPipe(actualizarPerfilSchema)) dto: ActualizarPerfilDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.actualizarPerfil(this.usuario(req), perfilId, dto, req.ip ?? null);
  }

  @Delete('perfiles/:perfilId')
  @HttpCode(204)
  eliminarPerfil(@Param('perfilId', ParseIntPipe) perfilId: number, @Req() req: RequestPortal) {
    return this.servicio.eliminarPerfil(this.usuario(req), perfilId, req.ip ?? null);
  }

  @Put('perfiles/:perfilId/tableros')
  asignarTableros(
    @Param('perfilId', ParseIntPipe) perfilId: number,
    @Body(new ZodValidationPipe(asignarTablerosSchema)) dto: AsignarTablerosDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.asignarTableros(this.usuario(req), perfilId, dto, req.ip ?? null);
  }

  @Put('perfiles/:perfilId/alcances')
  asignarAlcances(
    @Param('perfilId', ParseIntPipe) perfilId: number,
    @Body(new ZodValidationPipe(asignarAlcancesSchema)) dto: AsignarAlcancesDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.asignarAlcances(this.usuario(req), perfilId, dto, req.ip ?? null);
  }

  // --- Glosario del negocio ---

  /**
   * Vocabulario propio de la organización, con el que el agente interpreta las
   * preguntas de su gente. Se superpone al glosario base del producto.
   */
  @Get('glosario')
  listarGlosario(@Req() req: RequestPortal) {
    return this.servicio.listarGlosario(this.usuario(req));
  }

  /** Métricas consultables: alimentan el desplegable de «equivale a». */
  @Get('glosario/metricas')
  metricasParaGlosario() {
    return this.servicio.metricasConsumibles();
  }

  @Post('glosario')
  crearTermino(
    @Body(new ZodValidationPipe(terminoGlosarioSchema)) dto: TerminoGlosarioDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.crearTermino(this.usuario(req), dto, req.ip ?? null);
  }

  @Put('glosario/:terminoId')
  actualizarTermino(
    @Param('terminoId', ParseIntPipe) terminoId: number,
    @Body(new ZodValidationPipe(terminoGlosarioSchema)) dto: TerminoGlosarioDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.actualizarTermino(this.usuario(req), terminoId, dto, req.ip ?? null);
  }

  @Delete('glosario/:terminoId')
  @HttpCode(204)
  eliminarTermino(
    @Param('terminoId', ParseIntPipe) terminoId: number,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.eliminarTermino(this.usuario(req), terminoId, req.ip ?? null);
  }

  // --- Métricas derivadas ---

  /**
   * Indicadores que la organización compone sobre métricas ya certificadas. No
   * contienen SQL: el motor combina los operandos por (empresa, período).
   */
  @Get('derivadas')
  listarDerivadas(@Req() req: RequestPortal) {
    return this.servicio.listarDerivadas(this.usuario(req));
  }

  @Post('derivadas')
  crearDerivada(
    @Body(new ZodValidationPipe(metricaDerivadaSchema)) dto: MetricaDerivadaDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.crearDerivada(this.usuario(req), dto, req.ip ?? null);
  }

  @Put('derivadas/:derivadaId')
  actualizarDerivada(
    @Param('derivadaId', ParseIntPipe) derivadaId: number,
    @Body(new ZodValidationPipe(metricaDerivadaSchema)) dto: MetricaDerivadaDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.actualizarDerivada(this.usuario(req), derivadaId, dto, req.ip ?? null);
  }

  @Delete('derivadas/:derivadaId')
  @HttpCode(204)
  eliminarDerivada(
    @Param('derivadaId', ParseIntPipe) derivadaId: number,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.eliminarDerivada(this.usuario(req), derivadaId, req.ip ?? null);
  }

  // --- Tableros (lectura) y auditoría ---

  @Get('tableros')
  listarTableros(@Req() req: RequestPortal) {
    return this.servicio.listarTableros(this.usuario(req));
  }

  @Get('auditoria')
  listarAuditoria(
    @Req() req: RequestPortal,
    @Query('limite') limite?: string,
    @Query('desdeId') desdeId?: string,
  ) {
    const lim = Math.min(Math.max(Number(limite) || 200, 1), 500);
    const desde = desdeId ? Number(desdeId) : undefined;
    return this.servicio.listarAuditoria(
      this.usuario(req),
      lim,
      Number.isFinite(desde) ? desde : undefined,
    );
  }
}
