/** Login por tenant, cambio de contraseña y perfil de la sesión. */
import { createHash } from 'node:crypto';

import * as argon2 from 'argon2';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import type { Env } from '../config/env';
import { CambiarPasswordDto, LoginDto } from './auth.dto';
import { SesionService } from './sesion.service';
import { PayloadPortal, UsuarioPortal } from './tipos';

interface FilaLogin {
  id: number;
  email: string;
  nombre: string;
  hashPassword: string;
  esAdmin: boolean;
  debeCambiarPassword: boolean;
  activo: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly sesion: SesionService,
    private readonly auditoria: AuditoriaPortalService,
  ) {}

  async login(hash: string, dto: LoginDto, ip: string | null) {
    const { pool } = await this.sesion.contexto(hash);
    const resultado = await pool.query(
      `SELECT id, email, nombre,
              hash_password         AS "hashPassword",
              es_admin              AS "esAdmin",
              debe_cambiar_password AS "debeCambiarPassword",
              activo
         FROM portal.usuarios
        WHERE email = $1`,
      [dto.email.toLowerCase()],
    );
    const fila = resultado.rows[0] as FilaLogin | undefined;
    // Mensaje único: no revelar si el email existe o no.
    const credencialesInvalidas = new UnauthorizedException('Credenciales inválidas');
    if (!fila || !fila.activo) throw credencialesInvalidas;
    const valida = await argon2.verify(fila.hashPassword, dto.password).catch(() => false);
    if (!valida) throw credencialesInvalidas;

    const payload: PayloadPortal = {
      sub: fila.id,
      email: fila.email,
      org: hash,
      esAdmin: fila.esAdmin,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get('PORTAL_JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('PORTAL_JWT_EXPIRA_EN', { infer: true }),
    });
    await this.auditoria.registrar(pool, {
      usuarioId: fila.id,
      usuarioEmail: fila.email,
      accion: 'login',
      entidad: 'usuarios',
      entidadId: String(fila.id),
      ip,
    });
    return {
      token,
      usuario: {
        id: fila.id,
        email: fila.email,
        nombre: fila.nombre,
        esAdmin: fila.esAdmin,
        debeCambiarPassword: fila.debeCambiarPassword,
      },
    };
  }

  /**
   * Canjea el pase que emitió el portal de administración por una sesión de ESTE
   * portal, marcada como suplantada.
   *
   * El pase se consume aquí y no vuelve a servir; la sesión resultante es de solo
   * lectura (lo impone `SoloLecturaGuard`) y dura lo mismo que el pase restante,
   * no las 8 horas de una sesión normal: es para mirar, no para trabajar.
   *
   * @throws 401 si el pase no existe, ya se usó o caducó
   */
  async canjearImpersonacion(hash: string, ticket: string, ip: string | null) {
    const { pool } = await this.sesion.contexto(hash);
    const tokenHash = createHash('sha256').update(ticket).digest('hex');
    const invalido = new UnauthorizedException('El pase de acceso no es válido o ya caducó');

    // Se marca usado en el mismo UPDATE que lo valida: dos canjes simultáneos del
    // mismo pase no pueden ganar los dos.
    const consumido = await pool.query(
      `UPDATE portal.impersonaciones
          SET usado_en = now()
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > now()
        RETURNING usuario_id AS "usuarioId", emitido_por AS "emitidoPor"`,
      [tokenHash],
    );
    const pase = consumido.rows[0] as { usuarioId: number; emitidoPor: string } | undefined;
    if (!pase) throw invalido;

    const resultado = await pool.query(
      `SELECT id, email, nombre, es_admin AS "esAdmin", activo
         FROM portal.usuarios WHERE id = $1`,
      [pase.usuarioId],
    );
    const fila = resultado.rows[0] as
      | { id: number; email: string; nombre: string; esAdmin: boolean; activo: boolean }
      | undefined;
    if (!fila || !fila.activo) throw invalido;

    const payload: PayloadPortal = {
      sub: fila.id,
      email: fila.email,
      org: hash,
      esAdmin: fila.esAdmin,
      imp: pase.emitidoPor,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get('PORTAL_JWT_SECRET', { infer: true }),
      expiresIn: '30m',
    });
    await this.auditoria.registrar(pool, {
      usuarioId: fila.id,
      usuarioEmail: fila.email,
      accion: 'login_impersonado',
      entidad: 'usuarios',
      entidadId: String(fila.id),
      despues: { impersonadoPor: pase.emitidoPor },
      ip,
    });
    return {
      token,
      usuario: {
        id: fila.id,
        email: fila.email,
        nombre: fila.nombre,
        esAdmin: fila.esAdmin,
        debeCambiarPassword: false,
      },
      impersonadoPor: pase.emitidoPor,
    };
  }

  async cambiarPassword(usuario: UsuarioPortal, dto: CambiarPasswordDto, ip: string | null) {
    const { pool } = await this.sesion.contexto(usuario.hash);
    const resultado = await pool.query(
      `SELECT hash_password AS "hashPassword" FROM portal.usuarios WHERE id = $1`,
      [usuario.id],
    );
    const fila = resultado.rows[0] as { hashPassword: string } | undefined;
    if (!fila) throw new UnauthorizedException('Sesión no vigente');
    const valida = await argon2.verify(fila.hashPassword, dto.passwordActual).catch(() => false);
    if (!valida) throw new UnauthorizedException('La contraseña actual no es correcta');

    const hashNueva = await argon2.hash(dto.passwordNueva);
    await pool.query(
      `UPDATE portal.usuarios
          SET hash_password = $1, debe_cambiar_password = false, actualizado_en = now()
        WHERE id = $2`,
      [hashNueva, usuario.id],
    );
    await this.auditoria.registrar(pool, {
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      accion: 'cambiar_password',
      entidad: 'usuarios',
      entidadId: String(usuario.id),
      ip,
    });
    return { cambiada: true };
  }

  /** Perfil de la sesión + perfiles de acceso vigentes (leídos de la BD). */
  async perfil(usuario: UsuarioPortal) {
    const { pool } = await this.sesion.contexto(usuario.hash);
    const perfiles = await pool.query(
      `SELECT p.id, p.clave, p.nombre
         FROM portal.usuario_perfiles up
         JOIN portal.perfiles p ON p.id = up.perfil_id AND p.activo
        WHERE up.usuario_id = $1
        ORDER BY p.nombre`,
      [usuario.id],
    );
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      esAdmin: usuario.esAdmin,
      debeCambiarPassword: usuario.debeCambiarPassword,
      perfiles: perfiles.rows as { id: number; clave: string; nombre: string }[],
    };
  }
}
