import { Module } from '@nestjs/common';

import { TablerosController } from './tableros.controller';
import { TablerosService } from './tableros.service';

@Module({
  controllers: [TablerosController],
  providers: [TablerosService],
})
export class TablerosModule {}
