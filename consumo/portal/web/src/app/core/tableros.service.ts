/**
 * Lista de tableros del usuario con caché compartida (auditoría §3: `/tableros` se pedía en
 * cada navegación — Inicio, Tableros y el visor). Una sola petición en vuelo por tenant y
 * usuario, reutilizada mientras sea reciente; se invalida al cambiar de sesión, al vencer
 * o cuando el admin cambia asignaciones.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { TableroResumen } from './modelos';
import { TenantService } from './tenant.service';

/** Tiempo de vida de la lista: lo que el admin asigne aparece sin recargar el navegador. */
const VIGENCIA_MS = 5 * 60 * 1000;

interface Cache {
  clave: string;
  creada: number;
  lista$: Observable<TableroResumen[]>;
}

@Injectable({ providedIn: 'root' })
export class TablerosService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);
  private cache: Cache | null = null;

  /** Tableros visibles para el usuario de la sesión (compartida entre pantallas). */
  listar(): Observable<TableroResumen[]> {
    const clave = `${this.tenant.exigirHash()}:${this.auth.usuario()?.id ?? 'anonimo'}`;
    const ahora = Date.now();
    if (!this.cache || this.cache.clave !== clave || ahora - this.cache.creada > VIGENCIA_MS) {
      const lista$ = this.api.get<TableroResumen[]>('/tableros').pipe(
        // Un fallo no se cachea: la próxima pantalla vuelve a intentarlo.
        catchError((e: unknown) => {
          this.invalidar();
          return throwError(() => e);
        }),
        shareReplay(1),
      );
      this.cache = { clave, creada: ahora, lista$ };
    }
    return this.cache.lista$;
  }

  /** Descarta la lista en caché (logout, cambio de asignaciones). */
  invalidar(): void {
    this.cache = null;
  }
}
