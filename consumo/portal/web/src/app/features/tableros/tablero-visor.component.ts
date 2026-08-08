import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { TableroDetalle } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { EmptyComponent } from '../../ui/empty.component';

/**
 * Visor del tablero: pide la URL pública (Publish to Web) al abrir — nunca viaja
 * en listados — y la embebe en un iframe. Cada apertura queda auditada en el API.
 * Power BI tarda unos segundos en pintar: se muestra un spinner sobre el marco
 * hasta que el propio iframe dispara `load`.
 */
@Component({
  selector: 'app-tablero-visor',
  standalone: true,
  imports: [RouterLink, EmptyComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">
          <a [routerLink]="['/', tenant.hash(), 'tableros']" class="volver">← Tableros</a>
        </span>
        <h2>{{ tablero()?.nombre ?? 'Cargando…' }}</h2>
      </div>
    </div>

    @if (urlSegura(); as url) {
      <div class="marco">
        @if (!iframeListo()) {
          <div class="marco__carga" role="status" aria-live="polite">
            <span class="spinner spinner--grande"></span>
            <span>Cargando el tablero…</span>
          </div>
        }
        <iframe
          [src]="url"
          title="Tablero de Power BI"
          frameborder="0"
          allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          [class.oculto]="!iframeListo()"
          (load)="iframeListo.set(true)"
        ></iframe>
      </div>
    } @else if (error()) {
      <div class="tarjeta vacio-caja">
        <app-empty titulo="No se pudo abrir el tablero">{{ error() }}</app-empty>
      </div>
    }
  `,
  styles: [`
    .volver { color: var(--muted); text-decoration: none; font-size: 12px; }
    .volver:hover { color: var(--text); }
    .marco {
      position: relative;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r);
      overflow: hidden; height: calc(100vh - 170px); min-height: 480px;
    }
    iframe { width: 100%; height: 100%; display: block; border: 0; }
    iframe.oculto { visibility: hidden; }
    .marco__carga {
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; background: var(--surface); color: var(--muted); font-size: var(--fs-base);
    }
    .spinner--grande { width: 26px; height: 26px; border-width: 3px; color: var(--brand-600); }
  `],
})
export class TableroVisorComponent {
  private readonly api = inject(ApiService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  readonly tenant = inject(TenantService);

  readonly tablero = signal<TableroDetalle | null>(null);
  readonly urlSegura = signal<SafeResourceUrl | null>(null);
  readonly error = signal<string | null>(null);
  readonly iframeListo = signal(false);

  constructor() {
    const clave = this.ruta.snapshot.paramMap.get('clave');
    if (!clave) {
      this.error.set('Tablero no especificado');
      return;
    }
    this.api.get<TableroDetalle>(`/tableros/${clave}`).subscribe({
      next: (t) => {
        this.tablero.set(t);
        // La URL viene del alta del proveedor (validada https en el API); se marca
        // segura solo para el iframe de este visor.
        this.urlSegura.set(this.sanitizer.bypassSecurityTrustResourceUrl(t.urlPublica));
      },
      error: (e: Error) => this.error.set(e.message),
    });
  }
}
