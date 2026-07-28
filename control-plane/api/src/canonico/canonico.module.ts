import { Module } from '@nestjs/common';

import { CanonicoController } from './canonico.controller';
import { CanonicoService } from './canonico.service';

@Module({
  controllers: [CanonicoController],
  providers: [CanonicoService],
})
export class CanonicoModule {}
