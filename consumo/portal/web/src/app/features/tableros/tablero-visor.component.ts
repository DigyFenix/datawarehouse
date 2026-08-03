import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { TableroDetalle } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';

/**
 * Visor del tablero: pide la URL pública (Publish to Web) al abrir — nunca viaja
 * en listados — y la embebe en un iframe. Cada apertura queda auditada en el API.
 */
@Component({
  selector: 'app-tablero-visor',
  standalone: true,
  imports: [RouterLink],
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
        <iframe
          [src]="url"
          title="Tablero de Power BI"
          frameborder="0"
          allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        ></iframe>
      </div>
    } @else if (error()) {
      <div class="tarjeta vacio-caja">
        <strong>No se pudo abrir el tablero</strong>
        <p>{{ error() }}</p>
      </div>
    }
  `,
  styles: [`
    .volver { color: var(--muted); text-decoration: none; font-size: 12px; }
    .volver:hover { color: var(--text); }
    .marco {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r);
      overflow: hidden; height: calc(100vh - 170px); min-height: 480px;
    }
    iframe { width: 100%; height: 100%; display: block; }
    .vacio-caja { text-align: center; padding: 40px; }
    .vacio-caja p { color: var(--muted); font-size: 13px; margin: 6px 0 0; }
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
