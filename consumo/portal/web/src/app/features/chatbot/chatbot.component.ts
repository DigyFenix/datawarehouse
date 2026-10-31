import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { ToastService } from '../../core/toast.service';
import {
  ChatService,
  ConjuntoDatos,
  ConsultaEjecutada,
  ConsultaGuardada,
  Conversacion,
  EjecucionGuardada,
  MensajeChat,
  VistaConsulta,
} from './chat.service';
import { DatosVisualComponent } from './datos-visual.component';

/**
 * Chat con el agente de IA gobernado + consultas guardadas.
 *
 * Las cifras NO se leen del texto del modelo: cada respuesta trae sus tarjetas y sus
 * conjuntos de datos (métrica, período, valor y estado de certificación) y la UI los
 * renderiza aparte, con el estado a la vista. Una métrica exploratoria se marca
 * visualmente distinta — nunca se confunde con una certificada (CLAUDE.md §11).
 *
 * «Guardar» persiste la ESPECIFICACIÓN de la consulta (tool + parámetros), no el
 * resultado: al abrirla otro día se reejecuta con datos frescos bajo las mismas guardas.
 */
@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [DatePipe, FormsModule, EmptyComponent, IconComponent, SkeletonComponent, DatosVisualComponent],
  template: `
    <div class="chat">
      <aside class="hilos" [class.hilos--abierta]="panelAbierto()">
        <div class="hilos__pestanas" role="tablist">
          <button class="hilos__pestana" [class.hilos__pestana--activa]="pestana() === 'conversaciones'" (click)="pestana.set('conversaciones')">Conversaciones</button>
          <button class="hilos__pestana" [class.hilos__pestana--activa]="pestana() === 'guardadas'" (click)="pestana.set('guardadas')">
            Guardadas @if (guardadas().length) { <span class="hilos__conteo">{{ guardadas().length }}</span> }
          </button>
        </div>

        @if (pestana() === 'conversaciones') {
          <div class="hilos__top">
            <span class="eyebrow">Hilos</span>
            <button class="pequeno" (click)="nueva()" [disabled]="creando()">Nueva</button>
          </div>
          @if (cargandoHilos()) {
            @for (i of [1, 2, 3, 4]; track i) { <app-skeleton variante="linea" /> }
          } @else {
            <ul class="hilos__lista">
              @for (c of conversaciones(); track c.id) {
                <li>
                  <button class="hilo" [class.hilo--activo]="modo() === 'chat' && c.id === activaId()" (click)="abrir(c)">
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
        } @else {
          <div class="hilos__top">
            <span class="eyebrow">Mis consultas</span>
          </div>
          <ul class="hilos__lista">
            @for (g of guardadas(); track g.id) {
              <li>
                <button class="hilo" [class.hilo--activo]="modo() === 'guardada' && g.id === guardadaActiva()?.consulta?.id" (click)="abrirGuardada(g)">
                  <span class="hilo__titulo"><app-icon name="guardar" [size]="12" /> {{ g.titulo }}</span>
                  <span class="hilo__fecha">{{ etiquetaTool(g.tool) }} · {{ g.vista }}@if (g.enTablero) { · en mi tablero }</span>
                </button>
                <button class="hilo__borrar" [class.hilo__fijar--activo]="g.enTablero" (click)="alternarTablero(g)" [attr.aria-label]="g.enTablero ? 'Quitar de Mi tablero' : 'Agregar a Mi tablero'" [title]="g.enTablero ? 'Quitar de Mi tablero' : 'Agregar a Mi tablero'">
                  <app-icon name="tablero" [size]="14" />
                </button>
                <button class="hilo__borrar" (click)="eliminarGuardada(g)" aria-label="Eliminar consulta guardada">
                  <app-icon name="papelera" [size]="14" />
                </button>
              </li>
            } @empty {
              <li class="hilos__vacio">
                Todavía no guardas ninguna consulta. Pide una tabla o un ranking en el chat y usa
                «Guardar»: la reabres otro día con datos actualizados.
              </li>
            }
          </ul>
        }
      </aside>

      <section class="hilo-activo">
        <button class="alternar-panel pequeno secundario" (click)="panelAbierto.set(!panelAbierto())">
          <app-icon name="menu" [size]="14" /> Conversaciones y guardadas
        </button>

        @if (modo() === 'guardada') {
          <!-- ======================= consulta guardada abierta ======================= -->
          <div class="guardada">
            @if (cargandoGuardada()) {
              <app-skeleton variante="tarjeta" [alto]="58" />
              <app-skeleton variante="tarjeta" [alto]="220" />
            } @else {
            @if (guardadaActiva(); as ej) {
              <header class="guardada__cab">
                <div>
                  <span class="eyebrow">Consulta guardada</span>
                  @if (editandoTitulo()) {
                    <form class="guardada__titulo-form" (ngSubmit)="renombrar(ej.consulta)">
                      <input name="tituloEdit" [(ngModel)]="tituloEdit" maxlength="120" required />
                      <button type="submit" class="pequeno">Guardar</button>
                      <button type="button" class="pequeno secundario" (click)="editandoTitulo.set(false)">Cancelar</button>
                    </form>
                  } @else {
                    <h3 class="guardada__titulo">
                      {{ ej.consulta.titulo }}
                      <button class="guardada__editar" (click)="empezarRenombrar(ej.consulta)" aria-label="Renombrar"><app-icon name="editar" [size]="14" /></button>
                    </h3>
                  }
                  @if (ej.consulta.descripcion) { <p class="sutil">{{ ej.consulta.descripcion }}</p> }
                </div>
                <div class="guardada__acciones">
                  <button class="pequeno secundario" (click)="abrirGuardada(ej.consulta)"><app-icon name="actualizar" [size]="14" /> Actualizar</button>
                  <button class="pequeno secundario" (click)="preguntarSobre(ej)">Preguntar en el chat</button>
                </div>
              </header>

              <p class="guardada__frescura">
                Ejecutada {{ ej.ejecutadaEn | date: 'dd/MM/yyyy HH:mm' }} con los datos vigentes
                @if (frescuraDe(ej); as f) { · dato del ERP al {{ f }} }
                @if (ej.proximaCarga; as pc) { · próxima actualización {{ pc.texto }} }
              </p>
              @for (a of ej.avisos; track a) { <p class="aviso"><app-icon name="advertencia" [size]="14" /> {{ a }}</p> }

              @if (ej.ok && ej.conjunto) {
                <app-datos-visual [conjunto]="ej.conjunto" [vistaInicial]="ej.consulta.vista" />
                <p class="sutil guardada__pie">
                  Especificación: {{ etiquetaTool(ej.consulta.tool) }} · {{ describirParams(ej.consulta.params) }}
                </p>
              } @else {
                <div class="tarjeta">
                  <app-empty titulo="Esta consulta no se puede ejecutar ahora">
                    {{ ej.motivo }} Si la métrica cambió de estado o perdiste acceso, pide al administrador que lo revise.
                  </app-empty>
                </div>
              }
            }
            }
          </div>
        } @else {
          <!-- ======================= chat ======================= -->
          <div class="mensajes" #scroll>
            @if (cargandoMensajes()) {
              @for (i of [1, 2, 3]; track i) { <app-skeleton variante="tarjeta" [alto]="58" /> }
            } @else if (mensajes().length === 0) {
              <app-empty titulo="Pregunta por tus números">
                Respondo con métricas certificadas, dentro de tu alcance de datos. Cada cifra viene
                con su métrica, su período y su estado. Lo que te sirva, lo guardas y lo reabres con datos frescos.
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
                <article class="burbuja" [class.burbuja--usuario]="m.rol === 'usuario'" [class.burbuja--datos]="m.datos?.conjuntos?.length">
                  <p class="burbuja__texto">{{ m.contenido }}</p>

                  @if (m.datos?.conjuntos?.length) {
                    <div class="conjuntos">
                      @for (cj of m.datos!.conjuntos; track i; let i = $index) {
                        <app-datos-visual [conjunto]="cj" />
                        @if (consultaDe(m, i); as espec) {
                          @if (guardando()?.mensajeId === m.id && guardando()?.indice === i) {
                            <form class="guardar-form" (ngSubmit)="confirmarGuardar(espec, cj)">
                              <div class="campo campo--inline">
                                <label for="tituloGuardar">Nombre</label>
                                <input id="tituloGuardar" name="tituloGuardar" [(ngModel)]="tituloGuardar" maxlength="120" required />
                              </div>
                              <div class="campo campo--inline">
                                <label for="vistaGuardar">Ver como</label>
                                <select id="vistaGuardar" name="vistaGuardar" [(ngModel)]="vistaGuardar">
                                  <option value="tabla">Tabla</option>
                                  <option value="barras">Barras</option>
                                  @if (cj.tipo === 'serie') { <option value="lineas">Líneas</option> }
                                </select>
                              </div>
                              <label class="campo--check">
                                <input type="checkbox" name="enTableroGuardar" [(ngModel)]="enTableroGuardar" /> Agregar a Mi tablero
                              </label>
                              <button type="submit" class="pequeno" [disabled]="guardandoEnCurso()">Guardar</button>
                              <button type="button" class="pequeno secundario" (click)="guardando.set(null)">Cancelar</button>
                            </form>
                          } @else {
                            <button class="pequeno secundario guardar-btn" (click)="empezarGuardar(m, i, espec)">
                              <app-icon name="guardar" [size]="14" /> Guardar esta consulta
                            </button>
                          }
                        }
                      }
                    </div>
                  } @else if (m.tarjetas?.length) {
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
                      placeholder="¿Cuáles fueron las ventas netas por cliente de este año?"
                      (keydown.enter)="enviarConEnter($event)"></textarea>
            <button type="submit" [disabled]="pensando() || !borrador.trim()">
              {{ pensando() ? 'Enviando…' : 'Enviar' }}
            </button>
          </form>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .chat { display: grid; grid-template-columns: 260px 1fr; gap: var(--sp-4); height: calc(100vh - 170px); min-height: 460px; }
      .hilos { display: flex; flex-direction: column; gap: var(--sp-2); border-right: 1px solid var(--border); padding-right: var(--sp-3); overflow: hidden; }
      .hilos__pestanas { display: flex; border-bottom: 1px solid var(--border); margin-bottom: var(--sp-1); }
      .hilos__pestana { flex: 1; min-height: 0; background: none; border: none; border-bottom: 2px solid transparent; padding: 8px 4px; color: var(--muted); font-size: var(--fs-sm); cursor: pointer; display: inline-flex; justify-content: center; gap: 6px; align-items: center; }
      .hilos__pestana--activa { color: var(--text); border-bottom-color: var(--brand-600); font-weight: 600; }
      .hilos__conteo { font-family: var(--sans); font-variant-numeric: tabular-nums; font-size: var(--fs-2xs); background: var(--surface-2); border-radius: 999px; padding: 1px 7px; }
      .hilos__top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
      .hilos__lista { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
      .hilos__lista li { display: flex; align-items: center; gap: 2px; min-width: 0; }
      .hilos__vacio { color: var(--muted); font-size: var(--fs-xs); padding: var(--sp-2) 0; line-height: 1.5; }
      .hilo { flex: 1; min-height: 0; text-align: left; background: none; border: none; color: var(--text); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm); display: flex; flex-direction: column; gap: 2px; cursor: pointer; min-width: 0; overflow: hidden; }
      .hilo:hover { background: var(--surface-2); }
      .hilo--activo { background: var(--surface-2); box-shadow: inset 2px 0 0 var(--marca); }
      .hilo__titulo { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; max-width: 100%; }
      .hilo__titulo app-icon { vertical-align: -2px; margin-right: 4px; }
      .hilo__fecha { font-family: var(--sans); font-variant-numeric: tabular-nums; font-size: var(--fs-2xs); color: var(--muted); }
      .hilo__borrar { background: none; border: none; color: var(--faint); cursor: pointer; padding: 4px; min-height: 0; border-radius: var(--r-sm); }
      .hilo__borrar:hover { color: var(--danger); background: var(--danger-bg); }

      .hilo-activo { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
      .alternar-panel { display: none; align-self: flex-start; }
      .mensajes { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-3); padding-right: var(--sp-2); }

      .burbuja { max-width: 76%; padding: var(--sp-3) var(--sp-4); border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); }
      .burbuja--usuario { align-self: flex-end; background: var(--brand-100); color: var(--text); border-color: transparent; border-bottom-right-radius: 6px; }
      .burbuja--datos { max-width: 96%; width: 100%; }
      .burbuja__texto { margin: 0; white-space: pre-wrap; line-height: 1.55; }
      .burbuja--pensando { display: flex; align-items: center; gap: var(--sp-2); }

      .conjuntos { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-3); }
      .guardar-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; }
      .guardar-form { display: flex; gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap; padding: var(--sp-3); border: 1px dashed var(--border-2); border-radius: var(--r); background: var(--surface-2); }
      .campo--inline { margin: 0; display: flex; flex-direction: column; gap: 4px; }
      .campo--inline input { min-width: 260px; }
      .campo--check { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--muted); padding-bottom: 8px; cursor: pointer; }
      .campo--check input { width: 15px; height: 15px; margin: 0; accent-color: var(--brand-600); }
      .hilo__fijar--activo { color: var(--brand-600); }

      .tarjetas { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
      .dato { display: flex; flex-direction: column; gap: 2px; padding: var(--sp-3); border-radius: var(--r); background: var(--surface-2); border-left: 3px solid var(--ok); min-width: 168px; }
      .dato--exploratoria { border-left-color: var(--warn); }
      .dato__valor { font-family: var(--display); font-size: 23px; letter-spacing: -.02em; }
      .dato__metrica { font-size: var(--fs-sm); }
      .dato__meta { font-family: var(--sans); font-variant-numeric: tabular-nums; font-size: var(--fs-2xs); color: var(--muted); }
      .dato .badge { align-self: flex-start; margin-top: 4px; }

      .guardada { display: flex; flex-direction: column; gap: var(--sp-3); overflow-y: auto; }
      .guardada__cab { display: flex; justify-content: space-between; gap: var(--sp-3); align-items: flex-start; flex-wrap: wrap; }
      .guardada__titulo { margin: 2px 0 0; display: flex; align-items: center; gap: 8px; }
      .guardada__editar { background: none; border: none; color: var(--faint); cursor: pointer; padding: 2px; min-height: 0; }
      .guardada__editar:hover { color: var(--text); }
      .guardada__titulo-form { display: flex; gap: var(--sp-2); align-items: center; margin-top: 4px; }
      .guardada__acciones { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
      .guardada__acciones button { display: inline-flex; align-items: center; gap: 6px; }
      .guardada__frescura { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
      .guardada__pie { font-family: var(--sans); font-variant-numeric: tabular-nums; font-size: var(--fs-2xs); }
      .aviso { margin: 0; display: flex; gap: 8px; align-items: flex-start; color: var(--warn); background: var(--warn-bg); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm); font-size: var(--fs-sm); }

      .sugerencias { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); justify-content: center; }
      .redactar { display: flex; gap: var(--sp-2); align-items: flex-end; padding: var(--sp-2); border: 1px solid var(--border-2); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--sh-1); }
      .redactar:focus-within { border-color: var(--brand-500); box-shadow: 0 0 0 3px color-mix(in srgb, var(--marca) 14%, transparent); }
      .redactar textarea { flex: 1; resize: none; min-height: 44px; border: 0; box-shadow: none; background: transparent; padding: 10px 8px; }
      .redactar textarea:focus { box-shadow: none; border: 0; }
      .redactar button { border-radius: 10px; }

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
        .burbuja--datos { max-width: 100%; }
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
    '¿Cuáles fueron las ventas netas por mes de este año?',
    '¿Quiénes son mis 10 mejores clientes del año?',
    '¿Cuánto tengo por cobrar y cómo está repartido por antigüedad?',
    '¿Qué significa "ventas netas" exactamente?',
  ]);

  // ---- guardadas
  readonly pestana = signal<'conversaciones' | 'guardadas'>('conversaciones');
  readonly modo = signal<'chat' | 'guardada'>('chat');
  readonly guardadas = signal<ConsultaGuardada[]>([]);
  readonly guardadaActiva = signal<EjecucionGuardada | null>(null);
  readonly cargandoGuardada = signal(false);
  readonly guardando = signal<{ mensajeId: number; indice: number } | null>(null);
  readonly guardandoEnCurso = signal(false);
  readonly editandoTitulo = signal(false);
  tituloGuardar = '';
  vistaGuardar: VistaConsulta = 'tabla';
  enTableroGuardar = false;
  tituloEdit = '';

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
    this.recargarGuardadas();
  }

  // ---------------------------------------------------------------- conversaciones

  abrir(c: Conversacion): void {
    this.modo.set('chat');
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
        this.modo.set('chat');
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
      mensaje: `Se borrará “${c.titulo}” y sus mensajes. No se puede deshacer. Las consultas guardadas no se pierden.`,
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
      { id: -Date.now(), rol: 'usuario', contenido: texto, tarjetas: null, datos: null, creadoEn: new Date().toISOString() },
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

  // ---------------------------------------------------------------- guardar desde el chat

  /** La especificación que produjo el conjunto `i` del mensaje (si es guardable). */
  consultaDe(m: MensajeChat, i: number): ConsultaEjecutada | null {
    return m.datos?.consultas.find((c) => c.conjunto === i) ?? null;
  }

  empezarGuardar(m: MensajeChat, i: number, espec: ConsultaEjecutada): void {
    this.tituloGuardar = espec.tituloSugerido;
    this.vistaGuardar = m.datos?.conjuntos[i]?.tipo === 'serie' ? 'lineas' : 'barras';
    this.guardando.set({ mensajeId: m.id, indice: i });
  }

  confirmarGuardar(espec: ConsultaEjecutada, conjunto: ConjuntoDatos): void {
    const titulo = this.tituloGuardar.trim();
    if (!titulo) return;
    this.guardandoEnCurso.set(true);
    this.chat
      .guardar({
        titulo, tool: espec.tool, params: espec.params, vista: this.vistaGuardar,
        descripcion: `${conjunto.metricaNombre} · ${conjunto.periodo}`, enTablero: this.enTableroGuardar,
      })
      .subscribe({
        next: (g) => {
          this.guardandoEnCurso.set(false);
          this.guardando.set(null);
          this.guardadas.update((gs) => [g, ...gs]);
          this.toast.exito(
            'Consulta guardada',
            g.enTablero ? 'Ya está en «Mi tablero», siempre con datos actualizados.' : 'La encuentras en la pestaña «Guardadas», siempre con datos actualizados.',
          );
        },
        error: (e: Error) => {
          this.guardandoEnCurso.set(false);
          this.toast.error('No se pudo guardar', e.message);
        },
      });
  }

  // ---------------------------------------------------------------- guardadas

  recargarGuardadas(): void {
    this.chat.guardadas().subscribe({
      next: (gs) => this.guardadas.set(gs),
      error: () => undefined, // el panel de guardadas no bloquea el chat
    });
  }

  abrirGuardada(g: ConsultaGuardada): void {
    this.modo.set('guardada');
    this.panelAbierto.set(false);
    this.editandoTitulo.set(false);
    this.cargandoGuardada.set(true);
    this.chat.ejecutarGuardada(g.id).subscribe({
      next: (ej) => {
        this.guardadaActiva.set(ej);
        this.cargandoGuardada.set(false);
      },
      error: (e: Error) => {
        this.cargandoGuardada.set(false);
        this.toast.error('No se pudo ejecutar la consulta', e.message);
        this.modo.set('chat');
      },
    });
  }

  async eliminarGuardada(g: ConsultaGuardada): Promise<void> {
    const ok = await this.confirmar.confirmar({
      titulo: 'Eliminar consulta guardada',
      mensaje: `Se quitará “${g.titulo}” de tus guardadas. Los datos no se tocan.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    this.chat.eliminarGuardada(g.id).subscribe({
      next: () => {
        this.guardadas.update((gs) => gs.filter((x) => x.id !== g.id));
        if (this.guardadaActiva()?.consulta.id === g.id) {
          this.guardadaActiva.set(null);
          this.modo.set('chat');
        }
        this.toast.exito('Consulta eliminada');
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }

  /** Fija o quita una consulta guardada de «Mi tablero» sin salir del chat. */
  alternarTablero(g: ConsultaGuardada): void {
    this.chat.actualizarGuardada(g.id, { enTablero: !g.enTablero }).subscribe({
      next: (n) => {
        this.guardadas.update((gs) => gs.map((x) => (x.id === n.id ? n : x)));
        this.guardadaActiva.update((ej) => (ej && ej.consulta.id === n.id ? { ...ej, consulta: n } : ej));
        this.toast.exito(n.enTablero ? 'Agregada a Mi tablero' : 'Quitada de Mi tablero');
      },
      error: (e: Error) => this.toast.error('No se pudo actualizar', e.message),
    });
  }

  empezarRenombrar(c: ConsultaGuardada): void {
    this.tituloEdit = c.titulo;
    this.editandoTitulo.set(true);
  }

  renombrar(c: ConsultaGuardada): void {
    const titulo = this.tituloEdit.trim();
    if (!titulo) return;
    this.chat.actualizarGuardada(c.id, { titulo }).subscribe({
      next: (g) => {
        this.editandoTitulo.set(false);
        this.guardadas.update((gs) => gs.map((x) => (x.id === g.id ? g : x)));
        this.guardadaActiva.update((ej) => (ej ? { ...ej, consulta: g } : ej));
      },
      error: (e: Error) => this.toast.error('No se pudo renombrar', e.message),
    });
  }

  /** Vuelve al chat con la consulta guardada como punto de partida de una pregunta nueva. */
  preguntarSobre(ej: EjecucionGuardada): void {
    this.pestana.set('conversaciones');
    this.modo.set('chat');
    this.borrador = `Sobre «${ej.consulta.titulo}» (${ej.conjunto?.metricaNombre ?? ''} · ${ej.conjunto?.periodo ?? ''}): `;
  }

  frescuraDe(ej: EjecucionGuardada): string | null {
    const fechas = ej.frescura.map((f) => f.fechaDatoMasReciente).filter((f): f is string => !!f);
    return fechas.length ? fechas.sort()[fechas.length - 1] : null;
  }

  etiquetaTool(tool: string): string {
    switch (tool) {
      case 'consultar_metrica':
        return 'Serie por mes';
      case 'consultar_metrica_por_dimension':
        return 'Ranking';
      case 'consultar_aging':
        return 'Antigüedad de cartera';
      default:
        return tool;
    }
  }

  describirParams(params: Record<string, unknown>): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')} = ${String(v)}`)
      .join(' · ');
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
