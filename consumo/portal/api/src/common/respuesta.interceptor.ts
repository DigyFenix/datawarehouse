/** Envuelve toda respuesta exitosa en el contrato { success, data, error }. */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ok, RespuestaOk } from './respuesta';

@Injectable()
export class RespuestaInterceptor<T> implements NestInterceptor<T, RespuestaOk<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<RespuestaOk<T>> {
    return next.handle().pipe(map((data) => ok(data)));
  }
}
