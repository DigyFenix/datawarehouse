import { Module } from '@nestjs/common';

import { NitsAfiliadosController } from './nits-afiliados.controller';
import { NitsAfiliadosService } from './nits-afiliados.service';
import { SociedadesController } from './sociedades.controller';
import { SociedadesService } from './sociedades.service';

@Module({
  controllers: [SociedadesController, NitsAfiliadosController],
  providers: [SociedadesService, NitsAfiliadosService],
})
export class SociedadesModule {}
