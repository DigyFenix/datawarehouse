import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TableroResumen } from '../../core/modelos';
import { agruparTableros } from '../../core/tableros';
import { TablerosService } from '../../core/tableros.service';
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
  imports: [FormsModule, RouterLink, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Explorar" titulo="Tableros"></app-page-header>

    @if (!cargando() && tableros().length > 6) {
      <div class="filtros">
        <input class="buscar" type="search" placeholder="Buscar tablero…" [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" name="filtro" aria-label="Buscar tablero" />
        <div class="familias" role="tablist" aria-label="Familia">
          <button type="button" class="familia" role="tab" [class.familia--on]="familia() === null" [attr.aria-selected]="familia() === null" (click)="familia.set(null)">Todos <span>{{ tableros().length }}</span></button>
          @for (g of todosLosGrupos(); track g.grupo) {
            <button type="button" class="familia" role="tab" [class.familia--on]="familia() === g.grupo" [attr.aria-selected]="familia() === g.grupo" (click)="familia.set(g.grupo)">{{ g.grupo ?? 'Otros' }} <span>{{ g.tableros.length }}</span></button>
          }
        </div>
      </div>
    }

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
          @if (errorCarga()) {
            <app-empty titulo="No se pudieron cargar los tableros">{{ errorCarga() }}</app-empty>
          } @else if (tableros().length) {
            <app-empty titulo="Ningún tablero coincide">Prueba con otra palabra o quita el filtro de familia.</app-empty>
          } @else {
            <app-empty titulo="Sin tableros asignados">
              Tu perfil aún no tiene tableros. Pide acceso al administrador de tu organización.
            </app-empty>
          }
        </div>
      }
    }
  `,
  styles: [`
    .filtros { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-bottom: var(--sp-4); }
    .buscar { flex: 1 1 240px; max-width: 360px; }
    .familias { display: flex; flex-wrap: wrap; gap: 6px; }
    .familia { min-height: 0; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text); font-size: var(--fs-sm); font-weight: 500; cursor: pointer; }
    .familia span { color: var(--faint); font-weight: 400; margin-left: 3px; }
    .familia--on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
    .familia--on span { color: rgba(255,255,255,.8); }
    .grupo { margin-bottom: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
    .grupo__titulo { margin: 0; font-size: var(--fs-base); font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-4); }
    .tablero { display: flex; flex-direction: column; gap: 6px; padding: var(--sp-5); text-decoration: none; color: var(--text); }
    .tablero:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
    .tablero app-icon { color: var(--brand-600); }
    .tablero h3 { margin: 4px 0 0; font-size: 16px; }
    .tablero p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
  `],
})
export class TablerosComponent {
  private readonly tablerosSrv = inject(TablerosService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly tableros = signal<TableroResumen[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal<string | null>(null);
  readonly filtro = signal('');
  readonly familia = signal<string | null>(null);
  readonly todosLosGrupos = computed(() => agruparTableros(this.tableros()));
  /** Grupos visibles: filtrados por texto y por familia elegida. */
  readonly grupos = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    const fam = this.familia();
    return agruparTableros(
      this.tableros().filter((t) => (fam === null || (t.grupo?.trim() || null) === fam) && (!q || `${t.nombre} ${t.descripcion ?? ''}`.toLowerCase().includes(q))),
    );
  });

  constructor() {
    this.tablerosSrv.listar().subscribe({
      next: (d) => {
        this.tableros.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudieron cargar los tableros', e.message);
        this.errorCarga.set(e.message);
        this.cargando.set(false);
      },
    });
  }
}
