import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { nombreDominio } from '../../core/dominios';
import { TableroResumen } from '../../core/modelos';
import { agruparTableros } from '../../core/tableros';
import { TenantService } from '../../core/tenant.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { SkeletonComponent } from '../../ui/skeleton.component';

interface FrescuraDominio {
  dominio: string;
  fechaDatoMasReciente: string | null;
  estado: string | null;
}

interface ResumenInicio {
  frescura: FrescuraDominio[];
  proximaCarga: { iso: string; texto: string; minutos: number } | null;
  tableros: number;
  recientes: { clave: string; nombre: string; visto: string }[];
}

/**
 * Inicio: los tableros del perfil, agrupados por familia (Ventas, Clientes,
 * Inventario, Finanzas…) como en Kraken 360, y la respuesta a la pregunta que
 * todo el mundo hace antes de mirar un número — "¿hasta cuándo llega este dato?".
 */
@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyComponent, IconComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">{{ tenant.nombre() }}</span>
        <h2>Hola, {{ auth.usuario()?.nombre }}</h2>
      </div>
    </div>

    <!-- Estado del dato arriba: es lo primero que hay que saber antes de mirar un número. -->
    @if (frescura().length) {
      <aside class="estado" aria-label="Hasta cuándo llega el dato">
        <span class="estado__rotulo"><app-icon name="info" [size]="14" /> Datos al</span>
        @for (f of frescura(); track f.dominio) {
          <span class="estado__item" [attr.data-estado]="f.estado" [attr.title]="f.estado ?? null">
            <span class="punto" aria-hidden="true"></span>
            {{ nombreDominio(f.dominio) }}
            <span class="estado__fecha">{{ f.fechaDatoMasReciente ? (f.fechaDatoMasReciente | date: 'dd/MM') : 'sin dato' }}</span>
          </span>
        }
        @if (resumen()?.proximaCarga; as pc) {
          <span class="estado__proxima">Próxima actualización <strong>{{ pc.texto }}</strong></span>
        }
      </aside>
    }

    @if (recientes().length) {
      <section class="grupo">
        <h3 class="grupo__titulo">Seguir donde quedaste</h3>
        <div class="recientes">
          @for (r of recientes(); track r.clave) {
            <a class="reciente" [routerLink]="['/', tenant.hash(), 'tableros', r.clave]">
              <app-icon name="grafico" [size]="16" />
              <span>{{ r.nombre }}</span>
              <span class="reciente__cuando">{{ r.visto | date: 'dd/MM HH:mm' }}</span>
            </a>
          }
        </div>
      </section>
    }

    @if (cargandoTableros()) {
      <div class="grid">
        @for (i of [1, 2, 3, 4]; track i) { <app-skeleton variante="tarjeta" [alto]="92" /> }
      </div>
    } @else {
      @for (g of grupos(); track g.grupo) {
        <section class="grupo">
          @if (g.grupo || grupos().length > 1) {
            <h3 class="grupo__titulo">{{ g.grupo ?? 'Otros tableros' }}</h3>
          }
          <div class="grid">
            @for (t of g.tableros; track t.id) {
              <a class="tarjeta tablero" [routerLink]="['/', tenant.hash(), 'tableros', t.clave]">
                <app-icon name="grafico" [size]="20" />
                <span class="tablero__nombre">{{ t.nombre }}</span>
                @if (t.descripcion) { <span class="tablero__desc">{{ t.descripcion }}</span> }
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
  styles: [
    `
      .estado {
        margin-top: var(--sp-3); padding: 10px 14px; border-radius: var(--r); background: var(--surface); border: 1px solid var(--border);
        display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; color: var(--muted); font-size: var(--fs-xs);
      }
      .estado__rotulo { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
      .estado__item { display: inline-flex; align-items: center; gap: 5px; }
      .estado__fecha { font-variant-numeric: tabular-nums; color: var(--text); }
      .estado__proxima { margin-left: auto; }
      .estado__proxima strong { color: var(--text); font-weight: 600; }
      .punto { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); flex: none; }
      .estado__item[data-estado='Atrasado'] .punto { background: var(--warn); }
      .estado__item[data-estado='Desactualizado'] .punto { background: var(--danger); }

      .recientes { display: flex; flex-wrap: wrap; gap: 8px; }
      .reciente {
        display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--surface);
        border: 1px solid var(--border); color: var(--text); text-decoration: none; font-size: var(--fs-sm); font-weight: 500;
      }
      .reciente:hover { border-color: var(--brand-400); }
      .reciente app-icon { color: var(--brand-600); }
      .reciente__cuando { color: var(--faint); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }

      .grupo { margin-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
      .grupo__titulo { margin: 0; font-size: var(--fs-base); font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--sp-3); }
      .tablero { display: flex; flex-direction: column; gap: 6px; padding: var(--sp-4); text-decoration: none; color: var(--text); }
      .tablero:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
      .tablero app-icon { color: var(--brand-600); }
      .tablero__nombre { font-weight: 600; font-size: 15px; }
      .tablero__desc { color: var(--muted); font-size: var(--fs-sm); }
      @media (max-width: 720px) { .estado__proxima { margin-left: 0; } }
    `,
  ],
})
export class InicioComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);

  readonly resumen = signal<ResumenInicio | null>(null);
  private readonly tableros = signal<TableroResumen[]>([]);
  readonly cargandoTableros = signal(true);
  readonly frescura = computed(() => this.resumen()?.frescura ?? []);
  readonly grupos = computed(() => agruparTableros(this.tableros()));
  readonly recientes = computed(() => (this.resumen()?.recientes ?? []).slice(0, 6));

  ngOnInit(): void {
    this.api.get<TableroResumen[]>('/tableros').subscribe({
      next: (lista) => {
        this.tableros.set(lista);
        this.cargandoTableros.set(false);
      },
      // Sin tableros queda el estado vacío; el error ya lo registra el API.
      error: () => this.cargandoTableros.set(false),
    });
    // El inicio nunca bloquea: si el resumen falla, solo falta la línea de frescura.
    this.api.get<ResumenInicio>('/inicio').subscribe({
      next: (r) => this.resumen.set(r),
      error: () => this.resumen.set(null),
    });
  }

  /** Nombre de negocio del dominio (con tildes); ver core/dominios.ts. */
  nombreDominio = nombreDominio;
}
