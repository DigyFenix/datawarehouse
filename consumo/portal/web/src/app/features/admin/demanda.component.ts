import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { nombreDominio } from '../../core/dominios';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { TabsComponent } from '../../ui/tabs.component';
import { PESTANAS_ADMIN } from './pestanas';

type TipoSolicitud = 'fuera_catalogo' | 'frescura' | 'sin_autorizacion' | 'desglose_no_admitido' | 'otro';
type EstadoSolicitud = 'nueva' | 'en_revision' | 'atendida' | 'descartada';

interface Solicitud {
  id: number;
  usuarioEmail: string | null;
  usuarioNombre: string | null;
  conversacionId: number | null;
  tipo: TipoSolicitud;
  pregunta: string;
  resumen: string;
  metricaClave: string | null;
  dominio: string | null;
  origen: 'tool' | 'denegacion';
  estado: EstadoSolicitud;
  notaAdmin: string | null;
  creadaEn: string;
  actualizadaEn: string;
}

interface ResumenDemanda {
  total: number;
  nuevas: number;
  porTipo: { tipo: string; total: number }[];
  masPedidas: { clave: string; total: number }[];
}

const NOMBRE_TIPO: Record<TipoSolicitud, string> = {
  fuera_catalogo: 'Fuera del catálogo',
  frescura: 'Dato más reciente que la carga',
  sin_autorizacion: 'Fuera de autorización',
  desglose_no_admitido: 'Desglose no admitido',
  otro: 'Otro',
};

const NOMBRE_ESTADO: Record<EstadoSolicitud, string> = {
  nueva: 'Nueva',
  en_revision: 'En revisión',
  atendida: 'Atendida',
  descartada: 'Descartada',
};

/**
 * Demanda no atendida: lo que la gente le pidió al asistente y la capa semántica no pudo
 * dar. Solo administración. Sirve para decidir qué métrica agregar, qué desglose publicar,
 * a quién ampliar el alcance o si conviene otra carga al día. No cambia nada por sí sola.
 */
@Component({
  selector: 'app-admin-demanda',
  standalone: true,
  imports: [DatePipe, FormsModule, TabsComponent, PageHeaderComponent, SkeletonComponent, EmptyComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Demanda no atendida"></app-page-header>
    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <p class="intro">
      Lo que la gente pidió al asistente y <strong>no se pudo responder</strong> con las métricas
      gobernadas: datos fuera del catálogo, cifras más recientes que la última carga, desgloses no
      publicados o métricas fuera de su alcance. Es la lista de espera del catálogo; nada de esto
      amplía lo que el asistente responde hasta que alguien lo agregue y lo certifique.
    </p>

    @if (resumen(); as r) {
      <div class="kpis">
        <div class="kpi"><span class="kpi__valor">{{ r.nuevas }}</span><span class="kpi__rotulo">nuevas</span></div>
        <div class="kpi"><span class="kpi__valor">{{ r.total }}</span><span class="kpi__rotulo">en total</span></div>
        @for (t of r.porTipo; track t.tipo) {
          <div class="kpi kpi--tipo"><span class="kpi__valor">{{ t.total }}</span><span class="kpi__rotulo">{{ nombreTipo(t.tipo) }}</span></div>
        }
      </div>
      @if (r.masPedidas.length) {
        <p class="mas-pedidas">
          <span class="eyebrow">Más pedidas</span>
          @for (m of r.masPedidas; track m.clave) { <span class="chip">{{ m.clave }} <strong>{{ m.total }}</strong></span> }
        </p>
      }
    }

    <div class="filtros">
      <label>Estado
        <select [ngModel]="filtroEstado()" (ngModelChange)="cambiarFiltro($event)">
          <option value="">Todas</option>
          @for (e of estados; track e) { <option [value]="e">{{ nombreEstado(e) }}</option> }
        </select>
      </label>
    </div>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th>Fecha</th><th>Quién</th><th>Tipo</th><th>Qué pidió</th><th>Relacionado</th><th>Estado</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
            } @else {
              @for (s of solicitudes(); track s.id) {
                <tr [class.fila--nueva]="s.estado === 'nueva'">
                  <td data-label="Fecha" class="mono">{{ s.creadaEn | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td data-label="Quién">{{ s.usuarioNombre ?? s.usuarioEmail ?? '—' }}</td>
                  <td data-label="Tipo"><span class="chip chip--{{ s.tipo }}">{{ nombreTipo(s.tipo) }}</span></td>
                  <td data-label="Qué pidió" class="pedido">
                    <strong>{{ s.resumen }}</strong>
                    <details><summary>Mensaje original</summary><p class="pregunta">{{ s.pregunta }}</p></details>
                    @if (s.notaAdmin) { <p class="nota">Nota: {{ s.notaAdmin }}</p> }
                  </td>
                  <td data-label="Relacionado">
                    @if (s.metricaClave) { <code>{{ s.metricaClave }}</code> }
                    @if (s.dominio) { <span class="sutil">{{ nombreDominio(s.dominio) }}</span> }
                    @if (!s.metricaClave && !s.dominio) { <span class="sutil">—</span> }
                  </td>
                  <td data-label="Estado" class="estado">
                    <select [ngModel]="s.estado" (ngModelChange)="cambiarEstado(s, $event)">
                      @for (e of estados; track e) { <option [value]="e">{{ nombreEstado(e) }}</option> }
                    </select>
                    <button class="pequeno secundario" (click)="editarNota(s)">Nota</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6"><app-empty titulo="Sin solicitudes">
                  Cuando alguien pida algo que el asistente no pueda dar, aparece aquí.
                </app-empty></td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .intro { color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; max-width: 820px; margin: 0 0 var(--sp-4); }
    .kpis { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-3); }
    .kpi { display: flex; flex-direction: column; min-width: 110px; padding: var(--sp-3) var(--sp-4); border: 1px solid var(--border); border-radius: var(--r); background: var(--surface); }
    .kpi__valor { font-family: var(--display); font-size: 24px; letter-spacing: -.02em; }
    .kpi__rotulo { font-size: var(--fs-xs); color: var(--muted); }
    .kpi--tipo .kpi__valor { font-size: 18px; }
    .mas-pedidas { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 var(--sp-4); }
    .chip { display: inline-flex; gap: 6px; align-items: center; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 10px; font-size: var(--fs-xs); white-space: nowrap; }
    .chip--frescura { background: var(--warn-bg); color: var(--warn); }
    .chip--sin_autorizacion { background: var(--danger-bg); color: var(--danger); }
    .chip--desglose_no_admitido { background: var(--info-bg); color: var(--info); }
    .filtros { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-3); }
    .filtros label { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--muted); }
    .mono { font-family: var(--sans); font-variant-numeric: tabular-nums; font-size: 12px; white-space: nowrap; }
    .sutil { font-size: var(--fs-xs); color: var(--faint); }
    .pedido { min-width: 300px; max-width: 520px; }
    .pedido details summary { cursor: pointer; font-size: 11px; color: var(--muted); }
    .pregunta { margin: 6px 0 0; font-size: var(--fs-xs); color: var(--muted); white-space: pre-wrap; }
    .nota { margin: 6px 0 0; font-size: var(--fs-xs); color: var(--brand-700); }
    .estado { display: flex; gap: 6px; align-items: center; min-width: 230px; }
    .estado select { font-size: var(--fs-xs); width: auto; min-width: 130px; padding: 6px 8px; }
    td code { margin-right: 8px; }
    .fila--nueva td:first-child { box-shadow: inset 3px 0 0 var(--amber-500); }
  `],
})
export class DemandaComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS_ADMIN;
  readonly estados: EstadoSolicitud[] = ['nueva', 'en_revision', 'atendida', 'descartada'];
  readonly solicitudes = signal<Solicitud[]>([]);
  readonly resumen = signal<ResumenDemanda | null>(null);
  readonly filtroEstado = signal<string>('');
  readonly cargando = signal(true);
  readonly nombreDominio = nombreDominio;
  readonly hayNuevas = computed(() => (this.resumen()?.nuevas ?? 0) > 0);

  constructor() {
    this.cargar();
  }

  nombreTipo(t: string): string {
    return NOMBRE_TIPO[t as TipoSolicitud] ?? t;
  }
  nombreEstado(e: string): string {
    return NOMBRE_ESTADO[e as EstadoSolicitud] ?? e;
  }

  cambiarFiltro(estado: string): void {
    this.filtroEstado.set(estado);
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    const q = this.filtroEstado() ? `?estado=${this.filtroEstado()}` : '';
    this.api.get<Solicitud[]>(`/admin/solicitudes${q}`).subscribe({
      next: (d) => {
        this.solicitudes.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudo cargar la demanda', e.message);
        this.cargando.set(false);
      },
    });
    this.api.get<ResumenDemanda>('/admin/solicitudes/resumen').subscribe({ next: (r) => this.resumen.set(r), error: () => undefined });
  }

  cambiarEstado(s: Solicitud, estado: EstadoSolicitud): void {
    this.api.patch<Solicitud>(`/admin/solicitudes/${s.id}`, { estado }).subscribe({
      next: (n) => {
        this.solicitudes.update((xs) => xs.map((x) => (x.id === n.id ? n : x)));
        this.api.get<ResumenDemanda>('/admin/solicitudes/resumen').subscribe({ next: (r) => this.resumen.set(r), error: () => undefined });
      },
      error: (e: Error) => this.toast.error('No se pudo actualizar', e.message),
    });
  }

  editarNota(s: Solicitud): void {
    const nota = window.prompt('Nota del administrador (qué se decidió):', s.notaAdmin ?? '');
    if (nota === null) return;
    this.api.patch<Solicitud>(`/admin/solicitudes/${s.id}`, { notaAdmin: nota.trim() || null }).subscribe({
      next: (n) => this.solicitudes.update((xs) => xs.map((x) => (x.id === n.id ? n : x))),
      error: (e: Error) => this.toast.error('No se pudo guardar la nota', e.message),
    });
  }
}
