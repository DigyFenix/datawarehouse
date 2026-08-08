import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { nombreDominio } from '../../core/dominios';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { PestanaTab, TabsComponent } from '../../ui/tabs.component';

const PESTANAS: PestanaTab[] = [
  { etiqueta: 'Usuarios', segmento: 'usuarios' },
  { etiqueta: 'Perfiles', segmento: 'perfiles' },
  { etiqueta: 'Glosario', segmento: 'glosario' },
  { etiqueta: 'Auditoría', segmento: 'auditoria' },
];

interface Termino {
  id: number;
  termino: string;
  definicion: string;
  equivaleA: string | null;
  dominio: string | null;
  creadoPor: string | null;
}

interface MetricaOpcion {
  clave: string;
  nombreOficial: string;
  estado: string;
}

/**
 * Glosario de la organización: cómo habla SU gente.
 *
 * El agente lo usa para traducir la pregunta a una métrica del catálogo, y se
 * superpone al glosario base del producto — si aquí se define «cartera», esa
 * definición gana sobre la genérica.
 */
@Component({
  selector: 'app-glosario',
  standalone: true,
  imports: [FormsModule, EmptyComponent, PageHeaderComponent, SkeletonComponent, TabsComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Glosario del negocio">
      <button acciones (click)="nuevo()">+ Nuevo término</button>
    </app-page-header>

    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <p class="intro">
      Cómo habla tu gente. El asistente usa estas palabras para entender qué le están
      preguntando, y lo que definas aquí <strong>manda</strong> sobre el vocabulario general
      del producto.
    </p>

    @if (cargando()) {
      <div class="tarjeta"><app-skeleton></app-skeleton><app-skeleton></app-skeleton><app-skeleton></app-skeleton></div>
    } @else if (terminos().length === 0) {
      <app-empty titulo="Todavía sin términos propios">
        El asistente funciona con el vocabulario general del producto. Agrega aquí las
        palabras que sólo se usan en {{ tenant.nombre() || 'tu organización' }}.
      </app-empty>
    } @else {
      <div class="tarjeta" style="padding:0;">
        <div class="tabla-wrap">
          <table>
            <thead>
              <tr><th>Término</th><th>Significa</th><th>Consulta la métrica</th><th></th></tr>
            </thead>
            <tbody>
              @for (t of terminos(); track t.id) {
                <tr>
                  <td>
                    <strong>{{ t.termino }}</strong>
                    @if (t.dominio) { <span class="dom">{{ nombreDominio(t.dominio) }}</span> }
                  </td>
                  <td class="def">{{ t.definicion }}</td>
                  <td>
                    @if (t.equivaleA) {
                      <span class="badge badge--pill">{{ nombreMetrica(t.equivaleA) }}</span>
                    } @else {
                      <span class="sin">Sólo vocabulario</span>
                    }
                  </td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button class="secundario pequeno" (click)="editar(t)">Editar</button>
                    <button class="secundario pequeno" (click)="borrar(t)">Borrar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (abierto()) {
      <div class="panel-lateral" role="dialog" aria-modal="true">
        <div class="panel-lateral__fondo" (click)="cerrar()"></div>
        <div class="panel-lateral__caja">
          <header>
            <span class="eyebrow">Glosario</span>
            <h3>{{ editando() ? 'Editar término' : 'Nuevo término' }}</h3>
          </header>

          <form (ngSubmit)="guardar()">
            <div class="campo">
              <label for="termino">Término</label>
              <input id="termino" name="termino" [(ngModel)]="form.termino" required
                     placeholder="cliente de ruta" />
              <span class="ayuda">La palabra tal como la dice la gente, no como aparece en el sistema.</span>
            </div>

            <div class="campo">
              <label for="definicion">Qué significa</label>
              <textarea id="definicion" name="definicion" rows="3" [(ngModel)]="form.definicion" required
                        placeholder="Cliente que se atiende con vehículo propio en una ruta fija semanal."></textarea>
            </div>

            <div class="campo">
              <label for="equivale">Consulta la métrica</label>
              <select id="equivale" name="equivale" [(ngModel)]="form.equivaleA">
                <option [ngValue]="null">Sólo vocabulario (no consulta ninguna)</option>
                @for (m of metricas(); track m.clave) {
                  <option [ngValue]="m.clave">{{ m.nombreOficial }}</option>
                }
              </select>
              <span class="ayuda">
                Si eliges una, cuando alguien use esta palabra el asistente consultará esa métrica.
                Déjalo en «sólo vocabulario» si el término explica un concepto sin cifra propia.
              </span>
            </div>

            @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }

            <div class="acciones-fila">
              <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
              <button type="submit" [disabled]="guardando()">
                {{ guardando() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .intro {
        margin: -6px 0 18px; max-width: 76ch;
        font-size: 13.5px; line-height: 1.6; color: var(--faint);
      }
      .intro strong { color: var(--texto); }
      .def { max-width: 46ch; line-height: 1.5; }
      .dom {
        margin-left: 8px; font-size: 11.5px; color: var(--faint);
      }
      .sin { font-size: 12.5px; color: var(--faint); }
      .ayuda {
        display: block; margin-top: 5px;
        font-size: 12px; line-height: 1.5; color: var(--faint);
      }
      .panel-lateral { position: fixed; inset: 0; z-index: 900; }
      .panel-lateral__fondo {
        position: absolute; inset: 0;
        background: color-mix(in srgb, #000 42%, transparent);
      }
      .panel-lateral__caja {
        position: absolute; top: 0; right: 0; bottom: 0; width: min(480px, 100%);
        overflow-y: auto; padding: var(--sp-5);
        background: var(--surface); border-left: 1px solid var(--borde);
      }
      .panel-lateral__caja header { margin-bottom: var(--sp-4); }
      .panel-lateral__caja h3 { margin: 2px 0 0; font-size: 17px; }
    `,
  ],
})
export class GlosarioComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly tenant = inject(TenantService);

  readonly terminos = signal<Termino[]>([]);
  readonly metricas = signal<MetricaOpcion[]>([]);
  readonly cargando = signal(true);
  readonly abierto = signal(false);
  readonly editando = signal<Termino | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal<string | null>(null);

  form: { termino: string; definicion: string; equivaleA: string | null } = {
    termino: '',
    definicion: '',
    equivaleA: null,
  };

  readonly nombreDominio = nombreDominio;
  readonly pestanas = PESTANAS;

  private readonly porClave = computed(
    () => new Map(this.metricas().map((m) => [m.clave, m.nombreOficial])),
  );

  ngOnInit(): void {
    this.cargar();
    this.api
      .get<MetricaOpcion[]>('/admin/glosario/metricas')
      .subscribe({ next: (ms) => this.metricas.set(ms) });
  }

  nombreMetrica(clave: string): string {
    return this.porClave().get(clave) ?? clave;
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<Termino[]>('/admin/glosario').subscribe({
      next: (ts) => {
        this.terminos.set(ts);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudo cargar el glosario', e.message);
      },
    });
  }

  nuevo(): void {
    this.form = { termino: '', definicion: '', equivaleA: null };
    this.editando.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(t: Termino): void {
    this.form = { termino: t.termino, definicion: t.definicion, equivaleA: t.equivaleA };
    this.editando.set(t);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const t = this.editando();
    const peticion = t
      ? this.api.put(`/admin/glosario/${t.id}`, this.form)
      : this.api.post('/admin/glosario', this.form);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.abierto.set(false);
        this.toast.exito(t ? 'Término actualizado' : 'Término agregado', this.form.termino);
        this.cargar();
      },
      error: (e: Error) => {
        this.guardando.set(false);
        this.errorForm.set(e.message);
      },
    });
  }

  async borrar(t: Termino): Promise<void> {
    const seguro = await this.confirm.confirmar({
      titulo: 'Borrar el término',
      mensaje: `«${t.termino}» dejará de ser reconocido por el asistente. El vocabulario general del producto no se ve afectado.`,
      textoConfirmar: 'Borrar',
      peligro: true,
    });
    if (!seguro) return;
    this.api.delete(`/admin/glosario/${t.id}`).subscribe({
      next: () => {
        this.toast.info('Término borrado', t.termino);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo borrar', e.message),
    });
  }
}
