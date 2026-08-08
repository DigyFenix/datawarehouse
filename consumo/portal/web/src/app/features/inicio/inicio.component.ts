import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { nombreDominio } from '../../core/dominios';
import { TenantService } from '../../core/tenant.service';
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
 * Inicio: además de los accesos, responde de entrada la pregunta que todo el
 * mundo hace antes de mirar un número — "¿hasta cuándo llega este dato?".
 */
@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">{{ tenant.nombre() }}</span>
        <h2>Hola, {{ auth.usuario()?.nombre }}</h2>
      </div>
    </div>

    <div class="modulos">
      <a class="tarjeta modulo" [routerLink]="['/', tenant.hash(), 'tableros']">
        <app-icon name="grafico" [size]="28" />
        <h3>Tableros</h3>
        <p>
          @if (cargando()) { Dashboards de tu organización. }
          @else {
            {{ totalTableros() }}
            {{ totalTableros() === 1 ? 'tablero disponible' : 'tableros disponibles' }}
            para tu perfil de acceso.
          }
        </p>
      </a>
      <a class="tarjeta modulo" [routerLink]="['/', tenant.hash(), 'chatbot']">
        <app-icon name="chatbot" [size]="28" />
        <h3>Asistente</h3>
        <p>Pregunta por tus números en lenguaje natural. Responde solo con métricas certificadas.</p>
      </a>
    </div>

    @if (cargando()) {
      <div class="tarjeta seccion">@for (i of [1, 2, 3]; track i) { <app-skeleton variante="linea" /> }</div>
    }

    @if (recientes().length) {
      <section class="seccion">
        <span class="eyebrow">Vistos recientemente</span>
        <div class="chips">
          @for (t of recientes(); track t.clave) {
            <a class="chip-tablero" [routerLink]="['/', tenant.hash(), 'tableros', t.clave]">
              <app-icon name="grafico" [size]="14" />
              {{ t.nombre }}
            </a>
          }
        </div>
      </section>
    }

    @if (frescura().length) {
      <section class="seccion">
        <span class="eyebrow">Hasta cuándo llega el dato</span>
        <div class="frescura">
          @for (f of frescura(); track f.dominio) {
            <div class="dominio" [attr.data-estado]="f.estado">
              <span class="dominio__nombre">{{ nombreDominio(f.dominio) }}</span>
              <span class="dominio__fecha">
                {{ f.fechaDatoMasReciente ? (f.fechaDatoMasReciente | date: 'dd/MM/yyyy') : 'sin dato' }}
              </span>
              @if (f.estado) { <span class="badge">{{ f.estado }}</span> }
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: [
    `
      .modulos { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 380px)); gap: var(--sp-3); }
      .modulo { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-5); text-decoration: none; color: var(--text); }
      .modulo:hover { border-color: var(--brand-400); box-shadow: var(--sh-2); }
      .modulo app-icon { color: var(--brand-600); }
      .modulo h3 { margin: 4px 0 0; }
      .modulo p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

      .seccion { margin-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
      .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
      .chip-tablero {
        display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
        padding: 6px var(--sp-3); border-radius: 999px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text); font-size: var(--fs-sm);
      }
      .chip-tablero:hover { border-color: var(--brand-400); color: var(--brand-700); }

      .frescura { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--sp-2); }
      .dominio {
        display: flex; flex-direction: column; gap: 2px; padding: var(--sp-3);
        border-radius: var(--r); background: var(--surface); border: 1px solid var(--border);
        border-left: 3px solid var(--ok);
      }
      .dominio[data-estado='Atrasado'] { border-left-color: var(--warn); }
      .dominio[data-estado='Desactualizado'] { border-left-color: var(--danger); }
      .dominio__nombre { font-size: var(--fs-sm); }
      .dominio__fecha { font-family: var(--mono); font-size: var(--fs-xs); color: var(--muted); }
      .dominio .badge { align-self: flex-start; margin-top: 4px; }
    `,
  ],
})
export class InicioComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);

  readonly resumen = signal<ResumenInicio | null>(null);
  readonly cargando = signal(true);
  readonly frescura = computed(() => this.resumen()?.frescura ?? []);
  readonly recientes = computed(() => this.resumen()?.recientes ?? []);
  readonly totalTableros = computed(() => this.resumen()?.tableros ?? 0);

  ngOnInit(): void {
    this.api.get<ResumenInicio>('/inicio').subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargando.set(false);
      },
      // El inicio nunca bloquea: si el resumen falla, quedan los accesos.
      error: () => this.cargando.set(false),
    });
  }

  /** Nombre de negocio del dominio (con tildes); ver core/dominios.ts. */
  nombreDominio = nombreDominio;

  irA(ruta: string): void {
    void this.router.navigate(['/', this.tenant.hash(), ruta]);
  }
}
