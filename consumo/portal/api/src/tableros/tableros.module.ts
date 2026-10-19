import { Module } from '@nestjs/common';

import { TablerosController } from './tableros.controller';
import { PasesVisorService } from './pases-visor.service';
import { TablerosService } from './tableros.service';

@Module({
  controllers: [TablerosController],
  providers: [TablerosService, PasesVisorService],
})
export class TablerosModule {}
