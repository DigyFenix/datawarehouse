import { Module } from '@nestjs/common';

import { GlosarioController } from './glosario.controller';
import { GlosarioService } from './glosario.service';

@Module({
  controllers: [GlosarioController],
  providers: [GlosarioService],
})
export class GlosarioModule {}
