import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SesionService } from './sesion.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, SesionService, AuditoriaPortalService],
  exports: [SesionService, AuditoriaPortalService, JwtModule],
})
export class AuthModule {}
