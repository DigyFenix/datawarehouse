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

    @if (tenant.moduloAsistente()) {
      <section class="grupo">
        <h3 class="grupo__titulo">Asistente</h3>
        <div class="grid">
          <a class="tarjeta tablero" [routerLink]="['/', tenant.hash(), 'chatbot']">
            <app-icon name="chatbot" [size]="20" />
            <span class="tablero__nombre">Pregunta por tus números</span>
            <span class="tablero__desc">Responde solo con métricas certificadas.</span>
          </a>
        </div>
      </section>
    }

    @if (frescura().length) {
      <!-- Informativo, no navegable: texto sobre el fondo, sin tarjetas ni bordes que parezcan botones. -->
      <aside class="frescura" aria-label="Hasta cuándo llega el dato">
        <app-icon name="info" [size]="14" />
        <span class="frescura__rotulo">Datos al</span>
        @for (f of frescura(); track f.dominio; let ultimo = $last) {
          <span class="frescura__item" [attr.data-estado]="f.estado" [attr.title]="f.estado ?? null">
            <span class="punto" aria-hidden="true"></span>
            {{ nombreDominio(f.dominio) }}
            <span class="frescura__fecha">{{ f.fechaDatoMasReciente ? (f.fechaDatoMasReciente | date: 'dd/MM/yyyy') : 'sin dato' }}</span>
            @if (f.estado && f.estado !== 'Al día') { <span class="frescura__estado">({{ f.estado }})</span> }
          </span>
          @if (!ultimo) { <span class="frescura__sep" aria-hidden="true">·</span> }
        }
      </aside>
    }
  `,
  styles: [
    `
      .grupo { margin-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
      .grupo:first-of-type { margin-top: var(--sp-3); }
      .grupo__titulo {
        margin: 0; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.04em; color: var(--muted);
      }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--sp-3); }
      .tablero {
        display: flex; flex-direction: column; gap: 6px; padding: var(--sp-4);
        text-decoration: none; color: var(--text);
      }
      .tablero:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
      .tablero app-icon { color: var(--brand-600); }
      .tablero__nombre { font-weight: 600; font-size: 15px; }
      .tablero__desc { color: var(--muted); font-size: var(--fs-sm); }

      .frescura {
        margin-top: var(--sp-6, 40px); padding-top: var(--sp-3); border-top: 1px solid var(--border);
        display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px;
        color: var(--muted); font-size: var(--fs-xs);
      }
      .frescura__rotulo { font-weight: 600; }
      .frescura__item { display: inline-flex; align-items: center; gap: 5px; }
      .frescura__fecha { font-family: var(--mono); color: var(--text); }
      .frescura__sep { opacity: 0.5; }
      .punto { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); flex: none; }
      .frescura__item[data-estado='Atrasado'] .punto { background: var(--warn); }
      .frescura__item[data-estado='Desactualizado'] .punto { background: var(--danger); }
      .frescura__item[data-estado='Desactualizado'] .frescura__estado { color: var(--danger); }
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
