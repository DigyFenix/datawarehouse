import { Module } from '@nestjs/common';

import { OrganizacionesController } from './organizaciones.controller';
import { OrganizacionesService } from './organizaciones.service';
import { ProvisionarService } from './provisionar.service';

@Module({
  controllers: [OrganizacionesController],
  providers: [OrganizacionesService, ProvisionarService],
  exports: [OrganizacionesService],
})
export class OrganizacionesModule {}
