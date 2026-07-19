/** Cliente HTTP central: desempaqueta el contrato { success, data, error } de la API. */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { Respuesta } from './modelos';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(ruta: string): Observable<T> {
    return this.desempaquetar(this.http.get<Respuesta<T>>(`${this.base}${ruta}`));
  }

  post<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.desempaquetar(this.http.post<Respuesta<T>>(`${this.base}${ruta}`, cuerpo));
  }

  put<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.desempaquetar(this.http.put<Respuesta<T>>(`${this.base}${ruta}`, cuerpo));
  }

  delete<T>(ruta: string): Observable<T> {
    return this.desempaquetar(this.http.delete<Respuesta<T>>(`${this.base}${ruta}`));
  }

  private desempaquetar<T>(fuente: Observable<Respuesta<T>>): Observable<T> {
    return fuente.pipe(
      map((r) => {
        if (!r.success || r.data === null) {
          throw new Error(r.error?.mensaje ?? 'Error desconocido');
        }
        return r.data;
      }),
      catchError((e) => throwError(() => new Error(e?.error?.error?.mensaje ?? e.message ?? 'Error de red'))),
    );
  }
}
