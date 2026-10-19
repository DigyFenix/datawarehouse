/**
 * Guarda del módulo Asistente: el agente de IA se vende aparte. Si la
 * organización del hash no lo tiene contratado, toda ruta /agente responde 403
 * aunque el usuario esté autenticado. Ocultarlo en la web es cosmético; esta
 * guarda es el control real.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { ControlDbService } from '../db/control-db.service';

@Injectable()
export class ModuloAsistenteGuard implements CanActivate {
  constructor(private readonly controlDb: ControlDbService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const hash = req.params['hash'];
    if (typeof hash !== 'string') throw new ForbiddenException('Módulo no disponible');
    const org = await this.controlDb.organizacionPorHash(hash);
    if (!org.moduloAsistente) throw new ForbiddenException('Módulo Asistente no contratado');
    return true;
  }
}
