import { Module } from '@nestjs/common';

import { AccesoController } from './acceso.controller';
import { AccesoService } from './acceso.service';

@Module({
  controllers: [AccesoController],
  providers: [AccesoService],
})
export class AccesoModule {}
