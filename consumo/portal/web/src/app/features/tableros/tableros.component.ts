import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { TableroResumen } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

/** Grid de tableros permitidos por el perfil del usuario. Sin URLs: se piden al abrir. */
@Component({
  selector: 'app-tableros',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Módulos · Power BI</span>
        <h2>Tableros</h2>
      </div>
    </div>

    <div class="grid">
      @for (t of tableros(); track t.id) {
        <a class="tarjeta tablero" [routerLink]="['/', tenant.hash(), 'tableros', t.clave]">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l3-4 3 3 5-7"></path></svg>
          <h3>{{ t.nombre }}</h3>
          @if (t.descripcion) { <p>{{ t.descripcion }}</p> }
        </a>
      } @empty {
        <div class="tarjeta vacio-caja">
          <strong>Sin tableros asignados</strong>
          <p>Tu perfil aún no tiene tableros. Pide acceso al administrador de tu organización.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .tablero { display: flex; flex-direction: column; gap: 6px; padding: 20px; text-decoration: none; color: var(--text); }
    .tablero:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
    .tablero svg { color: var(--brand-600); }
    .tablero h3 { margin: 4px 0 0; font-size: 16px; }
    .tablero p { margin: 0; color: var(--muted); font-size: 12.5px; }
    .vacio-caja { grid-column: 1 / -1; text-align: center; padding: 40px; }
    .vacio-caja p { color: var(--muted); font-size: 13px; margin: 6px 0 0; }
  `],
})
export class TablerosComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly tableros = signal<TableroResumen[]>([]);

  constructor() {
    this.api.get<TableroResumen[]>('/tableros').subscribe({
      next: (d) => this.tableros.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los tableros', e.message),
    });
  }
}
