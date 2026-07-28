import { Module } from '@nestjs/common';

import { SociedadesController } from './sociedades.controller';
import { SociedadesService } from './sociedades.service';

@Module({
  controllers: [SociedadesController],
  providers: [SociedadesService],
})
export class SociedadesModule {}
