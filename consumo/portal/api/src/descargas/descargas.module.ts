/**
 * Módulo de descargas autoservicio (Excel). Reutiliza la lectura gobernada del módulo del
 * agente (ejecutor bajo RLS, empresas, frescura, auditoría); no tiene SQL propio.
 */
import { Module } from '@nestjs/common';

import { AgenteModule } from '../agente/agente.module';
import { DescargasController } from './descargas.controller';
import { DescargasService } from './descargas.service';

@Module({
  imports: [AgenteModule],
  controllers: [DescargasController],
  providers: [DescargasService],
})
export class DescargasModule {}
