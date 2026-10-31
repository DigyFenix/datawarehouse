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

  patch<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.desempaquetar(this.http.patch<Respuesta<T>>(`${this.base()}${ruta}`, cuerpo));
  }

  delete<T>(ruta: string): Observable<T> {
    return this.desempaquetar(this.http.delete<Respuesta<T>>(`${this.base()}${ruta}`));
  }

  /**
   * POST que responde un ARCHIVO (no el sobre { success, data }). El nombre sale de
   * Content-Disposition; un error llega como JSON dentro del blob y se traduce a mensaje.
   */
  postArchivo(ruta: string, cuerpo: unknown): Observable<{ blob: Blob; nombre: string | null }> {
    return this.http
      .post(`${this.base()}${ruta}`, cuerpo, { observe: 'response', responseType: 'blob' })
      .pipe(
        map((r) => {
          const disposicion = r.headers.get('Content-Disposition') ?? '';
          const coincidencia = /filename="?([^";]+)"?/.exec(disposicion);
          return { blob: r.body ?? new Blob(), nombre: coincidencia ? coincidencia[1] : null };
        }),
        catchError((e) => {
          const cuerpoError = e?.error;
          if (cuerpoError instanceof Blob) {
            return new Observable<{ blob: Blob; nombre: string | null }>((obs) => {
              cuerpoError.text().then((texto) => {
                let mensaje = e.message ?? 'Error de red';
                try {
                  const json = JSON.parse(texto) as Respuesta<unknown>;
                  mensaje = json.error?.mensaje ?? mensaje;
                  const detalles = json.error?.detalles as { campo: string; mensaje: string }[] | undefined;
                  if (Array.isArray(detalles) && detalles.length) mensaje += ': ' + detalles.map((d) => `${d.campo} — ${d.mensaje}`).join('; ');
                } catch {
                  // no era JSON: se deja el mensaje genérico
                }
                obs.error(new Error(mensaje));
              });
            });
          }
          return throwError(() => new Error(e?.error?.error?.mensaje ?? e.message ?? 'Error de red'));
        }),
      );
  }

  private desempaquetar<T>(fuente: Observable<Respuesta<T>>): Observable<T> {
    return fuente.pipe(
      map((r) => {
        // Un 204 No Content llega como `null`: es una operación sin cuerpo (los
        // DELETE del API), no un fallo. Leer `.success` sobre null reventaba con
        // «Cannot read properties of null» y eso acababa en el aviso al usuario.
        if (r === null || r === undefined) return undefined as T;
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
