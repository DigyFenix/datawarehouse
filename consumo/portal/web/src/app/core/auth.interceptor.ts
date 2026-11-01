/**
 * Interceptor HTTP del portal de usuario:
 * - Adjunta el Bearer del tenant activo SOLO a peticiones hacia nuestro API (`environment.apiUrl`).
 *   Mandarlo a cualquier host filtraría la sesión a un tercero (auditoría M6).
 * - 401 → cierra la sesión y lleva al login del tenant.
 * - 403 y 5xx → aviso global: antes quedaban silenciosos en varias pantallas. Los componentes
 *   pueden seguir mostrando su propio mensaje; el ToastService descarta el repetido.
 */
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { TenantService } from './tenant.service';
import { ToastService } from './toast.service';

/** ¿La URL apunta a nuestro API (mismo origen y bajo la ruta base del API)? */
export function esUrlDelApi(url: string): boolean {
  try {
    const base = new URL(environment.apiUrl, location.origin);
    const destino = new URL(url, location.origin);
    const ruta = base.pathname.replace(/\/+$/, '');
    return destino.origin === base.origin && (destino.pathname === ruta || destino.pathname.startsWith(`${ruta}/`));
  } catch {
    return false;
  }
}

/** Mensaje del servidor dentro del sobre { success, error: { mensaje } }, si lo hay. */
function mensajeDelServidor(e: HttpErrorResponse): string | undefined {
  const cuerpo = e.error as { error?: { mensaje?: unknown } } | null;
  const mensaje = cuerpo && typeof cuerpo === 'object' ? cuerpo.error?.mensaje : undefined;
  return typeof mensaje === 'string' ? mensaje : undefined;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!esUrlDelApi(req.url)) return next(req);

  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const token = tenant.hash() ? auth.token : null;

  const req2 = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(req2).pipe(
    catchError((e: unknown) => {
      if (!(e instanceof HttpErrorResponse)) return throwError(() => e);
      if (e.status === 401 && !req.url.endsWith('/auth/login') && !req.url.endsWith('/auth/impersonar')) {
        auth.logout();
        const hash = tenant.hash();
        if (hash) void router.navigate(['/', hash, 'login']);
      } else if (e.status === 403) {
        toast.error('Sin permiso', mensajeDelServidor(e) ?? 'Tu usuario no tiene acceso a esta acción.');
      } else if (e.status >= 500) {
        toast.error('Error del servidor', mensajeDelServidor(e) ?? 'Algo falló de nuestro lado. Intenta de nuevo en un momento.');
      }
      return throwError(() => e);
    }),
  );
};
