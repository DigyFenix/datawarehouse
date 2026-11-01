import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { ToastService } from '../../core/toast.service';
import { nombreDominio } from '../../core/dominios';
import {
  ChatService,
  ConjuntoDatos,
  ConsultaEjecutada,
  ConsultaGuardada,
  Conversacion,
  EjecucionGuardada,
  EstadoSesion,
  MensajeChat,
  MetricaDisponible,
  OpcionAccion,
  RespuestaAgente,
  SugerenciaChat,
  TarjetaDato,
  UnidadMetrica,
  VistaConsulta,
} from './chat.service';
import { DatosVisualComponent } from './datos-visual.component';
import { fechaCorte, formatearValor, textoEmpresas } from './formato-cifras';

function leerPreferencia(clave: string, porDefecto: boolean): boolean {
  try {
    const v = localStorage.getItem(`quilate.${clave}`);
    return v === null ? porDefecto : v === '1';
  } catch {
    return porDefecto;
  }
}
function guardarPreferencia(clave: string, valor: boolean): void {
  try {
    localStorage.setItem(`quilate.${clave}`, valor ? '1' : '0');
  } catch {
    // sin almacenamiento (modo privado): la preferencia dura la sesión
  }
}

/** Una conversación se retoma solo si tuvo actividad en las últimas 2 horas; después se empieza limpia. */
const RETOMAR_MS = 2 * 60 * 60 * 1000;

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
    <div class="chat" [class.chat--sin-izq]="!verGuardadas()" [class.chat--sin-der]="!verMetricas()">
      @if (verGuardadas()) {
      <aside class="hilos" [class.hilos--abierta]="panelAbierto()">
        <button class="nueva-consulta" (click)="nueva()" [disabled]="creando()">
          <app-icon name="chatbot" [size]="16" /> Nueva consulta
        </button>
        <div class="hilos__top">
          <span class="eyebrow">Consultas guardadas</span>
          @if (guardadas().length) { <span class="hilos__conteo">{{ guardadas().length }}</span> }
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
                Todavía no guardas ninguna consulta. Pide una tabla o un ranking y usa
                «Guardar»: la reabres otro día con datos actualizados.
              </li>
            }
          </ul>
      </aside>
      }

      <section class="hilo-activo">
        <div class="barra-paneles">
          <button type="button" class="pequeno secundario" (click)="alternarGuardadas()" [attr.aria-pressed]="verGuardadas()">
            <app-icon name="guardar" [size]="14" /> {{ verGuardadas() ? 'Ocultar guardadas' : 'Guardadas' }}
          </button>
          <button type="button" class="pequeno secundario" (click)="alternarMetricas()" [attr.aria-pressed]="verMetricas()">
            <app-icon name="grafico" [size]="14" /> {{ verMetricas() ? 'Ocultar métricas' : 'Métricas' }}
          </button>
        </div>

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
                Una pregunta, una respuesta: métricas certificadas, dentro de tu alcance, con su período
                y su estado. Lo que te sirva, lo guardas y lo reabres con datos frescos.
                @if (sugerencias().length) {
                  <!-- Armadas en código desde tu alcance real: el clic consulta sin pasar por el modelo. -->
                  <div class="sugerencias">
                    @for (s of sugerencias(); track s.etiqueta) {
                      <button class="secundario pequeno" (click)="ejecutarOpcion(s)" [disabled]="pensando()">{{ s.etiqueta }}</button>
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
                          <span class="dato__valor">{{ formatear(t.valor, t.unidad) }}</span>
                          <span class="dato__metrica">{{ t.metricaNombre }}</span>
                          <!-- Período · corte · empresas (el estado va en el badge): siempre visibles. -->
                          <span class="dato__meta">
                            {{ t.periodo }}@if (corteDe(t); as c) { · dato al {{ c }} }@if (empresasDe(t); as e) { · {{ e }} }
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

            @if (!pensando() && acciones(); as ac) {
              @if (ac.regenerado) {
                <p class="nota-regenerado"><app-icon name="info" [size]="13" /> Texto armado directamente desde los datos consultados.</p>
              }
              @if (ac.opciones.length) {
                <div class="acciones acciones--opciones" role="group" aria-label="Elige una opción">
                  @for (o of ac.opciones; track o.etiqueta) {
                    <button type="button" class="pequeno" (click)="ejecutarOpcion(o)">{{ o.etiqueta }}</button>
                  }
                </div>
              }
              @if (ac.sugerencias.length) {
                <div class="acciones" role="group" aria-label="Siguientes preguntas sugeridas">
                  <span class="acciones__titulo">También puedes ver</span>
                  @for (o of ac.sugerencias; track o.etiqueta) {
                    <button type="button" class="pequeno secundario" (click)="ejecutarOpcion(o)">{{ o.etiqueta }}</button>
                  }
                </div>
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

          @if (sugerencia(); as s) {
            <div class="sugerencia" [class.sugerencia--tope]="s.tipo === 'limite_alcanzado'" role="status">
              <app-icon name="info" [size]="15" />
              <span>{{ s.texto }}</span>
              <button type="button" class="pequeno" (click)="nuevaDesdeSugerencia()">Nueva consulta</button>
              @if (s.tipo !== 'limite_alcanzado') {
                <button type="button" class="pequeno secundario" (click)="sugerencia.set(null)">Seguir aquí</button>
              }
            </div>
          }

          @if (sesion()?.restantes === 0) {
            <div class="tope">
              <span>Esta consulta llegó a su tope de {{ sesion()?.limite }} mensajes.</span>
              <button type="button" (click)="nuevaDesdeSugerencia()">Empezar una nueva consulta</button>
            </div>
          } @else {
            <form class="redactar" (ngSubmit)="enviar()">
              <textarea [(ngModel)]="borrador" name="borrador" rows="2" [disabled]="pensando()"
                        placeholder="¿Cuáles fueron las ventas netas por cliente de este año?"
                        (keydown.enter)="enviarConEnter($event)"></textarea>
              <button type="submit" [disabled]="pensando() || !borrador.trim()">
                {{ pensando() ? 'Enviando…' : 'Enviar' }}
              </button>
            </form>
            @if (sesion(); as se) {
              <p class="contador" [class.contador--aviso]="se.avisar">
                {{ se.usados }} de {{ se.limite }} mensajes en esta consulta
                @if (se.avisar) { · quedan {{ se.restantes }} }
              </p>
            }
          }
        }
      </section>

      @if (verMetricas()) {
      <aside class="metricas" aria-label="Métricas disponibles">
        <div class="metricas__cab">
          <span class="eyebrow">Métricas disponibles</span>
          <span class="hilos__conteo">{{ metricas().length }}</span>
        </div>
        <p class="metricas__ayuda">Puedo responder sobre estas métricas, por período, empresa o desglose.</p>
        @for (g of metricasPorDominio(); track g.dominio) {
          <div class="metricas__grupo">
            <span class="metricas__dominio">{{ nombreDominio(g.dominio) }}</span>
            <ul>
              @for (m of g.metricas; track m.clave) {
                <li><button type="button" class="metrica" (click)="usarMetrica(m)" [title]="'Preguntar por ' + m.nombre">{{ m.nombre }}</button></li>
              }
            </ul>
          </div>
        } @empty {
          <p class="metricas__ayuda">Tu perfil aún no tiene métricas autorizadas.</p>
        }
      </aside>
      }
    </div>
  `,
  styles: [
    `
      .chat { display: grid; grid-template-columns: 240px minmax(0, 1fr) 230px; gap: var(--sp-4); height: calc(100vh - 170px); min-height: 460px; }
      .chat--sin-izq { grid-template-columns: minmax(0, 1fr) 230px; }
      .chat--sin-der { grid-template-columns: 240px minmax(0, 1fr); }
      .chat--sin-izq.chat--sin-der { grid-template-columns: minmax(0, 1fr); }
      .barra-paneles { display: flex; gap: var(--sp-2); justify-content: flex-end; }
      .barra-paneles button { display: inline-flex; align-items: center; gap: 6px; }
      .barra-paneles button[aria-pressed="true"] { color: var(--brand-700); border-color: var(--brand-300); background: var(--brand-50); }
      .metricas { border-left: 1px solid var(--border); padding-left: var(--sp-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-2); }
      .metricas__cab { display: flex; align-items: center; justify-content: space-between; }
      .metricas__ayuda { margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.5; }
      .metricas__grupo { display: flex; flex-direction: column; gap: 2px; margin-top: var(--sp-2); }
      .metricas__dominio { font-size: var(--fs-2xs); font-weight: 600; color: var(--faint); padding: 0 8px 2px; }
      .metricas ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
      .metrica { width: 100%; min-height: 0; justify-content: flex-start; text-align: left; background: none; border: 0; color: var(--text); font-weight: 500; font-size: var(--fs-sm); padding: 6px 8px; border-radius: 8px; white-space: normal; line-height: 1.3; }
      .metrica:hover { background: var(--brand-50); color: var(--brand-700); }
      .sugerencia { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; padding: var(--sp-2) var(--sp-3); border-radius: var(--r); background: var(--info-bg); color: var(--info); font-size: var(--fs-sm); }
      .sugerencia span { flex: 1; min-width: 200px; }
      .sugerencia app-icon { flex: none; }
      .sugerencia--tope { background: var(--warn-bg); color: var(--warn); }
      .tope { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; padding: var(--sp-3) var(--sp-4); border: 1px dashed var(--border-2); border-radius: var(--r-lg); background: var(--surface-2); font-size: var(--fs-sm); color: var(--muted); }
      .contador { margin: 0; text-align: right; font-size: var(--fs-2xs); color: var(--faint); font-variant-numeric: tabular-nums; }
      .contador--aviso { color: var(--warn); font-weight: 500; }
      .hilos { display: flex; flex-direction: column; gap: var(--sp-2); border-right: 1px solid var(--border); padding-right: var(--sp-3); overflow: hidden; }
      .nueva-consulta { width: 100%; justify-content: flex-start; margin-bottom: var(--sp-2); }
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
      .acciones { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
      .acciones button { white-space: normal; text-align: left; line-height: 1.3; }
      .acciones__titulo { font-size: var(--fs-2xs); color: var(--faint); margin-right: 2px; }
      .nota-regenerado { margin: 0; display: flex; align-items: center; gap: 6px; font-size: var(--fs-2xs); color: var(--muted); }
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

      @media (max-width: 1100px) { .chat, .chat--sin-izq { grid-template-columns: 240px minmax(0, 1fr); } .chat--sin-izq { grid-template-columns: minmax(0, 1fr); } .metricas { display: none; } }
      @media (max-width: 880px) {
        .chat, .chat--sin-izq, .chat--sin-der { grid-template-columns: 1fr; height: auto; }
        .hilos { border-right: none; padding-right: 0; }
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
  /** Paneles laterales ocultables; la preferencia queda en este navegador. */
  readonly verGuardadas = signal(leerPreferencia('chat.verGuardadas', true));
  readonly verMetricas = signal(leerPreferencia('chat.verMetricas', true));
  readonly sesion = signal<EstadoSesion | null>(null);
  readonly sugerencia = signal<SugerenciaChat | null>(null);
  readonly metricas = signal<MetricaDisponible[]>([]);
  readonly nombreDominio = nombreDominio;
  readonly metricasPorDominio = computed(() => {
    const grupos = new Map<string, MetricaDisponible[]>();
    for (const m of this.metricas()) grupos.set(m.dominio, [...(grupos.get(m.dominio) ?? []), m]);
    return [...grupos.entries()].map(([dominio, metricas]) => ({ dominio, metricas }));
  });
  /** Sugerencias del chat vacío: las arma el agente desde el alcance real (nunca nombran una métrica sin acceso). */
  readonly sugerencias = signal<OpcionAccion[]>([]);
  /** Botones de la última respuesta (desambiguación y siguientes preguntas). No se persisten: valen para el turno. */
  readonly acciones = signal<{ opciones: OpcionAccion[]; sugerencias: OpcionAccion[]; regenerado: boolean } | null>(null);

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
    // Una sola conversación: se retoma la más reciente solo si es de las últimas horas (para
    // terminar una aclaración); si no, la próxima pregunta arranca limpia y sin historial.
    this.chat.conversaciones().subscribe({
      next: (cs) => {
        this.conversaciones.set(cs);
        this.cargandoHilos.set(false);
        const reciente = cs[0];
        if (reciente && Date.now() - new Date(reciente.actualizadaEn).getTime() < RETOMAR_MS) this.abrir(reciente);
      },
      error: (e: Error) => {
        this.cargandoHilos.set(false);
        this.error.set(e.message);
      },
    });
    this.recargarGuardadas();
    this.chat.metricas().subscribe({ next: (ms) => this.metricas.set(ms), error: () => undefined });
    // Sin sugerencias el chat sigue funcionando: el error se ignora a propósito (no bloquea).
    this.chat.sugerenciasIniciales().subscribe({ next: (ss) => this.sugerencias.set(ss), error: () => undefined });
  }

  alternarGuardadas(): void {
    this.verGuardadas.update((v) => !v);
    guardarPreferencia('chat.verGuardadas', this.verGuardadas());
  }
  alternarMetricas(): void {
    this.verMetricas.update((v) => !v);
    guardarPreferencia('chat.verMetricas', this.verMetricas());
  }

  /** Clic en una métrica del panel: deja la pregunta lista en el compositor. */
  usarMetrica(m: MetricaDisponible): void {
    this.modo.set('chat');
    this.borrador = `${m.nombre} de este año por mes`;
  }

  /** Abre una consulta nueva conservando lo que la persona estaba escribiendo. */
  nuevaDesdeSugerencia(): void {
    const borrador = this.borrador;
    this.sugerencia.set(null);
    this.nueva();
    this.borrador = borrador;
  }

  // ---------------------------------------------------------------- conversaciones

  abrir(c: Conversacion): void {
    this.modo.set('chat');
    this.activaId.set(c.id);
    this.panelAbierto.set(false);
    this.cargandoMensajes.set(true);
    this.error.set(null);
    this.sugerencia.set(null);
    this.acciones.set(null);
    this.chat.estado(c.id).subscribe({ next: (e) => this.sesion.set(e), error: () => this.sesion.set(null) });
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
        this.sesion.set(null);
        this.sugerencia.set(null);
        this.acciones.set(null);
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

  /**
   * Clic en una opción o sugerencia: la acción (tool + params armados por el agente) se ejecuta
   * sin modelo y el turno queda en la conversación con la etiqueta como pregunta.
   */
  ejecutarOpcion(opcion: OpcionAccion): void {
    if (this.pensando()) return;
    this.modo.set('chat');
    const conversacion = this.activaId();
    if (conversacion === null) {
      this.chat.crear().subscribe({
        next: (c) => {
          this.conversaciones.update((cs) => [c, ...cs]);
          this.activaId.set(c.id);
          this.ejecutarOpcionEn(c.id, opcion);
        },
        error: (e: Error) => this.error.set(e.message),
      });
      return;
    }
    this.ejecutarOpcionEn(conversacion, opcion);
  }

  private ejecutarOpcionEn(conversacion: number, opcion: OpcionAccion): void {
    this.prepararTurno(opcion.etiqueta);
    this.chat.accion(conversacion, opcion).subscribe({
      next: (r) => this.trasRespuesta(conversacion, r),
      error: (e: Error) => {
        this.pensando.set(false);
        this.error.set(e.message);
      },
    });
  }

  /** Eco optimista del turno del usuario y estado «pensando». */
  private prepararTurno(texto: string): void {
    this.error.set(null);
    this.acciones.set(null);
    this.pensando.set(true);
    this.mensajes.update((ms) => [
      ...ms,
      { id: -Date.now(), rol: 'usuario', contenido: texto, tarjetas: null, datos: null, creadoEn: new Date().toISOString() },
    ]);
    this.alFinal();
  }

  /** Respuesta del agente (mensaje o acción): estado, botones y recarga de lo persistido. */
  private trasRespuesta(conversacion: number, r: RespuestaAgente): void {
    this.pensando.set(false);
    this.sesion.set(r.sesion);
    this.sugerencia.set(r.sugerencia);
    this.acciones.set({ opciones: r.opciones ?? [], sugerencias: r.sugerencias ?? [], regenerado: r.textoRegenerado === true });
    this.chat.mensajes(conversacion).subscribe({
      next: (ms) => {
        this.mensajes.set(ms);
        this.alFinal();
      },
    });
    this.chat.conversaciones().subscribe({ next: (cs) => this.conversaciones.set(cs) });
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
    this.borrador = '';
    // Eco optimista: el turno del usuario se ve de inmediato; el id definitivo
    // llega al recargar los mensajes persistidos.
    this.prepararTurno(texto);

    this.chat.enviar(conversacion, texto).subscribe({
      next: (r) => this.trasRespuesta(conversacion, r),
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

  formatear(valor: number, unidad?: UnidadMetrica): string {
    return formatearValor(valor, unidad);
  }

  corteDe(t: TarjetaDato): string | null {
    return fechaCorte(t.corte);
  }

  /** La empresa de la fila (desglose por empresa) o las empresas que suma la cifra. */
  empresasDe(t: TarjetaDato): string | null {
    return t.empresa ?? textoEmpresas(t.empresas);
  }

  private alFinal(): void {
    queueMicrotask(() => {
      const el = this.scroll?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
