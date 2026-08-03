import { Module } from '@nestjs/common';

import { OrganizacionesController } from './organizaciones.controller';
import { OrganizacionesService } from './organizaciones.service';

@Module({
  controllers: [OrganizacionesController],
  providers: [OrganizacionesService],
  exports: [OrganizacionesService],
})
export class OrganizacionesModule {}
