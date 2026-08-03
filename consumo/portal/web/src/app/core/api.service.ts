/**
 * Cliente HTTP central: desempaqueta { success, data, error } y antepone el
 * tenant de la URL (/api/t/<hash>) a todas las rutas.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { Respuesta } from './modelos';
import { TenantService } from './tenant.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly tenant = inject(TenantService);

  private base(): string {
    return `${environment.apiUrl}/t/${this.tenant.exigirHash()}`;
  }

  get<T>(ruta: string): Observable<T> {
    return this.desempaquetar(this.http.get<Respuesta<T>>(`${this.base()}${ruta}`));
  }

  post<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.desempaquetar(this.http.post<Respuesta<T>>(`${this.base()}${ruta}`, cuerpo));
  }

  put<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.desempaquetar(this.http.put<Respuesta<T>>(`${this.base()}${ruta}`, cuerpo));
  }

  delete<T>(ruta: string): Observable<T> {
    return this.desempaquetar(this.http.delete<Respuesta<T>>(`${this.base()}${ruta}`));
  }

  private desempaquetar<T>(fuente: Observable<Respuesta<T>>): Observable<T> {
    return fuente.pipe(
      map((r) => {
        if (!r.success || r.data === null) {
          throw new Error(r.error?.mensaje ?? 'Error desconocido');
        }
        return r.data;
      }),
      catchError((e) => {
        const err = e?.error?.error;
        let mensaje = err?.mensaje ?? e.message ?? 'Error de red';
        const detalles = err?.detalles as { campo: string; mensaje: string }[] | undefined;
        if (Array.isArray(detalles) && detalles.length) {
          mensaje += ': ' + detalles.map((d) => `${d.campo} — ${d.mensaje}`).join('; ');
        }
        return throwError(() => new Error(mensaje));
      }),
    );
  }
}
