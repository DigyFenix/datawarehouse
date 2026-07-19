/** Autenticación: valida credenciales (argon2) y emite JWT. */
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import type { Env } from '../config/env';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { usuarios } from '../db/schema';

export interface ResultadoLogin {
  token: string;
  usuario: { id: number; email: string; nombre: string };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(email: string, password: string, ip?: string | null): Promise<ResultadoLogin> {
    const [usuario] = await this.db.select().from(usuarios).where(eq(usuarios.email, email));

    // Mismo mensaje para usuario inexistente o password incorrecta (no filtra cuál falló).
    const credencialesInvalidas = new UnauthorizedException('Credenciales inválidas');
    if (!usuario || !usuario.activo) throw credencialesInvalidas;

    const ok = await argon2.verify(usuario.hashPassword, password);
    if (!ok) throw credencialesInvalidas;

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
