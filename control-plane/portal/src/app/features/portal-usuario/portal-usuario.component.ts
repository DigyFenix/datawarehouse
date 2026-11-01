import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { EnlacePublico, EstadoPortalOrg, ResultadoRotacion, TableroPortal } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { generarPassword } from '../../ui/password';

interface FormTablero {
  clave: string;
  nombre: string;
  descripcion: string;
  /** URL de Publish to Web sin el parámetro de hoja (se arma al guardar). */
  urlBase: string;
  /** Hoja del reporte (`pageName` de Power BI). Vacío = el reporte completo. */
  pageName: string;
  orden: number;
  activo: boolean;
  mostrarBarra: boolean;
  grupo: string;
  /** Texto del grupo cuando se elige «Otro…» en el select. */
  grupoNuevo: string;
}

interface FormAdmin {
  email: string;
  nombre: string;
  password: string;
}

interface UsuarioPortalOrg {
  id: number;
  email: string;
  nombre: string;
  esAdmin: boolean;
  activo: boolean;
}

type Seccion = 'acceso' | 'marca' | 'tableros';

/** Valor del select de grupo que abre el campo de texto libre. */
const GRUPO_OTRO = '__otro__';

/**
 * Administración del PORTAL DE USUARIO del tenant activo: URL de ingreso (hash),
 * logo (white-label), siembra del primer admin de la organización y alta de
 * tableros de Power BI (Publish to Web). La organización se auto-administra
 * después (sus usuarios y perfiles los crea su propio admin en su portal).
 */
@Component({
  selector: 'app-portal-usuario',
  standalone: true,
  imports: [FormsModule, RouterLink, DrawerComponent, PageHeaderComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Clientes" titulo="Portal del cliente">
      <div acciones class="accion-con-motivo">
        <button (click)="nuevoTablero()" [disabled]="!!motivoSinTablero()">+ Nuevo tablero</button>
        @if (motivoSinTablero(); as motivo) { <span class="motivo">{{ motivo }}</span> }
      </div>
    </app-page-header>
    <p class="ayuda">
      Aquí se administra lo que la organización consume: su URL de ingreso, su logo y sus
      tableros de Power BI. Los usuarios y perfiles los gestiona el admin de la organización
      desde su propio portal.
    </p>

    @if (estado(); as e) {
      @if (!e.esquemaAplicado) {
        <div class="tarjeta aviso-provision">
          <app-icon name="advertencia" />
          <div>
            <strong>Falta provisionar esta organización</strong>
            <p>
              El portal de usuario todavía no está preparado en la base de
              <strong>{{ orgs.activa()?.nombre }}</strong>. Hasta entonces no se pueden sembrar su
              administrador ni registrar tableros.
            </p>
            <a routerLink="/organizaciones" class="secundario pequeno">Ir a Organizaciones</a>
          </div>
        </div>
      }
    }

    <nav class="secciones" role="tablist" aria-label="Secciones del portal de usuario">
      @for (s of secciones; track s.id) {
        <button type="button" role="tab" class="seccion" [class.activo]="seccion() === s.id"
                [attr.aria-selected]="seccion() === s.id" (click)="seccion.set(s.id)">{{ s.etiqueta }}</button>
      }
    </nav>

    <!-- ===================== ACCESO DEL ADMIN ===================== -->
    @if (seccion() === 'acceso') {
      <div class="grid2">
        <div class="tarjeta">
          <span class="eyebrow">Acceso del administrador del cliente</span>
          @if (estado(); as e) {
            <div class="fila-url">
              <code class="url">{{ urlIngreso() }}</code>
              <button class="secundario pequeno" (click)="copiarUrl()">Copiar</button>
            </div>
            <ul class="estado">
              <li>
                Portal de usuario:
                @if (e.esquemaAplicado) { <strong class="ok">listo</strong> }
                @else { <strong class="mal">sin provisionar</strong> }
              </li>
              <li>Usuarios: <strong>{{ e.usuarios }}</strong> · Tableros: <strong>{{ e.tableros }}</strong></li>
              <li>
                Admin de la organización:
                @if (e.adminExiste) { <strong class="ok">sembrado</strong> }
                @else if (e.esquemaAplicado) {
                  <button class="secundario pequeno" (click)="abrirAdmin()">Sembrar admin</button>
                } @else { <span class="sutil">pendiente de provisionar</span> }
              </li>
            </ul>
          } @else if (errorEstado()) {
            <p class="error">No se pudo leer el estado del portal: {{ errorEstado() }}</p>
          } @else {
            <p class="sutil">Cargando estado…</p>
          }
        </div>

        <!-- Soporte: ver el portal como lo ve el usuario. Es la mitad de resolver un
             «no me aparece el tablero», y evita pedirle la contraseña a nadie. -->
        <div class="tarjeta">
          <span class="eyebrow">Ver como un usuario</span>
          <p class="sutil">
            Abre el portal de la organización con la vista exacta de esa persona.
            La sesión es de <strong>solo lectura</strong>, dura 30 minutos y queda registrada
            en la auditoría de ambos planos. No necesitas su contraseña.
          </p>
          @if (usuariosPortal().length) {
            <div class="fila-url">
              <select [(ngModel)]="usuarioAVer" name="usuarioAVer" style="flex:1;">
                @for (u of usuariosPortal(); track u.id) {
                  <option [ngValue]="u.id" [disabled]="!u.activo">
                    {{ u.nombre }} · {{ u.email }}{{ u.activo ? '' : ' (inactivo)' }}
                  </option>
                }
              </select>
            </div>
            <div class="fila-url">
              <button class="secundario pequeno" (click)="verComo()" [disabled]="emitiendo()" [attr.aria-busy]="emitiendo()">
                @if (emitiendo()) { <span class="spinner"></span> }
                {{ emitiendo() ? 'Abriendo…' : 'Ver portal' }}
              </button>
              <button class="secundario pequeno" (click)="restablecerPassword()" [disabled]="emitiendo()">
                Restablecer contraseña
              </button>
            </div>
            @if (temporal(); as t) {
              <div class="temporal">
                <span class="sutil">Contraseña temporal de <strong>{{ t.email }}</strong> — se muestra una sola vez:</span>
                <div class="fila-url">
                  <code class="url">{{ t.passwordTemporal }}</code>
                  <button class="secundario pequeno" (click)="copiar(t.passwordTemporal, t.email)">Copiar</button>
                </div>
              </div>
            }
          } @else if (estado()?.esquemaAplicado) {
            <app-empty titulo="Todavía no hay usuarios">
              Sembra primero al admin de la organización; él crea a los demás desde su portal.
            </app-empty>
          } @else {
            <app-empty titulo="Sin usuarios que ver">La organización aún no está provisionada.</app-empty>
          }
        </div>
      </div>
    }

    <!-- ===================== MARCA ===================== -->
    @if (seccion() === 'marca') {
      <div class="tarjeta">
        <span class="eyebrow">Marca (white-label)</span>
        <p class="sutil">El color se edita en Organizaciones; el logo aquí. El portal de usuario toma ambos.</p>
        <div class="fila-logo">
          @if (logoUrl(); as url) {
            <img [src]="url" alt="Logo de la organización" class="logo-preview" />
          } @else {
            <div class="logo-vacio">Sin logo</div>
          }
          <div class="acciones-logo">
            <label class="secundario boton-archivo" [class.ocupado]="subiendoLogo()" [attr.aria-busy]="subiendoLogo()">
              @if (subiendoLogo()) { <span class="spinner"></span> Subiendo… } @else { Subir logo }
              <input type="file" accept="image/png,image/jpeg,image/webp" (change)="subirLogo($event)" [disabled]="subiendoLogo()" hidden />
            </label>
            @if (logoUrl()) {
              <button class="secundario pequeno" (click)="eliminarLogo()" [disabled]="subiendoLogo()">Quitar</button>
            }
          </div>
        </div>
        <span class="sutil">PNG, JPG o WebP · máximo 300 KB. No se admite SVG porque puede ejecutar código.</span>
      </div>
    }

    <!-- ===================== TABLEROS ===================== -->
    @if (seccion() === 'tableros') {
      <div class="tarjeta enlace">
        <span class="eyebrow">Enlace público de Power BI</span>
        <p class="sutil">
          El vínculo de Publish to Web es público: quien lo copie del navegador entra sin usuario. Rotarlo deja
          inservible cualquier copia. Recomendado cada {{ diasRotacion }} días o en cuanto se sospeche una filtración.
        </p>
        @for (e of enlaces(); track e.huella) {
          <div class="enlace__fila" [class.enlace__fila--vencido]="e.diasVigente >= diasRotacion">
            <span class="enlace__codigo" title="Identificador corto del enlace: sirve para saber si cambió, no es el enlace completo">
              código <code>{{ e.huella }}</code>
            </span>
            <span>{{ e.activos }} {{ e.activos === 1 ? 'hoja activa' : 'hojas activas' }}@if (e.tableros > e.activos) { · {{ e.tableros - e.activos }} inactivas }</span>
            <span>vigente hace <strong>{{ e.diasVigente }}</strong> {{ e.diasVigente === 1 ? 'día' : 'días' }}</span>
            @if (e.diasVigente >= diasRotacion) { <span class="badge badge--en_revision">Toca rotar</span> }
          </div>
        } @empty {
          <p class="sutil">Ningún tablero tiene todavía un enlace de Publish to Web: aparecerá al registrar el primero.</p>
        }
        @if (enlaces().length) {
          <details class="pasos-rotacion">
            <summary>¿Cómo se rota el enlace?</summary>
            <ol class="enlace__pasos">
              <li>En Power BI: <em>Archivo → Insertar informe → Publicar en web</em> y crea un código nuevo.</li>
              <li>Pega aquí la URL nueva y pulsa <strong>Rotar</strong>: se cambia en todas las hojas (cada una conserva su página).</li>
              <li>Recién después, en Power BI: <em>Configuración → Administrar códigos para insertar</em> y elimina el código anterior.</li>
            </ol>
          </details>
          <form class="enlace__form" (ngSubmit)="rotarEnlace()">
            @if (enlaces().length > 1) {
              <select name="huellaRotar" [(ngModel)]="huellaRotar" aria-label="Enlace a rotar">
                @for (e of enlaces(); track e.huella) { <option [value]="e.huella">código {{ e.huella }}</option> }
              </select>
            }
            <input name="urlNueva" [(ngModel)]="urlNueva" placeholder="https://app.powerbi.com/view?r=…" autocomplete="off" aria-label="URL nueva de Publish to Web" />
            <button type="submit" [disabled]="rotando() || !urlNueva.trim()" [attr.aria-busy]="rotando()">
              @if (rotando()) { <span class="spinner"></span> }
              {{ rotando() ? 'Rotando…' : 'Rotar' }}
            </button>
          </form>
        }
      </div>

      <div class="barra-lista">
        <input class="buscador" type="search" [(ngModel)]="filtroTableros" (ngModelChange)="filtro.set($event)"
               placeholder="Buscar tablero por nombre, familia o clave…" aria-label="Buscar tablero" />
        <span class="sutil">{{ tablerosFiltrados().length }} de {{ tableros().length }}</span>
      </div>

      <div class="tarjeta tarjeta--tabla">
        <div class="tabla-wrap">
          <table>
            <thead><tr><th>Tablero</th><th>Familia</th><th>Hoja</th><th>Orden</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (t of tablerosFiltrados(); track t.id) {
                <tr>
                  <td>
                    <strong>{{ t.nombre }}</strong>
                    @if (t.descripcion) { <br /><span class="sutil">{{ t.descripcion }}</span> }
                    <br /><span class="sutil">clave <code>{{ t.clave }}</code></span>
                  </td>
                  <td>{{ t.grupo ?? '—' }}</td>
                  <td>
                    @if (hojaDe(t.urlPublica); as hoja) { <code class="hoja">{{ hoja }}</code> }
                    @else { <span class="sutil">reporte completo</span> }
                  </td>
                  <td>{{ t.orden }}</td>
                  <td>@if (t.activo) { <span class="badge badge--ok">Activo</span> } @else { <span class="badge badge--neutral">Inactivo</span> }</td>
                  <td class="col-acciones">
                    <button class="secundario pequeno" (click)="editarTablero(t)">Editar</button>
                    <button class="secundario pequeno peligro" (click)="eliminarTablero(t)">Eliminar</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6">
                  @if (!estado()?.esquemaAplicado) {
                    <app-empty titulo="Sin tableros">La organización aún no está provisionada; primero hay que completar ese paso en Organizaciones.</app-empty>
                  } @else if (tableros().length) {
                    <app-empty titulo="Ningún tablero coincide con la búsqueda">Prueba con otro nombre, familia o clave.</app-empty>
                  } @else {
                    <app-empty titulo="Todavía no hay tableros">Publica el reporte en Power BI (Publish to Web) y regístralo con «+ Nuevo tablero».</app-empty>
                  }
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <!-- ===================== DRAWER TABLERO ===================== -->
    @if (drawerTablero()) {
      <app-drawer [titulo]="edicionId() ? 'Editar tablero' : 'Nuevo tablero'" eyebrow="Portal de usuario" (cerrar)="drawerTablero.set(false)">
        <form (ngSubmit)="guardarTablero()">
          <div class="campo">
            <label for="t-nombre">Nombre</label>
            <input id="t-nombre" name="nombre" [(ngModel)]="formTablero.nombre" (ngModelChange)="alCambiarNombre()" required placeholder="Resumen de ventas" />
          </div>
          <div class="grid2">
            <div class="campo">
              <label for="t-clave">Clave</label>
              <input id="t-clave" name="clave" [(ngModel)]="formTablero.clave" (ngModelChange)="claveTocada = true" required
                     placeholder="resumen_ventas" [disabled]="!!edicionId()" />
              <span class="sutil">Se genera del nombre; puedes ajustarla. No cambia después de crear el tablero.</span>
            </div>
            <div class="campo">
              <label for="t-orden">Orden</label>
              <input id="t-orden" name="orden" type="number" min="0" [(ngModel)]="formTablero.orden" />
            </div>
          </div>
          <div class="campo">
            <label for="t-desc">Descripción</label>
            <input id="t-desc" name="descripcion" [(ngModel)]="formTablero.descripcion" />
          </div>
          <div class="campo">
            <label for="t-grupo">Familia</label>
            <select id="t-grupo" name="grupo" [(ngModel)]="formTablero.grupo">
              <option value="">Sin familia</option>
              @for (g of familias(); track g) { <option [value]="g">{{ g }}</option> }
              <option [value]="GRUPO_OTRO">Otra…</option>
            </select>
            @if (formTablero.grupo === GRUPO_OTRO) {
              <input name="grupoNuevo" [(ngModel)]="formTablero.grupoNuevo" placeholder="Nombre de la familia nueva" style="margin-top:8px;" required />
            }
            <span class="sutil">Los tableros de la misma familia se muestran juntos en el inicio y se navegan como pestañas.</span>
          </div>
          <div class="campo">
            <label for="t-url">URL pública (Publish to Web)</label>
            <input id="t-url" name="urlBase" [(ngModel)]="formTablero.urlBase" (ngModelChange)="alPegarUrl($event)" required placeholder="https://app.powerbi.com/view?r=…" />
            <span class="sutil">La URL es pública por naturaleza (riesgo aceptado): el portal solo la muestra a usuarios con perfil autorizado y audita cada apertura.</span>
          </div>
          <div class="campo">
            <label for="t-hoja">Hoja de Power BI <span class="sutil">· opcional</span></label>
            <input id="t-hoja" name="pageName" [(ngModel)]="formTablero.pageName" placeholder="ReportSection1a2b3c" autocomplete="off" spellcheck="false" />
            <span class="sutil">Para un tablero por hoja. Es el identificador que Power BI muestra al final de la URL cuando abres esa página. Vacío = el reporte completo.</span>
          </div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="formTablero.activo" /> Activo</label>
          <label class="check"><input type="checkbox" name="mostrarBarra" [(ngModel)]="formTablero.mostrarBarra" /> Mostrar la barra de Power BI</label>
          <span class="sutil">Necesaria si el tablero es un reporte de varias páginas (flechas para navegar). Trae el botón «compartir», que muestra el vínculo público.</span>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerTablero.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()" [attr.aria-busy]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }

    <!-- ===================== DRAWER ADMIN ===================== -->
    @if (drawerAdmin()) {
      <app-drawer titulo="Sembrar admin de la organización" eyebrow="Portal de usuario" (cerrar)="drawerAdmin.set(false)">
        <p class="ayuda">
          Primer usuario administrador del portal de la organización. La contraseña es temporal:
          el sistema fuerza el cambio en el primer ingreso. Los demás usuarios los crea la
          propia organización.
        </p>
        <form (ngSubmit)="sembrarAdmin()">
          <div class="campo"><label for="a-email">Email</label><input id="a-email" name="email" type="email" [(ngModel)]="formAdmin.email" required /></div>
          <div class="campo"><label for="a-nombre">Nombre</label><input id="a-nombre" name="nombre" [(ngModel)]="formAdmin.nombre" required /></div>
          <div class="campo">
            <label for="a-pass">Contraseña temporal</label>
            <div class="pass-fila">
              <input id="a-pass" name="password" type="text" [(ngModel)]="formAdmin.password" required minlength="8" autocomplete="off" spellcheck="false" />
              <button type="button" class="secundario pequeno" (click)="formAdmin.password = generar()">Generar</button>
              <button type="button" class="secundario pequeno" (click)="copiar(formAdmin.password, formAdmin.email)" [disabled]="!formAdmin.password">Copiar</button>
            </div>
            <span class="sutil">Entrégasela al admin del cliente; deberá cambiarla en su primer ingreso.</span>
          </div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerAdmin.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()" [attr.aria-busy]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Sembrando…' : 'Sembrar admin' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin:-4px 0 16px; font-size:12.5px; color:var(--muted); max-width:720px; }
    .sutil { font-size:11.5px; color:var(--faint); }
    .accion-con-motivo { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .motivo { font-size:11.5px; color:var(--muted); }
    .aviso-provision { display:flex; gap:12px; align-items:flex-start; margin-bottom:16px; border-color:color-mix(in srgb, var(--warn) 35%, var(--border)); background:var(--warn-bg); color:var(--warn); }
    .aviso-provision strong { color:var(--text); display:block; margin-bottom:2px; }
    .aviso-provision p { margin:0 0 8px; font-size:13px; color:var(--muted); }
    .secciones { display:inline-flex; gap:2px; margin:0 0 var(--sp-5); padding:3px; border-radius:10px; background:var(--surface-2); }
    .seccion { height:32px; min-height:0; padding:0 14px; border-radius:8px; background:transparent; border:0; color:var(--muted); font-size:var(--fs-sm); font-weight:500; }
    .seccion:hover { background:transparent; color:var(--text); }
    .seccion.activo { color:var(--text); background:var(--surface); box-shadow:var(--sh-1); font-weight:600; }
    .enlace { display:flex; flex-direction:column; gap:10px; margin-bottom:16px; }
    .enlace__fila { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; font-size:13px; padding:8px 10px; border-radius:8px; background:var(--surface-2); }
    .enlace__fila--vencido { outline:1px solid var(--warn); }
    .enlace__codigo { color:var(--muted); cursor:help; }
    .pasos-rotacion summary { cursor:pointer; font-size:13px; color:var(--brand-700); }
    .enlace__pasos { margin:8px 0 0; padding-left:18px; font-size:12.5px; color:var(--muted); display:flex; flex-direction:column; gap:2px; }
    .enlace__form { display:flex; gap:8px; flex-wrap:wrap; }
    .enlace__form input { flex:1; min-width:280px; }
    .enlace__form select { width:auto; }
    .barra-lista { display:flex; align-items:center; gap:12px; margin:0 0 10px; }
    .buscador { max-width:420px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
    .check { display:flex; align-items:center; gap:8px; font-size:13.5px; margin:8px 0; color:var(--muted); }
    .fila-url { display:flex; align-items:center; gap:8px; margin:10px 0; flex-wrap:wrap; }
    .temporal { margin-top:8px; padding:10px 12px; border-radius:8px; background:var(--surface-2); }
    .temporal .fila-url { margin:6px 0 0; }
    .url { font-size:12px; word-break:break-all; }
    .hoja { font-size:11.5px; }
    .estado { list-style:none; padding:0; margin:8px 0 0; display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--muted); }
    .ok { color:var(--ok); }
    .mal { color:var(--danger); }
    .fila-logo { display:flex; align-items:center; gap:14px; margin:10px 0; }
    .logo-preview { max-height:56px; max-width:180px; border-radius:8px; border:1px solid var(--border); padding:4px; background:#fff; }
    .logo-vacio { width:120px; height:56px; border:1px dashed var(--border); border-radius:8px; display:grid; place-items:center; color:var(--faint); font-size:12px; }
    .acciones-logo { display:flex; flex-direction:column; gap:6px; }
    .boton-archivo { cursor:pointer; display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border:1px solid var(--border-2); border-radius:8px; font-size:13px; box-shadow:var(--sh-1); }
    .boton-archivo.ocupado { opacity:.6; cursor:progress; }
    .pass-fila { display:flex; gap:8px; align-items:center; }
    .pass-fila input { flex:1; font-family:var(--mono); }
    @media (max-width: 860px) { .grid2 { grid-template-columns:1fr; } }
  `],
})
export class PortalUsuarioComponent {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly confirmar = inject(ConfirmService);
  readonly orgs = inject(OrganizacionService);

  readonly GRUPO_OTRO = GRUPO_OTRO;
  readonly secciones: { id: Seccion; etiqueta: string }[] = [
    { id: 'acceso', etiqueta: 'Acceso del admin' },
    { id: 'marca', etiqueta: 'Marca' },
    { id: 'tableros', etiqueta: 'Tableros' },
  ];
  readonly seccion = signal<Seccion>('acceso');

  readonly estado = signal<EstadoPortalOrg | null>(null);
  readonly errorEstado = signal<string | null>(null);
  readonly usuariosPortal = signal<UsuarioPortalOrg[]>([]);
  readonly emitiendo = signal(false);
  /** Base del portal de usuario: viene del API (configuración del servidor, no del build). */
  readonly portalUsuarioUrl = signal(environment.portalUsuarioUrl);
  readonly temporal = signal<{ email: string; passwordTemporal: string } | null>(null);
  usuarioAVer: number | null = null;
  readonly tableros = signal<TableroPortal[]>([]);
  readonly filtro = signal('');
  filtroTableros = '';
  /** Días tras los que se sugiere rotar el enlace público (aviso visual, no bloquea). */
  readonly diasRotacion = 30;
  readonly enlaces = signal<EnlacePublico[]>([]);
  readonly rotando = signal(false);
  urlNueva = '';
  huellaRotar = '';
  readonly logoUrl = signal<string | null>(null);
  readonly subiendoLogo = signal(false);
  readonly drawerTablero = signal(false);
  readonly drawerAdmin = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);
  /** Si el usuario editó la clave a mano, el nombre deja de regenerarla. */
  claveTocada = false;

  formTablero: FormTablero = this.tableroVacio();
  formAdmin: FormAdmin = { email: '', nombre: '', password: '' };

  /** Por qué no se puede crear un tablero ahora mismo (texto visible junto al botón). */
  readonly motivoSinTablero = computed(() => {
    if (this.orgs.activaId() === null) return 'Elige una organización en la barra superior';
    const e = this.estado();
    if (!e) return 'Cargando el estado del portal…';
    if (!e.esquemaAplicado) return 'Falta provisionar esta organización';
    return null;
  });

  /** Familias (grupos) ya usadas por los tableros de la organización. */
  readonly familias = computed(() =>
    [...new Set(this.tableros().map((t) => t.grupo).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, 'es')),
  );

  readonly tablerosFiltrados = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    if (!q) return this.tableros();
    return this.tableros().filter((t) =>
      [t.nombre, t.clave, t.grupo ?? '', t.descripcion ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  });

  constructor() {
    this.api.get<{ portalUsuarioUrl: string }>('/config').subscribe({
      next: (c) => this.portalUsuarioUrl.set(c.portalUsuarioUrl),
      error: (e: Error) => this.toast.error('No se pudo leer la configuración del servidor', e.message),
    });
    // cargar() escribe signals de forma síncrona (resetea estado/tableros/logo);
    // sin allowSignalWrites, Angular corta el effect con NG0600 y la pantalla
    // se queda en "Cargando estado…".
    effect(
      () => {
        this.orgs.activaId();
        this.cargar();
      },
      { allowSignalWrites: true },
    );
  }

  private tableroVacio(): FormTablero {
    return {
      clave: '', nombre: '', descripcion: '', urlBase: '', pageName: '', orden: 0,
      activo: true, mostrarBarra: false, grupo: '', grupoNuevo: '',
    };
  }

  urlIngreso(): string {
    const hash = this.orgs.activa()?.hashTenant ?? '';
    return `${this.portalUsuarioUrl()}/${hash}`;
  }

  generar(): string {
    return generarPassword();
  }

  copiar(texto: string, contexto?: string): void {
    void navigator.clipboard.writeText(texto).then(
      () => this.toast.exito('Contraseña copiada', contexto ? `Entrégasela a ${contexto}` : undefined),
      () => this.toast.error('No se pudo copiar', 'Selecciónala y cópiala a mano.'),
    );
  }

  private cargarUsuariosPortal(organizacionId: number): void {
    this.api
      .get<UsuarioPortalOrg[]>(`/organizaciones/${organizacionId}/portal/usuarios`)
      .subscribe({
        next: (us) => {
          this.usuariosPortal.set(us);
          this.usuarioAVer = us.find((u) => u.activo)?.id ?? null;
        },
      });
  }

  /**
   * Pide el pase y abre el portal del cliente en otra pestaña. El pase viaja en el
   * FRAGMENTO (#pase=): el navegador no lo manda al servidor, así que no queda en logs
   * de Caddy/nginx ni en el Referer. Además caduca en dos minutos y sirve una sola vez.
   */
  verComo(): void {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null || this.usuarioAVer === null) return;
    this.emitiendo.set(true);
    this.api
      .post<{ ticket: string; hashTenant: string; usuario: { email: string } }>(
        `/organizaciones/${organizacionId}/portal/usuarios/${this.usuarioAVer}/impersonar`,
        {},
      )
      .subscribe({
        next: (r) => {
          this.emitiendo.set(false);
          const url = `${this.portalUsuarioUrl()}/${r.hashTenant}/entrar-como#pase=${encodeURIComponent(r.ticket)}`;
          window.open(url, '_blank', 'noopener');
          this.toast.info('Portal abierto en otra pestaña', `Viendo como ${r.usuario.email}. La sesión es de solo lectura.`);
        },
        error: (e: Error) => {
          this.emitiendo.set(false);
          this.toast.error('No se pudo abrir el portal', e.message);
        },
      });
  }

  /** Restablece la contraseña del usuario elegido y muestra la temporal una sola vez. */
  async restablecerPassword(): Promise<void> {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null || this.usuarioAVer === null) return;
    const usuario = this.usuariosPortal().find((u) => u.id === this.usuarioAVer);
    const ok = await this.confirmar.confirmar({
      titulo: 'Restablecer contraseña',
      mensaje: `Se generará una contraseña temporal para ${usuario?.email ?? 'este usuario'}. La actual deja de servir y deberá cambiarla al entrar.`,
      textoConfirmar: 'Restablecer',
    });
    if (!ok) return;
    this.emitiendo.set(true);
    this.api
      .post<{ email: string; passwordTemporal: string }>(
        `/organizaciones/${organizacionId}/portal/usuarios/${this.usuarioAVer}/restablecer-password`,
        {},
      )
      .subscribe({
        next: (r) => {
          this.emitiendo.set(false);
          this.temporal.set(r);
          this.toast.exito('Contraseña restablecida', `Copia la temporal y entrégasela a ${r.email}: no se vuelve a mostrar.`);
        },
        error: (e: Error) => {
          this.emitiendo.set(false);
          this.toast.error('No se pudo restablecer', e.message);
        },
      });
  }

  copiarUrl(): void {
    void navigator.clipboard.writeText(this.urlIngreso()).then(
      () => this.toast.exito('URL copiada', 'Entrégala al cliente como su acceso al portal'),
      () => this.toast.error('No se pudo copiar', 'Selecciona la URL y cópiala a mano.'),
    );
  }

  cargar(): void {
    const organizacionId = this.orgs.activaId();
    this.estado.set(null);
    this.tableros.set([]);
    this.enlaces.set([]);
    this.logoUrl.set(null);
    this.usuariosPortal.set([]);
    this.temporal.set(null);
    this.errorEstado.set(null);
    this.usuarioAVer = null;
    if (organizacionId === null) return;
    this.api.get<EstadoPortalOrg>(`/organizaciones/${organizacionId}/portal/estado`).subscribe({
      next: (e) => {
        this.estado.set(e);
        if (e.esquemaAplicado) {
          this.cargarTableros(organizacionId);
          this.cargarUsuariosPortal(organizacionId);
        }
      },
      error: (e: Error) => {
        this.errorEstado.set(e.message);
        this.toast.error('No se pudo leer el estado del portal', e.message);
      },
    });
    this.cargarLogo(organizacionId);
  }

  private cargarTableros(organizacionId: number): void {
    this.api.get<TableroPortal[]>(`/organizaciones/${organizacionId}/portal/tableros`).subscribe({
      next: (d) => this.tableros.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los tableros', e.message),
    });
    this.api.get<EnlacePublico[]>(`/organizaciones/${organizacionId}/portal/tableros/enlaces`).subscribe({
      next: (d) => {
        this.enlaces.set(d);
        this.huellaRotar = d[0]?.huella ?? '';
      },
      error: (e: Error) => this.toast.error('No se pudo leer el enlace público', e.message),
    });
  }

  /** Reemplaza el código r= en todas las hojas que usan el enlace elegido. */
  async rotarEnlace(): Promise<void> {
    const urlNueva = this.urlNueva.trim();
    if (!urlNueva) return;
    const varios = this.enlaces().length > 1;
    const ok = await this.confirmar.confirmar({
      titulo: 'Rotar el enlace público',
      mensaje: 'Todas las hojas pasan a usar el código nuevo y cualquier copia del enlace anterior deja de abrir. Después tendrás que eliminar el código viejo en Power BI.',
      textoConfirmar: 'Rotar enlace',
    });
    if (!ok) return;
    this.rotando.set(true);
    const organizacionId = this.orgs.exigirId();
    this.api
      .post<ResultadoRotacion>(`/organizaciones/${organizacionId}/portal/tableros/rotar-enlace`, {
        urlNueva,
        ...(varios ? { huellaActual: this.huellaRotar } : {}),
      })
      .subscribe({
        next: (r) => {
          this.toast.exito(
            'Enlace rotado',
            `${r.tablerosActualizados} hojas usan ahora el código ${r.huellaNueva}. Siguiente paso: elimina el código ${r.huellaAnterior} en Power BI.`,
          );
          this.urlNueva = '';
          this.rotando.set(false);
          this.cargarTableros(organizacionId);
        },
        error: (e: Error) => {
          this.toast.error('No se pudo rotar el enlace', e.message);
          this.rotando.set(false);
        },
      });
  }

  // --- Logo (binario autenticado → object URL) ---

  private cargarLogo(organizacionId: number): void {
    if (!this.orgs.activa()?.logoMime) return;
    this.http
      .get(`${environment.apiUrl}/organizaciones/${organizacionId}/logo`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => this.logoUrl.set(URL.createObjectURL(blob)),
        error: () => this.logoUrl.set(null),
      });
  }

  subirLogo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    if (archivo.size > 300 * 1024) {
      this.toast.error('Logo demasiado grande', 'El máximo es 300 KB. Redúcelo y vuelve a subirlo.');
      entrada.value = '';
      return;
    }
    this.subiendoLogo.set(true);
    const lector = new FileReader();
    lector.onerror = () => {
      this.subiendoLogo.set(false);
      this.toast.error('No se pudo leer el archivo', 'Vuelve a elegirlo.');
    };
    lector.onload = () => {
      const resultado = String(lector.result);
      const datosBase64 = resultado.slice(resultado.indexOf(',') + 1);
      const organizacionId = this.orgs.exigirId();
      this.api
        .put(`/organizaciones/${organizacionId}/logo`, { mime: archivo.type, datosBase64 })
        .subscribe({
          next: () => {
            this.subiendoLogo.set(false);
            entrada.value = '';
            this.toast.exito('Logo actualizado', 'El portal de usuario ya lo muestra.');
            // Refresca el listado (logoMime) y la vista previa.
            this.orgs.cargar().subscribe({ next: () => this.cargarLogo(organizacionId), error: () => {} });
          },
          error: (e: Error) => {
            this.subiendoLogo.set(false);
            entrada.value = '';
            this.toast.error('No se pudo subir el logo', e.message);
          },
        });
    };
    lector.readAsDataURL(archivo);
  }

  async eliminarLogo(): Promise<void> {
    const ok = await this.confirmar.confirmar({
      titulo: 'Quitar el logo',
      mensaje: 'El portal de usuario mostrará solo el nombre de la organización hasta que subas otro.',
      textoConfirmar: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    const organizacionId = this.orgs.exigirId();
    this.api.delete(`/organizaciones/${organizacionId}/logo`).subscribe({
      next: () => {
        this.logoUrl.set(null);
        this.toast.exito('Logo eliminado');
        this.orgs.cargar().subscribe({ error: () => {} });
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar el logo', e.message),
    });
  }

  // --- Siembra del admin ---

  abrirAdmin(): void {
    this.formAdmin = { email: '', nombre: '', password: generarPassword() };
    this.errorForm.set(null);
    this.drawerAdmin.set(true);
  }

  sembrarAdmin(): void {
    if (!this.formAdmin.password.trim()) {
      this.errorForm.set('Genera una contraseña temporal antes de sembrar.');
      return;
    }
    this.errorForm.set(null);
    this.guardando.set(true);
    const organizacionId = this.orgs.exigirId();
    this.api.post(`/organizaciones/${organizacionId}/portal/admin`, this.formAdmin).subscribe({
      next: () => {
        this.toast.exito('Admin sembrado', `Entrégale la contraseña temporal a ${this.formAdmin.email}; deberá cambiarla al entrar.`);
        this.guardando.set(false);
        this.drawerAdmin.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  // --- Tableros ---

  /** Hoja (`pageName`) embebida en una URL de Publish to Web, si la tiene. */
  hojaDe(url: string): string | null {
    const m = /[?&]pageName=([^&#]+)/.exec(url);
    return m ? decodeURIComponent(m[1]) : null;
  }

  private sinHoja(url: string): string {
    // Solo regex: `new URL()` re-codificaría el valor de r= y rompería el enlace.
    return url
      .replace(/([?&])pageName=[^&#]*(&|(?=#)|$)/, (_m, sep: string, fin: string) => (fin === '&' ? sep : ''))
      .replace(/[?&](#|$)/, '$1');
  }

  private slug(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  alCambiarNombre(): void {
    if (this.edicionId() || this.claveTocada) return;
    this.formTablero.clave = this.slug(this.formTablero.nombre);
  }

  /** Si pegan la URL con la hoja incluida, se separa al campo propio. */
  alPegarUrl(valor: string): void {
    const hoja = this.hojaDe(valor);
    if (!hoja) return;
    this.formTablero.pageName = hoja;
    this.formTablero.urlBase = this.sinHoja(valor);
  }

  nuevoTablero(): void {
    this.formTablero = this.tableroVacio();
    this.claveTocada = false;
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.drawerTablero.set(true);
  }

  editarTablero(t: TableroPortal): void {
    this.formTablero = {
      clave: t.clave,
      nombre: t.nombre,
      descripcion: t.descripcion ?? '',
      urlBase: this.sinHoja(t.urlPublica),
      pageName: this.hojaDe(t.urlPublica) ?? '',
      orden: t.orden,
      activo: t.activo,
      mostrarBarra: t.mostrarBarra,
      grupo: t.grupo ?? '',
      grupoNuevo: '',
    };
    this.claveTocada = true;
    this.edicionId.set(t.id);
    this.errorForm.set(null);
    this.drawerTablero.set(true);
  }

  guardarTablero(): void {
    const grupo = (this.formTablero.grupo === GRUPO_OTRO ? this.formTablero.grupoNuevo : this.formTablero.grupo).trim();
    if (this.formTablero.grupo === GRUPO_OTRO && !grupo) {
      this.errorForm.set('Escribe el nombre de la familia nueva o elige una existente.');
      return;
    }
    const urlBase = this.sinHoja(this.formTablero.urlBase.trim());
    const hoja = this.formTablero.pageName.trim();
    if (!urlBase) {
      this.errorForm.set('Falta la URL pública del reporte.');
      return;
    }
    const urlPublica = hoja ? `${urlBase}${urlBase.includes('?') ? '&' : '?'}pageName=${encodeURIComponent(hoja)}` : urlBase;
    this.errorForm.set(null);
    this.guardando.set(true);
    const organizacionId = this.orgs.exigirId();
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.formTablero.nombre,
      descripcion: this.formTablero.descripcion || undefined,
      urlPublica,
      orden: this.formTablero.orden,
      activo: this.formTablero.activo,
      mostrarBarra: this.formTablero.mostrarBarra,
      grupo: grupo || null,
      ...(id ? {} : { clave: this.formTablero.clave }),
    };
    const accion = id
      ? this.api.put<TableroPortal>(`/organizaciones/${organizacionId}/portal/tableros/${id}`, cuerpo)
      : this.api.post<TableroPortal>(`/organizaciones/${organizacionId}/portal/tableros`, cuerpo);
    accion.subscribe({
      next: (t) => {
        this.toast.exito(
          id ? 'Tablero actualizado' : 'Tablero creado',
          id ? t.nombre : `${t.nombre}. Siguiente paso: el admin del cliente lo asigna a un perfil desde su portal.`,
        );
        this.guardando.set(false);
        this.drawerTablero.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  async eliminarTablero(t: TableroPortal): Promise<void> {
    const ok = await this.confirmar.confirmar({
      titulo: `Eliminar «${t.nombre}»`,
      mensaje: 'Los perfiles de la organización que lo tenían asignado dejarán de verlo. Esta acción no se puede deshacer.',
      textoConfirmar: 'Eliminar tablero',
      peligro: true,
    });
    if (!ok) return;
    const organizacionId = this.orgs.exigirId();
    this.api.delete(`/organizaciones/${organizacionId}/portal/tableros/${t.id}`).subscribe({
      next: () => {
        this.toast.exito('Tablero eliminado', t.nombre);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }
}
