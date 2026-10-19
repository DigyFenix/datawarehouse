/**
 * Tenant activo del portal de usuario. El hash viene en la URL
 * (portal/<hash>/...): identifica a la organización sin revelar su código.
 * Carga el branding público (nombre, color, logo) y aplica el white-label.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Branding, Respuesta } from './modelos';
import { ThemeService } from './theme.service';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);
  private readonly tema = inject(ThemeService);

  private readonly _hash = signal<string | null>(null);
  private readonly _branding = signal<Branding | null>(null);
  private readonly _logoAncho = signal(false);

  readonly hash = this._hash.asReadonly();
  readonly branding = this._branding.asReadonly();
  readonly nombre = computed(() => this._branding()?.nombre ?? 'Portal');
  /** Logo horizontal (wordmark): ya trae el nombre, se muestra grande y sin repetirlo. */
  readonly logoAncho = this._logoAncho.asReadonly();
  readonly moduloAsistente = computed(() => this._branding()?.moduloAsistente ?? false);
  readonly logoUrl = computed(() => {
    const hash = this._hash();
    return hash && this._branding()?.tieneLogo ? `${environment.apiUrl}/t/${hash}/logo` : null;
  });

  /** Fija el tenant de la URL y carga su branding si cambió. */
  activar(hash: string): Observable<Branding> {
    const cambio = this._hash() !== hash;
    this._hash.set(hash);
    if (!cambio && this._branding()) {
      return new Observable((sub) => {
        sub.next(this._branding() as Branding);
        sub.complete();
      });
    }
    return this.http.get<Respuesta<Branding>>(`${environment.apiUrl}/t/${hash}/branding`).pipe(
      map((r) => {
        if (!r.success || !r.data) throw new Error(r.error?.mensaje ?? 'Organización no encontrada');
        return r.data;
      }),
      tap((b) => {
        this._branding.set(b);
        this.tema.aplicar(b.colorMarca);
        this.tema.aplicarTemaDesdeAlmacen(hash);
        document.title = `${b.nombre} — Portal`;
      }),
    );
  }

  /** Mide el logo al cargar: más de 1.6 de ancho por alto se trata como wordmark. */
  medirLogo(evento: Event): void {
    const img = evento.target as HTMLImageElement;
    if (img.naturalHeight > 0) this._logoAncho.set(img.naturalWidth / img.naturalHeight > 1.6);
  }

  /** Hash actual para construir rutas de la API. @throws si no hay tenant activo. */
  exigirHash(): string {
    const hash = this._hash();
    if (!hash) throw new Error('No hay organización activa en la URL');
    return hash;
  }
}
