import { Module } from '@nestjs/common';

import { ConexionesController } from './conexiones.controller';
import { ConexionesService } from './conexiones.service';

@Module({
  controllers: [ConexionesController],
  providers: [ConexionesService],
})
export class ConexionesModule {}
