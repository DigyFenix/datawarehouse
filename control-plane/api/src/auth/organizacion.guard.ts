/**
 * Guard de MEMBRESÍA por organización (tercer APP_GUARD; cierra el IDOR).
 *
 * Donde el handler declara @AlcanceOrg, extrae la organización de la request y exige
 * que el actor sea global o tenga asignación en ella. Corre ANTES de los pipes de
 * validación, así que parsea el valor de forma defensiva.
 *
 * Devuelve 404 (no 403) cuando el actor no pertenece: no filtra la existencia de
 * otras organizaciones (mismo criterio que el portal de usuario con los tenants).
 */
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { ALCANCE_ORG, AlcanceOrgConfig } from './alcance-org.decorator';
import type { UsuarioAutenticado } from './jwt-auth.guard';
import { ES_PUBLICO } from './publico.decorator';

@Injectable()
export class OrganizacionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublico) return true;

    const config = this.reflector.getAllAndOverride<AlcanceOrgConfig | undefined>(ALCANCE_ORG, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!config) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: UsuarioAutenticado }).user;
    if (!user) throw new NotFoundException('Recurso no encontrado');

    const campo = config.campo ?? 'organizacionId';
    const origen =
      config.desde === 'query' ? req.query :
      config.desde === 'body' ? (req.body as Record<string, unknown> | undefined) :
      req.params;
    const crudo = origen ? (origen as Record<string, unknown>)[campo] : undefined;

    if (crudo === undefined || crudo === null || crudo === '') {
      if (config.opcional) return true; // el servicio filtra por membresía
      throw new BadRequestException(`Falta ${campo} en ${config.desde}`);
    }

    const orgId = Number(crudo);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      throw new BadRequestException(`${campo} inválido`);
    }

    if (user.esGlobal || user.orgIds.includes(orgId)) return true;
    throw new NotFoundException('Recurso no encontrado');
  }
}
