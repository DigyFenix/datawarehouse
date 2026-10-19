/** Autenticación: valida credenciales (argon2) y emite JWT. */
import { randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { LimitadorLogin } from '../common/limitador-login';
import type { Env } from '../config/env';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { usuarios } from '../db/schema';

export interface ResultadoLogin {
  token: string;
  usuario: { id: number; email: string; nombre: string };
}

@Injectable()
export class AuthService {
  private readonly limitador = new LimitadorLogin();
  /** Hash de una contraseña que nadie conoce: con email inexistente se verifica contra él (mismo tiempo). */
  private readonly hashFicticio = argon2.hash(randomBytes(32).toString('hex'));

  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(email: string, password: string, ip?: string | null): Promise<ResultadoLogin> {
    const [usuario] = await this.db.select().from(usuarios).where(eq(usuarios.email, email));

    // Mismo mensaje y mismo costo de tiempo para usuario inexistente o password incorrecta.
    const credencialesInvalidas = new UnauthorizedException('Credenciales inválidas');
    this.limitador.verificar(ip ?? null, email);
    const hashAComparar = usuario?.activo ? usuario.hashPassword : await this.hashFicticio;
    const ok = await this.limitador.conCupo(() => argon2.verify(hashAComparar, password).catch(() => false));
    if (!usuario || !usuario.activo || !ok) {
      this.limitador.registrarFallo(ip ?? null, email);
      throw credencialesInvalidas;
    }
    this.limitador.registrarExito(ip ?? null, email);

    const token = await this.jwt.signAsync(
      { sub: usuario.id, email: usuario.email },
      {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_EXPIRA_EN', { infer: true }),
      },
    );

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      ip,
      accion: 'login',
      entidad: 'usuarios',
      entidadId: String(usuario.id),
    });

    return { token, usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre } };
  }
}
