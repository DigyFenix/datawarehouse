import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
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
  { etiqueta: 'Indicadores', segmento: 'indicadores' },
  { etiqueta: 'Auditoría', segmento: 'auditoria' },
];

type Operacion = 'razon' | 'porcentaje' | 'suma' | 'resta';

interface Derivada {
  id: number;
  clave: string;
  nombre: string;
  definicion: string;
  operacion: Operacion;
  operandoA: string;
  operandoB: string;
  unidad: 'numero' | 'moneda' | 'porcentaje';
  activa: boolean;
}

interface MetricaOpcion {
  clave: string;
  nombreOficial: string;
  estado: string;
}

const OPERACIONES: { valor: Operacion; etiqueta: string; simbolo: string; ayuda: string }[] = [
  { valor: 'porcentaje', etiqueta: 'Porcentaje', simbolo: '÷ … × 100', ayuda: 'Qué parte del segundo representa el primero. Ej.: margen sobre la venta.' },
  { valor: 'razon', etiqueta: 'Razón', simbolo: '÷', ayuda: 'Cuántas veces cabe el segundo en el primero.' },
  { valor: 'resta', etiqueta: 'Diferencia', simbolo: '−', ayuda: 'El primero menos el segundo. Ej.: posición neta.' },
  { valor: 'suma', etiqueta: 'Suma', simbolo: '+', ayuda: 'Los dos juntos.' },
];

/**
 * Indicadores propios de la organización, compuestos sobre métricas certificadas.
 *
 * Deliberadamente NO se puede escribir una fórmula ni SQL: se eligen dos métricas
 * de la lista y una operación. Todo lo que se pueda construir aquí es verificable
 * y hereda la certificación de sus partes.
 */
@Component({
  selector: 'app-derivadas',
  standalone: true,
  imports: [FormsModule, EmptyComponent, PageHeaderComponent, SkeletonComponent, TabsComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Indicadores propios">
      <button acciones (click)="nuevo()" [disabled]="metricas().length < 2">+ Nuevo indicador</button>
    </app-page-header>

    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <p class="intro">
      Combina dos métricas ya certificadas para obtener un indicador propio de
      {{ tenant.nombre() || 'tu organización' }}. No se escribe ninguna fórmula: eliges las
      métricas y la operación, y el resultado queda disponible para el asistente con la misma
      certificación que sus partes.
    </p>

    @if (cargando()) {
      <div class="tarjeta"><app-skeleton></app-skeleton><app-skeleton></app-skeleton></div>
    } @else if (derivadas().length === 0) {
      <app-empty titulo="Todavía sin indicadores propios">
        Un ejemplo típico: «% de margen» = Margen Bruto ÷ Ventas Netas × 100.
      </app-empty>
    } @else {
      <div class="tarjeta" style="padding:0;">
        <div class="tabla-wrap">
          <table>
            <thead>
              <tr><th>Indicador</th><th>Cómo se calcula</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              @for (d of derivadas(); track d.id) {
                <tr>
                  <td>
                    <strong>{{ d.nombre }}</strong>
                    <div class="def">{{ d.definicion }}</div>
                  </td>
                  <td class="formula">
                    {{ nombreMetrica(d.operandoA) }}
                    <span class="op">{{ simbolo(d.operacion) }}</span>
                    {{ nombreMetrica(d.operandoB) }}
                  </td>
                  <td>
                    @if (d.activa) { <span class="badge badge--ok">Activo</span> }
                    @else { <span class="badge">Inactivo</span> }
                  </td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button class="secundario pequeno" (click)="editar(d)">Editar</button>
                    <button class="secundario pequeno" (click)="borrar(d)">Borrar</button>
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
            <span class="eyebrow">Indicador propio</span>
            <h3>{{ editando() ? 'Editar indicador' : 'Nuevo indicador' }}</h3>
          </header>

          <form (ngSubmit)="guardar()">
            <div class="campo">
              <label for="nombre">Nombre</label>
              <input id="nombre" name="nombre" [(ngModel)]="form.nombre"
                     (ngModelChange)="sugerirClave()" required placeholder="% de margen" />
            </div>

            <div class="campo">
              <label for="definicion">Qué mide</label>
              <textarea id="definicion" name="definicion" rows="2" [(ngModel)]="form.definicion"
                        required placeholder="Qué parte de la venta neta queda como margen."></textarea>
            </div>

            <div class="campo">
              <label for="opA">Primera métrica</label>
              <select id="opA" name="opA" [(ngModel)]="form.operandoA">
                @for (m of metricas(); track m.clave) {
                  <option [ngValue]="m.clave">{{ m.nombreOficial }}</option>
                }
              </select>
            </div>

            <div class="campo">
              <label for="op">Operación</label>
              <select id="op" name="op" [(ngModel)]="form.operacion">
                @for (o of operaciones; track o.valor) {
                  <option [ngValue]="o.valor">{{ o.etiqueta }} ({{ o.simbolo }})</option>
                }
              </select>
              <span class="ayuda">{{ ayudaOperacion() }}</span>
            </div>

            <div class="campo">
              <label for="opB">Segunda métrica</label>
              <select id="opB" name="opB" [(ngModel)]="form.operandoB">
                @for (m of metricas(); track m.clave) {
                  <option [ngValue]="m.clave" [disabled]="m.clave === form.operandoA">
                    {{ m.nombreOficial }}
                  </option>
                }
              </select>
            </div>

            <div class="vista-previa">
              <span class="eyebrow">Quedará así</span>
              <p>
                <strong>{{ form.nombre || 'Sin nombre' }}</strong> =
                {{ nombreMetrica(form.operandoA) }}
                <span class="op">{{ simbolo(form.operacion) }}</span>
                {{ nombreMetrica(form.operandoB) }}
              </p>
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
        margin: -6px 0 18px; max-width: 78ch;
        font-size: 13.5px; line-height: 1.6; color: var(--faint);
      }
      .def { margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: var(--faint); max-width: 44ch; }
      .formula { font-size: 13px; line-height: 1.6; }
      .op {
        display: inline-block; margin: 0 6px; padding: 1px 7px;
        border-radius: 5px; background: var(--surface-2);
        font-family: var(--mono, monospace); font-size: 12px;
      }
      .ayuda { display: block; margin-top: 5px; font-size: 12px; line-height: 1.5; color: var(--faint); }
      .vista-previa {
        margin: 6px 0 14px; padding: 12px 14px;
        border-left: 3px solid var(--marca); border-radius: 0 8px 8px 0;
        background: var(--surface-2);
      }
      .vista-previa p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6; }
      .panel-lateral { position: fixed; inset: 0; z-index: 900; }
      .panel-lateral__fondo { position: absolute; inset: 0; background: color-mix(in srgb, #000 42%, transparent); }
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
export class DerivadasComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly tenant = inject(TenantService);

  readonly derivadas = signal<Derivada[]>([]);
  readonly metricas = signal<MetricaOpcion[]>([]);
  readonly cargando = signal(true);
  readonly abierto = signal(false);
  readonly editando = signal<Derivada | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal<string | null>(null);

  readonly pestanas = PESTANAS;
  readonly operaciones = OPERACIONES;

  form: {
    clave: string;
    nombre: string;
    definicion: string;
    operacion: Operacion;
    operandoA: string;
    operandoB: string;
    unidad: 'numero' | 'moneda' | 'porcentaje';
    activa: boolean;
  } = this.vacio();

  private readonly porClave = computed(
    () => new Map(this.metricas().map((m) => [m.clave, m.nombreOficial])),
  );

  ngOnInit(): void {
    this.cargar();
    this.api.get<MetricaOpcion[]>('/admin/glosario/metricas').subscribe({
      next: (ms) => this.metricas.set(ms),
    });
  }

  nombreMetrica(clave: string): string {
    return this.porClave().get(clave) ?? (clave || '—');
  }

  simbolo(op: Operacion): string {
    return OPERACIONES.find((o) => o.valor === op)?.simbolo ?? '?';
  }

  ayudaOperacion(): string {
    return OPERACIONES.find((o) => o.valor === this.form.operacion)?.ayuda ?? '';
  }

  /** La clave la usa el asistente; se deriva del nombre para que nadie la escriba. */
  sugerirClave(): void {
    if (this.editando()) return;
    this.form.clave = this.form.nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<Derivada[]>('/admin/derivadas').subscribe({
      next: (ds) => {
        this.derivadas.set(ds);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudieron cargar los indicadores', e.message);
      },
    });
  }

  private vacio() {
    return {
      clave: '',
      nombre: '',
      definicion: '',
      operacion: 'porcentaje' as Operacion,
      operandoA: '',
      operandoB: '',
      unidad: 'numero' as const,
      activa: true,
    };
  }

  nuevo(): void {
    this.form = this.vacio();
    const ms = this.metricas();
    this.form.operandoA = ms[0]?.clave ?? '';
    this.form.operandoB = ms[1]?.clave ?? '';
    this.editando.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(d: Derivada): void {
    this.form = { ...d };
    this.editando.set(d);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  guardar(): void {
    this.errorForm.set(null);
    // La unidad se deduce de la operación: un porcentaje no se presenta como moneda.
    this.form.unidad = this.form.operacion === 'porcentaje' ? 'porcentaje' : 'numero';
    this.guardando.set(true);
    const d = this.editando();
    const peticion = d
      ? this.api.put(`/admin/derivadas/${d.id}`, this.form)
      : this.api.post('/admin/derivadas', this.form);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.abierto.set(false);
        this.toast.exito(d ? 'Indicador actualizado' : 'Indicador creado', this.form.nombre);
        this.cargar();
      },
      error: (e: Error) => {
        this.guardando.set(false);
        this.errorForm.set(e.message);
      },
    });
  }

  async borrar(d: Derivada): Promise<void> {
    const seguro = await this.confirm.confirmar({
      titulo: 'Borrar el indicador',
      mensaje: `«${d.nombre}» dejará de estar disponible para el asistente. Las métricas que lo componen no se ven afectadas.`,
      textoConfirmar: 'Borrar',
      peligro: true,
    });
    if (!seguro) return;
    this.api.delete(`/admin/derivadas/${d.id}`).subscribe({
      next: () => {
        this.toast.info('Indicador borrado', d.nombre);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo borrar', e.message),
    });
  }
}
