/** Añade el Bearer token a cada request y redirige a /login si la API responde 401. */
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;

  const req2 = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(req2).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401) {
        auth.logout();
        void router.navigate(['/login']);
      }
      return throwError(() => e);
    }),
  );
};
