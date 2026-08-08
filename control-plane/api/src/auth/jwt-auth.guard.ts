/**
 * Guard global de autenticación: exige JWT válido salvo rutas @Publico() y puebla
 * `req.user` con la sesión FRESCA de la BD (roles y alcance por organización).
 *
 * El token solo prueba identidad; usuario inactivo o borrado ⇒ 401 inmediato
 * (revocación sin esperar la expiración del JWT). La autorización fina la hacen
 * RolesGuard y OrganizacionGuard sobre esta misma sesión.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import type { Env } from '../config/env';
import { ES_PUBLICO } from './publico.decorator';
import { SesionService, SesionVigente } from './sesion.service';

/** Usuario autenticado con autorización fresca (lo que ven guards y controladores). */
export type UsuarioAutenticado = SesionVigente;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    private readonly sesion: SesionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublico) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }
    const token = auth.slice('Bearer '.length);

    let sub: number;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; email: string }>(token, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const vigente = await this.sesion.usuarioVigente(sub);
    if (!vigente) {
      // Mismo mensaje que un token malo: no filtra si el usuario existe o fue desactivado.
      throw new UnauthorizedException('Token inválido o expirado');
    }
    (req as Request & { user?: UsuarioAutenticado }).user = vigente;
    return true;
  }
}
