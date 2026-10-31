import { Module } from '@nestjs/common';

import { AgenteModule } from '../agente/agente.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AgenteModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
