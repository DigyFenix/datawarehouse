/** Añade el Bearer del tenant activo y redirige al login del tenant si hay 401. */
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { TenantService } from './tenant.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);
  const token = auth.token;

  const req2 = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(req2).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401 && !req.url.endsWith('/auth/login')) {
        auth.logout();
        const hash = tenant.hash();
        if (hash) void router.navigate(['/', hash, 'login']);
      }
      return throwError(() => e);
    }),
  );
};
