import { Module } from '@nestjs/common';

import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { PortalOrgController } from './portal-org.controller';
import { PortalOrgService } from './portal-org.service';

@Module({
  imports: [OrganizacionesModule],
  controllers: [PortalOrgController],
  providers: [PortalOrgService],
})
export class PortalOrgModule {}
