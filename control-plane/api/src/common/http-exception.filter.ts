/** Traduce cualquier excepción al contrato de error { success:false, data:null, error }. */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { RespuestaError } from './respuesta';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let codigo = 'ERROR_INTERNO';
    let mensaje = 'Error interno del servidor';
    let detalles: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const cuerpo = exception.getResponse();
      codigo = HttpStatus[status] ?? 'ERROR';
      if (typeof cuerpo === 'string') {
        mensaje = cuerpo;
      } else if (cuerpo && typeof cuerpo === 'object') {
        const c = cuerpo as Record<string, unknown>;
        mensaje = (c.message as string) ?? mensaje;
        detalles = c.detalles ?? c.errors;
      }
    } else if (exception instanceof Error) {
      // No filtrar detalles internos al cliente; se registran en servidor.
      this.logger.error(exception.message, exception.stack);
    }

    const respuesta: RespuestaError = {
      success: false,
      data: null,
      error: { codigo, mensaje, ...(detalles ? { detalles } : {}) },
    };
    res.status(status).json(respuesta);
  }
}
