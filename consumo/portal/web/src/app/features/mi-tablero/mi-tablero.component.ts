import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { DatosVisualComponent } from '../chatbot/datos-visual.component';
import { ChatService, ConsultaGuardada, EjecucionGuardada, VistaConsulta } from '../chatbot/chat.service';

/**
 * «Mi tablero»: autoservicio del usuario con widgets JS/HTML (no Power BI).
 *
 * Cada widget es una consulta guardada del asistente fijada al tablero: se guarda la
 * ESPECIFICACIÓN (tool + parámetros), y al abrir el tablero cada una se reejecuta con datos
 * frescos bajo las guardas y el alcance de quien lo abre. El usuario acomoda el orden
 * (arrastrar o flechas), el ancho (media fila / fila completa) y la vista (tabla, barras,
 * líneas). Nada aquí recalcula una cifra: el dato llega con su métrica, período y estado.
 */
@Component({
  selector: 'app-mi-tablero',
  standalone: true,
  imports: [DatePipe, RouterLink, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent, DatosVisualComponent],
  template: `
    <app-page-header eyebrow="Autoservicio" titulo="Mi tablero">
      <button acciones class="secundario" (click)="cargar()" [disabled]="cargando()">
        <app-icon name="actualizar" [size]="14" /> Actualizar todo
      </button>
    </app-page-header>

    @if (frescuraTexto(); as f) {
      <p class="frescura"><app-icon name="info" [size]="13" /> {{ f }}</p>
    }

    @if (cargando()) {
      <div class="grilla">
        @for (i of [1, 2, 3, 4]; track i) { <app-skeleton variante="tarjeta" [alto]="300" /> }
      </div>
    } @else if (widgets().length === 0) {
      <div class="tarjeta vacio-caja">
        <app-empty titulo="Tu tablero está vacío">
          Pide una tabla o un ranking en el <a [routerLink]="['/', tenant.hash(), 'chatbot']">asistente</a>, guárdalo y marca
          «Agregar a Mi tablero». También puedes fijar cualquiera de tus consultas guardadas desde la pestaña «Guardadas».
        </app-empty>
      </div>
    } @else {
      <div class="grilla">
        @for (w of widgets(); track w.consulta.id; let i = $index) {
          <section
            class="widget tarjeta"
            [class.widget--ancho]="w.consulta.tableroAncho === 2"
            [class.widget--arrastrando]="arrastrando() === w.consulta.id"
            [class.widget--destino]="destino() === w.consulta.id"
            draggable="true"
            (dragstart)="alArrastrar($event, w.consulta.id)"
            (dragover)="alPasar($event, w.consulta.id)"
            (dragleave)="destino.set(null)"
            (drop)="alSoltar($event, w.consulta.id)"
            (dragend)="arrastrando.set(null); destino.set(null)"
          >
            <header class="widget__cab">
              <span class="widget__asa" title="Arrastra para reordenar" aria-hidden="true">⋮⋮</span>
              <div class="widget__titulos">
                <strong>{{ w.consulta.titulo }}</strong>
                @if (w.consulta.descripcion) { <span class="sutil">{{ w.consulta.descripcion }}</span> }
              </div>
              <div class="widget__acciones">
                <button class="icono" (click)="mover(i, -1)" [disabled]="i === 0" title="Mover antes" aria-label="Mover antes">‹</button>
                <button class="icono" (click)="mover(i, 1)" [disabled]="i === widgets().length - 1" title="Mover después" aria-label="Mover después">›</button>
                <button class="icono" (click)="alternarAncho(w.consulta)" [title]="w.consulta.tableroAncho === 2 ? 'Media fila' : 'Fila completa'" aria-label="Cambiar ancho">
                  {{ w.consulta.tableroAncho === 2 ? '⊟' : '⊞' }}
                </button>
                <button class="icono" (click)="quitar(w.consulta)" title="Quitar del tablero" aria-label="Quitar del tablero">
                  <app-icon name="cerrar" [size]="14" />
                </button>
              </div>
            </header>

            @if (w.ok && w.conjunto) {
              <app-datos-visual [conjunto]="w.conjunto" [vistaInicial]="w.consulta.vista" (vistaCambiada)="guardarVista(w.consulta, $event)" />
            } @else {
              <div class="widget__error">
                <app-icon name="advertencia" [size]="14" /> {{ w.motivo ?? 'Esta consulta no se pudo ejecutar.' }}
              </div>
            }
            @for (a of w.avisos; track a) { <p class="aviso">{{ a }}</p> }
            <footer class="widget__pie">
              Ejecutada {{ w.ejecutadaEn | date: 'dd/MM HH:mm' }}
              @if (frescuraDe(w); as f) { · dato al {{ f }} }
            </footer>
          </section>
        }
      </div>
    }
  `,
  styles: [`
    .frescura { display: flex; align-items: center; gap: 6px; margin: 0 0 var(--sp-3); color: var(--muted); font-size: var(--fs-xs); }
    .grilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
    .widget { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); min-width: 0; transition: box-shadow .15s, opacity .15s; }
    .widget--ancho { grid-column: 1 / -1; }
    .widget--arrastrando { opacity: .45; }
    .widget--destino { box-shadow: 0 0 0 2px var(--amber-500); }
    .widget__cab { display: flex; align-items: flex-start; gap: var(--sp-2); }
    .widget__asa { cursor: grab; color: var(--faint); font-size: 14px; letter-spacing: -2px; user-select: none; padding-top: 2px; }
    .widget__titulos { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .widget__titulos strong { font-size: var(--fs-base); }
    .sutil { font-size: var(--fs-xs); color: var(--muted); }
    .widget__acciones { display: inline-flex; gap: 2px; }
    .icono { background: none; border: 1px solid transparent; color: var(--muted); padding: 2px 7px; border-radius: var(--r-sm); font-size: 15px; line-height: 1.2; cursor: pointer; }
    .icono:hover:not(:disabled) { background: var(--surface-2); color: var(--text); border-color: var(--border-2); }
    .icono:disabled { opacity: .35; cursor: default; }
    .widget__error { display: flex; gap: 8px; align-items: flex-start; color: var(--warn); background: var(--warn-bg); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm); font-size: var(--fs-sm); }
    .aviso { margin: 0; color: var(--warn); font-size: var(--fs-xs); }
    .widget__pie { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--faint); }
    @media (max-width: 880px) { .grilla { grid-template-columns: 1fr; } .widget--ancho { grid-column: auto; } }
  `],
})
export class MiTableroComponent implements OnInit {
  private readonly chat = inject(ChatService);
  private readonly toast = inject(ToastService);
  private readonly confirmar = inject(ConfirmService);
  readonly tenant = inject(TenantService);

  readonly widgets = signal<EjecucionGuardada[]>([]);
  readonly cargando = signal(true);
  readonly arrastrando = signal<number | null>(null);
  readonly destino = signal<number | null>(null);

  /** Frescura común: el dato más reciente informado por cualquier widget y la próxima carga. */
  readonly frescuraTexto = computed(() => {
    const ws = this.widgets();
    const fechas = ws.flatMap((w) => w.frescura.map((f) => f.fechaDatoMasReciente)).filter((f): f is string => !!f);
    const proxima = ws.find((w) => w.proximaCarga)?.proximaCarga ?? null;
    if (!fechas.length && !proxima) return null;
    const partes: string[] = [];
    if (fechas.length) partes.push(`Datos al ${fechas.sort()[fechas.length - 1]}`);
    if (proxima) partes.push(`próxima actualización ${proxima.texto}`);
    return partes.join(' · ');
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.chat.tablero().subscribe({
      next: (ws) => {
        this.widgets.set(ws);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudo cargar el tablero', e.message);
      },
    });
  }

  frescuraDe(w: EjecucionGuardada): string | null {
    const fechas = w.frescura.map((f) => f.fechaDatoMasReciente).filter((f): f is string => !!f);
    return fechas.length ? fechas.sort()[fechas.length - 1] : null;
  }

  // ---------------------------------------------------------------- orden

  mover(indice: number, delta: number): void {
    const ws = [...this.widgets()];
    const destino = indice + delta;
    if (destino < 0 || destino >= ws.length) return;
    [ws[indice], ws[destino]] = [ws[destino], ws[indice]];
    this.aplicarOrden(ws);
  }

  alArrastrar(e: DragEvent, id: number): void {
    this.arrastrando.set(id);
    e.dataTransfer?.setData('text/plain', String(id));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  alPasar(e: DragEvent, id: number): void {
    if (this.arrastrando() === null || this.arrastrando() === id) return;
    e.preventDefault();
    this.destino.set(id);
  }

  alSoltar(e: DragEvent, idDestino: number): void {
    e.preventDefault();
    const idOrigen = this.arrastrando();
    this.arrastrando.set(null);
    this.destino.set(null);
    if (idOrigen === null || idOrigen === idDestino) return;
    const ws = [...this.widgets()];
    const desde = ws.findIndex((w) => w.consulta.id === idOrigen);
    const hasta = ws.findIndex((w) => w.consulta.id === idDestino);
    if (desde < 0 || hasta < 0) return;
    const [movido] = ws.splice(desde, 1);
    ws.splice(hasta, 0, movido);
    this.aplicarOrden(ws);
  }

  private aplicarOrden(ws: EjecucionGuardada[]): void {
    this.widgets.set(ws);
    this.chat.ordenarTablero(ws.map((w) => w.consulta.id)).subscribe({
      error: (e: Error) => this.toast.error('No se pudo guardar el orden', e.message),
    });
  }

  // ---------------------------------------------------------------- ancho, vista, quitar

  alternarAncho(c: ConsultaGuardada): void {
    const tableroAncho = c.tableroAncho === 2 ? 1 : 2;
    this.chat.actualizarGuardada(c.id, { tableroAncho }).subscribe({
      next: (g) => this.reemplazar(g),
      error: (e: Error) => this.toast.error('No se pudo cambiar el ancho', e.message),
    });
  }

  guardarVista(c: ConsultaGuardada, vista: VistaConsulta): void {
    if (vista === c.vista) return;
    this.chat.actualizarGuardada(c.id, { vista }).subscribe({
      next: (g) => this.reemplazar(g),
      error: () => undefined, // la vista cambió en pantalla; si no se persiste, no bloquea
    });
  }

  async quitar(c: ConsultaGuardada): Promise<void> {
    const ok = await this.confirmar.confirmar({
      titulo: 'Quitar del tablero',
      mensaje: `«${c.titulo}» deja de verse aquí. La consulta sigue en tus guardadas.`,
      textoConfirmar: 'Quitar',
    });
    if (!ok) return;
    this.chat.actualizarGuardada(c.id, { enTablero: false }).subscribe({
      next: () => this.widgets.update((ws) => ws.filter((w) => w.consulta.id !== c.id)),
      error: (e: Error) => this.toast.error('No se pudo quitar', e.message),
    });
  }

  private reemplazar(g: ConsultaGuardada): void {
    this.widgets.update((ws) => ws.map((w) => (w.consulta.id === g.id ? { ...w, consulta: g } : w)));
  }
}
