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

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { RolesGlobales } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  actualizarOrganizacionSchema,
  ActualizarOrganizacionDto,
  crearOrganizacionSchema,
  CrearOrganizacionDto,
  provisionarSchema,
  ProvisionarDto,
  subirLogoSchema,
  SubirLogoDto,
} from './organizacion.dto';
import { Actor, OrganizacionesService } from './organizaciones.service';
import { ProvisionarService } from './provisionar.service';

@Controller('organizaciones')
export class OrganizacionesController {
  constructor(
    private readonly servicio: OrganizacionesService,
    private readonly provision: ProvisionarService,
  ) {}

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

  /** Lista solo las organizaciones donde el actor tiene membresía (rol global = todas). */
  @Get()
  listar(@Req() req: Request) {
    return this.servicio.listar(this.actor(req));
  }

  @Get(':id')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  /** Alta de tenants: reservada al operador del producto. */
  @Post()
  @RolesGlobales('admin_portal')
  @UsePipes(new ZodValidationPipe(crearOrganizacionSchema))
  crear(@Body() dto: CrearOrganizacionDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put(':id')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarOrganizacionSchema)) dto: ActualizarOrganizacionDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  /**
   * Deja la organización lista para Descubrir/Extraer: crea su base del plano de
   * datos, aplica el DDL de tenant y siembra el paquete de ingesta de su ERP.
   * Sustituye los tres pasos manuales de consola del runbook de onboarding.
   *
   * @param id id de la organización
   * @param companyId id de compañía de Odoo (obligatorio solo para ese ERP)
   * @returns qué se creó, qué se aplicó y las advertencias no fatales
   * @throws 400 ERP no soportado o falta companyId · 404 organización inexistente ·
   *         500 si un DDL o seed falla (el detalle nombra el archivo)
   */
  @Post(':id/provisionar')
  @RolesGlobales('admin_portal')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
  provisionar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(provisionarSchema)) dto: ProvisionarDto,
    @Req() req: Request,
  ) {
    return this.provision.provisionar(
      id,
      dto.companyId ?? null,
      dto.corte ?? null,
      this.actor(req),
    );
  }

  /** ¿Está el metadata-store montado en el API? La UI lo consulta antes de ofrecer el botón. */
  @Get('provisionar/disponible')
  @RolesGlobales('admin_portal')
  async provisionarDisponible() {
    return { disponible: await this.provision.disponible() };
  }

  /** Baja de tenants: reservada al operador del producto. */
  @Delete(':id')
  @RolesGlobales('admin_portal')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminar(id, this.actor(req));
  }

  // --- Logo del tenant (white-label del portal de usuario) ---

  @Put(':id/logo')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
  subirLogo(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(subirLogoSchema)) dto: SubirLogoDto,
    @Req() req: Request,
  ) {
    return this.servicio.subirLogo(id, dto, this.actor(req));
  }

  @Delete(':id/logo')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
  @HttpCode(204)
  eliminarLogo(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminarLogo(id, this.actor(req));
  }

  /** Binario del logo. Respuesta cruda (no envuelta): se consume como imagen. */
  @Get(':id/logo')
  @AlcanceOrg({ desde: 'param', campo: 'id' })
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
