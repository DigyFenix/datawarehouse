/**
 * Añade el Bearer token SOLO a las requests hacia nuestro API (environment.apiUrl);
 * a cualquier otro host o ruta no se le entrega el token. Redirige a /login si la API responde 401
 * y homogeniza el mensaje cuando responde 403 (sin permiso para la operación).
 */
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** ¿La URL apunta a nuestro API? Igual a la base o debajo de ella (no `/apiX` ni otro host). */
function esDelApi(url: string): boolean {
  const base = environment.apiUrl.replace(/\/+$/, '');
  return url === base || url.startsWith(`${base}/`);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;

  const req2 =
    token && esDelApi(req.url)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(req2).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401) {
        auth.logout();
        void router.navigate(['/login']);
      }
      if (e.status === 403) {
        // No exponemos el detalle del rol exigido: mensaje homogéneo para el usuario final.
        // ApiService.desempaquetar lee error.error.mensaje, así que se respeta ese contrato.
        const prohibido = new HttpErrorResponse({
          error: {
            success: false,
            data: null,
            error: { codigo: 'PROHIBIDO', mensaje: 'No tienes permiso para esta operación' },
          },
          status: e.status,
          statusText: e.statusText,
          url: e.url ?? undefined,
        });
        return throwError(() => prohibido);
      }
      return throwError(() => e);
    }),
  );
};
