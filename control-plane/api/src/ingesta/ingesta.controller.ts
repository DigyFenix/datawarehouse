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
import { Request } from 'express';

import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarCampoSchema,
  ActualizarCampoDto,
  actualizarPlanSchema,
  ActualizarPlanDto,
  actualizarPoliticaSchema,
  ActualizarPoliticaDto,
  crearDominioSchema,
  CrearDominioDto,
  filtroCamposSchema,
  FiltroCamposDto,
  filtroOrganizacionSchema,
  FiltroOrganizacionDto,
  crearPlanSchema,
  CrearPlanDto,
  crearPoliticaSchema,
  CrearPoliticaDto,
  descubrirSchema,
  DescubrirDto,
  extraerSchema,
  ExtraerDto,
  transformarSchema,
  TransformarDto,
} from './ingesta.dto';
import { IngestaService } from './ingesta.service';

@Controller('ingesta')
export class IngestaController {
  constructor(private readonly servicio: IngestaService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return { id: u?.id ?? null, email: u?.email ?? null, ip: req.ip ?? null };
  }

  // --- Políticas ---
  /**
   * Políticas de ingesta de una organización.
   * @param organizacionId id de la organización (obligatorio; la config es por tenant)
   * @returns políticas de esa organización, ordenadas por id
   * @throws 400 si falta o no es un id válido · 401 sin token
   */
  @Get('politicas')
  listarPoliticas(
    @Query(new ZodValidationPipe(filtroOrganizacionSchema)) filtro: FiltroOrganizacionDto,
  ) {
    return this.servicio.listarPoliticas(filtro.organizacionId);
  }

  @Post('politicas')
  crearPolitica(
    @Body(new ZodValidationPipe(crearPoliticaSchema)) dto: CrearPoliticaDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearPolitica(dto, this.actor(req));
  }

  @Put('politicas/:id')
  actualizarPolitica(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarPoliticaSchema)) dto: ActualizarPoliticaDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizarPolitica(id, dto, this.actor(req));
  }

  @Delete('politicas/:id')
  @HttpCode(204)
  eliminarPolitica(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminarPolitica(id, this.actor(req));
  }

  // --- Planes ---
  /**
   * Planes de corrida de una organización.
   * @param organizacionId id de la organización (obligatorio)
   * @returns planes de esa organización, ordenados por id
   * @throws 400 si falta o no es un id válido · 401 sin token
   */
  @Get('planes')
  listarPlanes(
    @Query(new ZodValidationPipe(filtroOrganizacionSchema)) filtro: FiltroOrganizacionDto,
  ) {
    return this.servicio.listarPlanes(filtro.organizacionId);
  }

  @Post('planes')
  crearPlan(@Body(new ZodValidationPipe(crearPlanSchema)) dto: CrearPlanDto, @Req() req: Request) {
    return this.servicio.crearPlan(dto, this.actor(req));
  }

  @Put('planes/:id')
  actualizarPlan(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarPlanSchema)) dto: ActualizarPlanDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizarPlan(id, dto, this.actor(req));
  }

  @Delete('planes/:id')
  @HttpCode(204)
  eliminarPlan(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminarPlan(id, this.actor(req));
  }

  // --- Campos de una entidad ---
  /**
   * Campos de origen mapeados de un objeto, dentro de una organización.
   * @param organizacionId id de la organización (obligatorio: el mismo objeto tiene
   *                       tablas de origen distintas en cada ERP)
   * @param objeto clave del objeto en la política (p. ej. `productos`)
   * @returns campos de ese objeto en esa organización, ordenados por tabla de origen
   * @throws 400 si falta cualquiera de los dos · 401 sin token
   */
  @Get('campos')
  listarCampos(@Query(new ZodValidationPipe(filtroCamposSchema)) filtro: FiltroCamposDto) {
    return this.servicio.listarCampos(filtro.organizacionId, filtro.objeto);
  }

  @Put('campos/:id')
  actualizarCampo(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarCampoSchema)) dto: ActualizarCampoDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizarCampo(id, dto, this.actor(req));
  }

  @Post('descubrir')
  descubrir(
    @Body(new ZodValidationPipe(descubrirSchema)) dto: DescubrirDto,
    @Req() req: Request,
  ) {
    return this.servicio.descubrir(dto, this.actor(req));
  }

  @Post('extraer')
  extraer(
    @Body(new ZodValidationPipe(extraerSchema)) dto: ExtraerDto,
    @Req() req: Request,
  ) {
    return this.servicio.extraer(dto, this.actor(req));
  }

  @Post('transformar')
  transformar(
    @Body(new ZodValidationPipe(transformarSchema)) dto: TransformarDto,
    @Req() req: Request,
  ) {
    return this.servicio.transformar(dto, this.actor(req));
  }

  // --- Dominios ---
  @Get('dominios')
  listarDominios() {
    return this.servicio.listarDominios();
  }

  @Post('dominios')
  crearDominio(
    @Body(new ZodValidationPipe(crearDominioSchema)) dto: CrearDominioDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearDominio(dto, this.actor(req));
  }
}
