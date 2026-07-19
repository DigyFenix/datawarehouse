/** Consulta del log de auditoría (solo lectura). Requiere token (guard global). */
import { Controller, Get } from '@nestjs/common';

import { AuditoriaService } from './auditoria.service';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly servicio: AuditoriaService) {}

  @Get()
  listar() {
    return this.servicio.listar();
  }
}
