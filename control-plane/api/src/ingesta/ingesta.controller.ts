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

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { RolesGlobales } from '../auth/roles.decorator';
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
    return {
      id: u?.id ?? null,
      email: u?.email ?? null,
      ip: req.ip ?? null,
      esGlobal: u?.esGlobal ?? false,
      orgIds: u?.orgIds ?? [],
    };
  }

  // --- Políticas ---
  /**
   * Políticas de ingesta de una organización.
   * @param organizacionId id de la organización (obligatorio; la config es por tenant)
   * @returns políticas de esa organización, ordenadas por id
   * @throws 400 si falta o no es un id válido · 401 sin token
   */
  @Get('politicas')
  @AlcanceOrg({ desde: 'query' })
  listarPoliticas(
    @Query(new ZodValidationPipe(filtroOrganizacionSchema)) filtro: FiltroOrganizacionDto,
  ) {
    return this.servicio.listarPoliticas(filtro.organizacionId);
  }

  @Post('politicas')
  @AlcanceOrg({ desde: 'body' })
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
  @AlcanceOrg({ desde: 'query' })
  listarPlanes(
    @Query(new ZodValidationPipe(filtroOrganizacionSchema)) filtro: FiltroOrganizacionDto,
  ) {
    return this.servicio.listarPlanes(filtro.organizacionId);
  }

  @Post('planes')
  @AlcanceOrg({ desde: 'body' })
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
  @AlcanceOrg({ desde: 'query' })
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
  @AlcanceOrg({ desde: 'body' })
  descubrir(
    @Body(new ZodValidationPipe(descubrirSchema)) dto: DescubrirDto,
    @Req() req: Request,
  ) {
    return this.servicio.descubrir(dto, this.actor(req));
  }

  @Post('extraer')
  @AlcanceOrg({ desde: 'body' })
  extraer(
    @Body(new ZodValidationPipe(extraerSchema)) dto: ExtraerDto,
    @Req() req: Request,
  ) {
    return this.servicio.extraer(dto, this.actor(req));
  }

  @Post('transformar')
  @AlcanceOrg({ desde: 'body' })
  transformar(
    @Body(new ZodValidationPipe(transformarSchema)) dto: TransformarDto,
    @Req() req: Request,
  ) {
    return this.servicio.transformar(dto, this.actor(req));
  }

  // --- Dominios (catálogo GLOBAL del producto: escritura solo roles globales) ---
  @Get('dominios')
  listarDominios() {
    return this.servicio.listarDominios();
  }

  @Post('dominios')
  @RolesGlobales('admin_portal', 'data_steward')
  crearDominio(
    @Body(new ZodValidationPipe(crearDominioSchema)) dto: CrearDominioDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearDominio(dto, this.actor(req));
  }
}
