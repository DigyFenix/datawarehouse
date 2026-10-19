import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { TableroResumen } from '../../core/modelos';
import { agruparTableros } from '../../core/tableros';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';

/** Grid de tableros permitidos por el perfil del usuario. Sin URLs: se piden al abrir. */
@Component({
  selector: 'app-tableros',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Módulos · Power BI" titulo="Tableros"></app-page-header>

    @if (cargando()) {
      <div class="grid">
        <app-skeleton variante="tarjeta" [alto]="118"></app-skeleton>
        <app-skeleton variante="tarjeta" [alto]="118"></app-skeleton>
        <app-skeleton variante="tarjeta" [alto]="118"></app-skeleton>
      </div>
    } @else {
      @for (g of grupos(); track g.grupo) {
        <section class="grupo">
          @if (g.grupo || grupos().length > 1) { <h3 class="grupo__titulo">{{ g.grupo ?? 'Otros tableros' }}</h3> }
          <div class="grid">
            @for (t of g.tableros; track t.id) {
              <a class="tarjeta tablero" [routerLink]="['/', tenant.hash(), 'tableros', t.clave]">
                <app-icon name="grafico" [size]="24"></app-icon>
                <h3>{{ t.nombre }}</h3>
                @if (t.descripcion) { <p>{{ t.descripcion }}</p> }
              </a>
            }
          </div>
        </section>
      } @empty {
        <div class="tarjeta vacio-caja">
          <app-empty titulo="Sin tableros asignados">
            Tu perfil aún no tiene tableros. Pide acceso al administrador de tu organización.
          </app-empty>
        </div>
      }
    }
  `,
  styles: [`
    .grupo { margin-bottom: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
    .grupo__titulo { margin: 0; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-4); }
    .tablero { display: flex; flex-direction: column; gap: 6px; padding: var(--sp-5); text-decoration: none; color: var(--text); }
    .tablero:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
    .tablero app-icon { color: var(--brand-600); }
    .tablero h3 { margin: 4px 0 0; font-size: 16px; }
    .tablero p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
  `],
})
export class TablerosComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly tableros = signal<TableroResumen[]>([]);
  readonly cargando = signal(true);
  readonly grupos = computed(() => agruparTableros(this.tableros()));

  constructor() {
    this.api.get<TableroResumen[]>('/tableros').subscribe({
      next: (d) => {
        this.tableros.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudieron cargar los tableros', e.message);
        this.cargando.set(false);
      },
    });
  }
}
