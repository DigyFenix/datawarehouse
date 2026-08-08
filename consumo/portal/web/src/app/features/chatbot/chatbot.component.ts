import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { ToastService } from '../../core/toast.service';
import { ChatService, Conversacion, MensajeChat } from './chat.service';

/**
 * Chat con el agente de IA gobernado.
 *
 * Las cifras NO se leen del texto del modelo: cada respuesta trae sus tarjetas
 * de dato (métrica, período, valor y estado de certificación) y la UI las
 * renderiza aparte, con el estado a la vista. Una métrica exploratoria se marca
 * visualmente distinta — nunca se confunde con una certificada (CLAUDE.md §11).
 */
@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [DatePipe, FormsModule, EmptyComponent, IconComponent, SkeletonComponent],
  template: `
    <div class="chat">
      <aside class="hilos" [class.hilos--abierta]="panelAbierto()">
        <div class="hilos__top">
          <span class="eyebrow">Conversaciones</span>
          <button class="pequeno" (click)="nueva()" [disabled]="creando()">Nueva</button>
        </div>

        @if (cargandoHilos()) {
          @for (i of [1, 2, 3, 4]; track i) { <app-skeleton variante="linea" /> }
        } @else {
          <ul class="hilos__lista">
            @for (c of conversaciones(); track c.id) {
              <li>
                <button class="hilo" [class.hilo--activo]="c.id === activaId()" (click)="abrir(c)">
                  <span class="hilo__titulo">{{ c.titulo }}</span>
                  <span class="hilo__fecha">{{ c.actualizadaEn | date: 'dd/MM HH:mm' }}</span>
                </button>
                <button class="hilo__borrar" (click)="eliminar(c)" aria-label="Eliminar conversación">
                  <app-icon name="papelera" [size]="14" />
                </button>
              </li>
            } @empty {
              <li class="hilos__vacio">Aún no hay conversaciones.</li>
            }
          </ul>
        }
      </aside>

      <section class="hilo-activo">
        <button class="alternar-panel pequeno secundario" (click)="panelAbierto.set(!panelAbierto())">
          <app-icon name="menu" [size]="14" /> Conversaciones
        </button>

        <div class="mensajes" #scroll>
          @if (cargandoMensajes()) {
            @for (i of [1, 2, 3]; track i) { <app-skeleton variante="tarjeta" [alto]="58" /> }
          } @else if (mensajes().length === 0) {
            <app-empty titulo="Pregunta por tus números">
              Respondo con métricas certificadas, dentro de tu alcance de datos. Cada cifra viene
              con su métrica, su período y su estado.
              @if (sugerencias().length) {
                <div class="sugerencias">
                  @for (s of sugerencias(); track s) {
                    <button class="secundario pequeno" (click)="usarSugerencia(s)">{{ s }}</button>
                  }
                </div>
              }
            </app-empty>
          } @else {
            @for (m of mensajes(); track m.id) {
              <article class="burbuja" [class.burbuja--usuario]="m.rol === 'usuario'">
                <p class="burbuja__texto">{{ m.contenido }}</p>
                @if (m.tarjetas?.length) {
                  <div class="tarjetas">
                    @for (t of m.tarjetas ?? []; track t.metricaClave + t.periodo + (t.empresa ?? '')) {
                      <div class="dato" [class.dato--exploratoria]="t.estado === 'exploratoria'">
                        <span class="dato__valor">{{ formatear(t.valor) }}</span>
                        <span class="dato__metrica">{{ t.metricaNombre }}</span>
                        <span class="dato__meta">
                          {{ t.periodo }}@if (t.empresa) { · {{ t.empresa }} }
                        </span>
                        <span class="badge" [class.badge--certificada]="t.estado === 'certificada'"
                              [class.badge--exploratoria]="t.estado === 'exploratoria'">
                          {{ t.estado === 'certificada' ? 'Certificada' : 'Exploratoria — sin certificar' }}
                        </span>
                      </div>
                    }
                  </div>
                }
              </article>
            }
          }

          @if (pensando()) {
            <article class="burbuja burbuja--pensando" aria-live="polite">
              <span class="puntos"><i></i><i></i><i></i></span>
              <span class="sutil">Consultando las métricas…</span>
            </article>
          }
        </div>

        @if (error()) { <p class="error">{{ error() }}</p> }

        <form class="redactar" (ngSubmit)="enviar()">
          <textarea [(ngModel)]="borrador" name="borrador" rows="2" [disabled]="pensando()"
                    placeholder="¿Cuáles fueron las ventas netas del mes pasado?"
                    (keydown.enter)="enviarConEnter($event)"></textarea>
          <button type="submit" [disabled]="pensando() || !borrador.trim()">
            {{ pensando() ? 'Enviando…' : 'Enviar' }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: [
    `
      .chat { display: grid; grid-template-columns: 240px 1fr; gap: var(--sp-4); height: calc(100vh - 170px); min-height: 460px; }
      .hilos { display: flex; flex-direction: column; gap: var(--sp-2); border-right: 1px solid var(--border); padding-right: var(--sp-3); overflow: hidden; }
      .hilos__top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
      .hilos__lista { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
      .hilos__lista li { display: flex; align-items: center; gap: 2px; }
      .hilos__vacio { color: var(--muted); font-size: var(--fs-xs); padding: var(--sp-2) 0; }
      .hilo { flex: 1; text-align: left; background: none; border: none; color: var(--text); padding: var(--sp-2); border-radius: var(--r-sm); display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
      .hilo:hover { background: var(--surface-2); }
      .hilo--activo { background: var(--surface-2); box-shadow: inset 2px 0 0 var(--marca); }
      .hilo__titulo { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hilo__fecha { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--muted); }
      .hilo__borrar { background: none; border: none; color: var(--faint); cursor: pointer; padding: 4px; border-radius: var(--r-sm); }
      .hilo__borrar:hover { color: var(--danger); background: var(--danger-bg); }

      .hilo-activo { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
      .alternar-panel { display: none; align-self: flex-start; }
      .mensajes { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-3); padding-right: var(--sp-2); }

      .burbuja { max-width: 76%; padding: var(--sp-3); border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); }
      .burbuja--usuario { align-self: flex-end; background: var(--surface-2); border-color: var(--brand-400); }
      .burbuja__texto { margin: 0; white-space: pre-wrap; line-height: 1.55; }
      .burbuja--pensando { display: flex; align-items: center; gap: var(--sp-2); }

      .tarjetas { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
      .dato { display: flex; flex-direction: column; gap: 2px; padding: var(--sp-3); border-radius: var(--r); background: var(--surface-2); border-left: 3px solid var(--ok); min-width: 168px; }
      .dato--exploratoria { border-left-color: var(--warn); }
      .dato__valor { font-family: var(--display); font-size: 23px; letter-spacing: -.02em; }
      .dato__metrica { font-size: var(--fs-sm); }
      .dato__meta { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--muted); }
      .dato .badge { align-self: flex-start; margin-top: 4px; }

      .sugerencias { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); justify-content: center; }
      .redactar { display: flex; gap: var(--sp-2); align-items: flex-end; }
      .redactar textarea { flex: 1; resize: vertical; min-height: 46px; }

      .puntos { display: inline-flex; gap: 4px; }
      .puntos i { width: 6px; height: 6px; border-radius: 50%; background: var(--brand-400); animation: latir 1.2s infinite ease-in-out; }
      .puntos i:nth-child(2) { animation-delay: .15s; }
      .puntos i:nth-child(3) { animation-delay: .3s; }
      @keyframes latir { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
      @media (prefers-reduced-motion: reduce) { .puntos i { animation: none; opacity: .6; } }

      @media (max-width: 880px) {
        .chat { grid-template-columns: 1fr; height: auto; }
        .hilos { display: none; border-right: none; padding-right: 0; }
        .hilos--abierta { display: flex; }
        .alternar-panel { display: inline-flex; align-items: center; gap: 6px; }
        .burbuja { max-width: 92%; }
      }
    `,
  ],
})
export class ChatbotComponent implements OnInit {
  private readonly chat = inject(ChatService);
  private readonly toast = inject(ToastService);
  private readonly confirmar = inject(ConfirmService);

  @ViewChild('scroll') private scroll?: ElementRef<HTMLElement>;

  readonly conversaciones = signal<Conversacion[]>([]);
  readonly mensajes = signal<MensajeChat[]>([]);
  readonly activaId = signal<number | null>(null);
  readonly cargandoHilos = signal(true);
  readonly cargandoMensajes = signal(false);
  readonly pensando = signal(false);
  readonly creando = signal(false);
  readonly error = signal<string | null>(null);
  readonly panelAbierto = signal(false);
  readonly sugerencias = signal<string[]>([
    '¿Cuáles fueron las ventas netas del mes pasado?',
    '¿Cuánto tengo por cobrar y cómo está repartido por antigüedad?',
    '¿Qué significa "ventas netas" exactamente?',
  ]);

  borrador = '';

  ngOnInit(): void {
    this.chat.conversaciones().subscribe({
      next: (cs) => {
        this.conversaciones.set(cs);
        this.cargandoHilos.set(false);
        if (cs.length) this.abrir(cs[0]);
      },
      error: (e: Error) => {
        this.cargandoHilos.set(false);
        this.error.set(e.message);
      },
    });
  }

  abrir(c: Conversacion): void {
    this.activaId.set(c.id);
    this.panelAbierto.set(false);
    this.cargandoMensajes.set(true);
    this.error.set(null);
    this.chat.mensajes(c.id).subscribe({
      next: (ms) => {
        this.mensajes.set(ms);
        this.cargandoMensajes.set(false);
        this.alFinal();
      },
      error: (e: Error) => {
        this.cargandoMensajes.set(false);
        this.error.set(e.message);
      },
    });
  }

  nueva(): void {
    this.creando.set(true);
    this.chat.crear().subscribe({
      next: (c) => {
        this.conversaciones.update((cs) => [c, ...cs]);
        this.mensajes.set([]);
        this.activaId.set(c.id);
        this.creando.set(false);
        this.panelAbierto.set(false);
      },
      error: (e: Error) => {
        this.creando.set(false);
        this.error.set(e.message);
      },
    });
  }

  async eliminar(c: Conversacion): Promise<void> {
    const ok = await this.confirmar.confirmar({
      titulo: 'Eliminar conversación',
      mensaje: `Se borrará “${c.titulo}” y sus mensajes. No se puede deshacer.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    this.chat.eliminar(c.id).subscribe({
      next: () => {
        this.conversaciones.update((cs) => cs.filter((x) => x.id !== c.id));
        if (this.activaId() === c.id) {
          this.activaId.set(null);
          this.mensajes.set([]);
        }
        this.toast.exito('Conversación eliminada');
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }

  usarSugerencia(texto: string): void {
    this.borrador = texto;
    this.enviar();
  }

  enviarConEnter(evento: Event): void {
    const e = evento as KeyboardEvent;
    if (e.shiftKey) return; // Shift+Enter = salto de línea
    e.preventDefault();
    this.enviar();
  }

  enviar(): void {
    const texto = this.borrador.trim();
    if (!texto || this.pensando()) return;

    const conversacion = this.activaId();
    if (conversacion === null) {
      // Sin conversación abierta se crea una y se reenvía el mismo texto.
      this.chat.crear().subscribe({
        next: (c) => {
          this.conversaciones.update((cs) => [c, ...cs]);
          this.activaId.set(c.id);
          this.enviarA(c.id, texto);
        },
        error: (e: Error) => this.error.set(e.message),
      });
      return;
    }
    this.enviarA(conversacion, texto);
  }

  private enviarA(conversacion: number, texto: string): void {
    this.error.set(null);
    this.borrador = '';
    this.pensando.set(true);
    // Eco optimista: el turno del usuario se ve de inmediato; el id definitivo
    // llega al recargar los mensajes persistidos.
    this.mensajes.update((ms) => [
      ...ms,
      { id: -Date.now(), rol: 'usuario', contenido: texto, tarjetas: null, creadoEn: new Date().toISOString() },
    ]);
    this.alFinal();

    this.chat.enviar(conversacion, texto).subscribe({
      next: () => {
        this.pensando.set(false);
        this.chat.mensajes(conversacion).subscribe({
          next: (ms) => {
            this.mensajes.set(ms);
            this.alFinal();
          },
        });
        this.chat.conversaciones().subscribe({ next: (cs) => this.conversaciones.set(cs) });
      },
      error: (e: Error) => {
        this.pensando.set(false);
        this.error.set(e.message);
      },
    });
  }

  formatear(valor: number): string {
    const abs = Math.abs(valor);
    const decimales = abs >= 1000 ? 0 : 2;
    return new Intl.NumberFormat('es-GT', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor);
  }

  private alFinal(): void {
    queueMicrotask(() => {
      const el = this.scroll?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
