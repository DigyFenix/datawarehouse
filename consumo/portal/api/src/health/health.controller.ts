import { Controller, Get } from '@nestjs/common';

import { Publico } from '../auth/publico.decorator';

@Controller('health')
export class HealthController {
  @Publico()
  @Get()
  health() {
    return { estado: 'ok' };
  }
}
