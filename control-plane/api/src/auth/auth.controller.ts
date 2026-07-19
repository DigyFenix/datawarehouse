/** Endpoints de autenticación. /login es público; /perfil requiere token. */
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { UsuarioAutenticado } from './jwt-auth.guard';
import { Publico } from './publico.decorator';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginDto = z.infer<typeof loginSchema>;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, req.ip ?? null);
  }

  @Get('perfil')
  perfil(@Req() req: Request) {
    return (req as Request & { user?: UsuarioAutenticado }).user;
  }
}
