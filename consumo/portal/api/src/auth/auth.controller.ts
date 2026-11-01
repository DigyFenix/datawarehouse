/** Endpoints de autenticación, bajo el tenant de la URL (/t/:hash/auth). */
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';

import { LimitadorPorIp } from '../common/limitador-ip';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  cambiarPasswordSchema,
  CambiarPasswordDto,
  impersonarSchema,
  ImpersonarDto,
  loginSchema,
  LoginDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { RequestPortal } from './jwt-auth.guard';
import { Publico } from './publico.decorator';
import { UsuarioPortal } from './tipos';

/** Canje del pase de soporte: 10 intentos por IP cada 15 min sobran para un operador (B7). */
const LIMITE_IMPERSONAR = new LimitadorPorIp(10, 15 * 60 * 1000);

@Controller('t/:hash/auth')
export class AuthController {
  constructor(private readonly servicio: AuthService) {}

  private usuario(req: RequestPortal): UsuarioPortal {
    // El guard global siempre lo adjunta en rutas no públicas.
    if (!req.usuarioPortal) throw new Error('Request sin usuario autenticado');
    return req.usuarioPortal;
  }

  @Publico()
  @Post('login')
  login(
    @Param('hash') hash: string,
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.login(hash, dto, req.ip ?? null);
  }

  /**
   * Canjea el pase emitido por el portal de administración por una sesión de este
   * portal, marcada como suplantada y de solo lectura. Es público porque quien lo
   * usa todavía no tiene sesión aquí: la autorización la da el pase, que es de un
   * solo uso, caduca en dos minutos y ya se validó del otro lado.
   */
  @Publico()
  @Post('impersonar')
  impersonar(
    @Param('hash') hash: string,
    @Body(new ZodValidationPipe(impersonarSchema)) dto: ImpersonarDto,
    @Req() req: RequestPortal,
  ) {
    LIMITE_IMPERSONAR.consumir(req.ip ?? null);
    return this.servicio.canjearImpersonacion(hash, dto.ticket, req.ip ?? null);
  }

  @Post('cambiar-password')
  cambiarPassword(
    @Body(new ZodValidationPipe(cambiarPasswordSchema)) dto: CambiarPasswordDto,
    @Req() req: RequestPortal,
  ) {
    return this.servicio.cambiarPassword(this.usuario(req), dto, req.ip ?? null);
  }

  @Get('perfil')
  perfil(@Req() req: RequestPortal) {
    return this.servicio.perfil(this.usuario(req));
  }
}
