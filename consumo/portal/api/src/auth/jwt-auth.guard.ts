/**
 * Guard global del portal de usuario. Reglas:
 * 1. Rutas @Publico(): pasan sin token (branding, logo, login).
 * 2. El JWT se firma con el secreto PROPIO del portal (PORTAL_JWT_SECRET).
 * 3. El `org` del token debe coincidir con el :hash de la URL — un token de una
 *    organización jamás opera sobre otra.
 * 4. El usuario se relee de la BD del tenant en cada request (revocación inmediata).
 * 5. Rutas @SoloAdmin(): exigen es_admin FRESCO de la BD.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import type { Env } from '../config/env';
import { ES_PUBLICO } from './publico.decorator';
import { SesionService } from './sesion.service';
import { SOLO_ADMIN } from './solo-admin.decorator';
import { PayloadPortal, UsuarioPortal } from './tipos';

export type RequestPortal = Request & { usuarioPortal?: UsuarioPortal };

/** Métodos que no modifican nada: los únicos permitidos al suplantar. */
const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

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

    const req = ctx.switchToHttp().getRequest<RequestPortal>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }
    const token = auth.slice('Bearer '.length);

    let payload: PayloadPortal;
    try {
      payload = await this.jwt.verifyAsync<PayloadPortal>(token, {
        secret: this.config.get('PORTAL_JWT_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const hash = (req.params as Record<string, string | undefined>)['hash'];
    if (!hash || payload.org !== hash) {
      throw new UnauthorizedException('El token no corresponde a esta organización');
    }

    const usuario = await this.sesion.usuarioVigente(hash, payload.sub);
    // La marca de suplantación viaja en el token, no en la BD: es propia de ESTA
    // sesión, no del usuario. Dos pestañas del mismo usuario pueden ser una normal
    // y otra suplantada, y solo la segunda queda restringida.
    req.usuarioPortal = payload.imp ? { ...usuario, impersonadoPor: payload.imp } : usuario;

    // Una sesión suplantada es para MIRAR. Escribir en nombre de otro dejaría en su
    // historial acciones que esa persona nunca hizo.
    if (payload.imp && !METODOS_LECTURA.has(req.method)) {
      throw new ForbiddenException(
        'Estás viendo el portal como otro usuario: la sesión es de solo lectura.',
      );
    }

    const soloAdmin = this.reflector.getAllAndOverride<boolean>(SOLO_ADMIN, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (soloAdmin && !usuario.esAdmin) {
      throw new ForbiddenException('Requiere ser administrador de la organización');
    }
    return true;
  }
}
