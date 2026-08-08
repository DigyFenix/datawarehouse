/**
 * Guard de ROLES (segundo APP_GUARD, corre después de JwtAuthGuard).
 *
 * Lee @RolesPermitidos / @RolesGlobales del handler o la clase y los contrasta con la
 * sesión fresca que dejó JwtAuthGuard en req.user. Sin metadata = no exige rol (la ruta
 * queda cubierta por autenticación + scoping de organización).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import type { UsuarioAutenticado } from './jwt-auth.guard';
import { ES_PUBLICO } from './publico.decorator';
import { ROLES_GLOBALES, ROLES_PERMITIDOS } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublico) return true;

    const permitidos = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_PERMITIDOS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const globales = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_GLOBALES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permitidos?.length && !globales?.length) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: UsuarioAutenticado }).user;
    if (!user) throw new ForbiddenException('Sesión sin autorización');

    // El admin global del producto pasa cualquier exigencia de rol.
    if (user.esGlobal) return true;

    if (globales?.length) {
      const tieneGlobal = user.roles.some(
        (r) => r.organizacionId === null && globales.includes(r.clave),
      );
      if (!tieneGlobal) {
        throw new ForbiddenException('Esta operación exige un rol con alcance global');
      }
      return true;
    }

    const tieneRol = user.roles.some((r) => permitidos!.includes(r.clave));
    if (!tieneRol) {
      throw new ForbiddenException(
        `Esta operación exige uno de los roles: ${permitidos!.join(', ')}`,
      );
    }
    return true;
  }
}
