import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Dominio, PlanIngesta, PoliticaIngesta, Sociedad } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';

type Estrategia = PoliticaIngesta['estrategia'];

// Descripciones de las estrategias. Son comportamientos del MOTOR (código del worker),
// un conjunto cerrado: no se crean desde el portal, solo se eligen.
const ESTRATEGIAS: Record<Estrategia, { etiqueta: string; ayuda: string; tipo: 'hecho' | 'maestro' }> = {
  incremental_ventana: {
    etiqueta: 'Ventana móvil',
    ayuda: 'Trae los últimos N (según la ventana) por el campo de fecha. En Bronze hace delete-insert de esa ventana (recargar no duplica y captura correcciones).',
    tipo: 'hecho',
  },
  abiertos: {
    etiqueta: 'Documentos abiertos',
    ayuda: 'Trae TODOS los documentos abiertos (sin filtro de fecha). Para CxC/Aging: no pierde saldos anteriores a la ventana.',
    tipo: 'hecho',
  },
  full_replace: {
    etiqueta: 'Reemplazo total',
    ayuda: 'Reemplaza el catálogo completo en cada corrida (truncate + carga). Simple; para maestros chicos sin necesidad de histórico.',
    tipo: 'maestro',
  },
  versionado: {
    etiqueta: 'Versionado (SCD2)',
    ayuda: 'Guarda versiones con rango de vigencia cuando cambian las columnas indicadas; los hechos toman la versión vigente a la fecha del documento.',
    tipo: 'maestro',
  },
};

interface FormPolitica {
  objeto: string;
  nombreNegocio: string;
  dominio: string;
  tipoObjeto: 'hecho' | 'maestro';
  estrategia: Estrategia;
  fuenteObjeto: string;
  campoFecha: string;
  lookbackValor: number | null;
  lookbackUnidad: 'dias' | 'meses';
  columnasVersionado: string;
  modelosDbt: string;
  owner: string;
  activo: boolean;
}

interface FormPlan {
  nombre: string;
  descripcion: string;
  cron: string;
  empresas: string[];
  objetos: string[];
  encadenaTransformacion: boolean;
  activo: boolean;
}

@Component({
  selector: 'app-ingesta',
  standalone: true,
  imports: [FormsModule, DrawerComponent, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Plano de datos · configuración</span>
        <h2>Ingesta gobernada</h2>
        <p class="contexto-org">
          @if (orgs.activa(); as org) {
            Configuración de <strong>{{ org.nombre }}</strong>
            · ERP <code>{{ org.erpTipo }}</code>
            · {{ sociedades().length }} sociedad(es)
            <span class="sutil">— se cambia de organización en la barra superior</span>
          } @else {
            <span class="sutil">Selecciona una organización en la barra superior.</span>
          }
        </p>
      </div>
    </div>

    @if (!orgs.activaId()) {
      <div class="tarjeta">
        <div class="vacio">
          <strong>Sin organización seleccionada</strong>
          La configuración de ingesta es propia de cada organización porque cada una tiene su
          ERP. Elige una arriba para ver sus políticas.
        </div>
      </div>
    } @else {

    <!-- ===== Políticas ===== -->
    <div class="seccion-head">
      <div>
        <h3>Políticas por objeto</h3>
        <p class="ayuda">El qué y cómo extraer: ventana, campo de fecha, estrategia. Lo lee el worker del plano de datos.</p>
      </div>
      <button (click)="nuevaPolitica()">+ Nueva política</button>
    </div>
    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Objeto</th><th>Dominio</th><th>Tipo</th><th>Estrategia</th><th>Ventana</th><th>Fuente</th><th></th></tr></thead>
          <tbody>
            @for (p of politicas(); track p.id) {
              <tr>
                <td><strong>{{ p.nombreNegocio }}</strong><br /><code>{{ p.objeto }}</code></td>
                <td>{{ nombreDominio(p.dominio) }}</td>
                <td>{{ p.tipoObjeto }}</td>
                <td><span class="chip" [title]="ayudaEstrategia(p.estrategia)">{{ etiquetaEstrategia(p.estrategia) }}</span></td>
                <td>
                  @if (p.estrategia === 'incremental_ventana') { {{ p.lookbackValor }} {{ p.lookbackUnidad }} · <code>{{ p.campoFecha }}</code> }
                  @else if (p.estrategia === 'versionado') { versiona: <code>{{ p.columnasVersionado.join(', ') }}</code> }
                  @else { <span style="color:var(--faint);">—</span> }
                </td>
                <td><code>{{ p.fuenteObjeto }}</code></td>
                <td style="text-align:right;">
                  <span class="fila-acciones">
                    <button type="button" class="secundario pequeno" [routerLink]="['/campos', p.objeto]">Campos</button>
                    <button type="button" class="secundario pequeno" (click)="editarPolitica(p)">Editar</button>
                  </span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7"><div class="vacio"><strong>Sin políticas</strong>Define cómo se extrae cada objeto de origen.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== Planes ===== -->
    <div class="seccion-head" style="margin-top:28px;">
      <div>
        <h3>Planes de corrida</h3>
        <p class="ayuda">El cuándo: un cron por corrida agrupa objetos y sociedades y encadena Bronze → Gold.</p>
      </div>
      <button (click)="nuevoPlan()">+ Nuevo plan</button>
    </div>
    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Plan</th><th>Cron</th><th>Sociedades</th><th>Objetos</th><th>Encadena</th><th></th></tr></thead>
          <tbody>
            @for (pl of planes(); track pl.id) {
              <tr>
                <td><strong>{{ pl.nombre }}</strong></td>
                <td><code>{{ pl.cron }}</code></td>
                <td>{{ pl.empresas.join(', ') }}</td>
                <td>{{ pl.objetos.length }} objeto(s)</td>
                <td>{{ pl.encadenaTransformacion ? 'sí' : 'no' }}</td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="editarPlan(pl)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="vacio"><strong>Sin planes</strong>Agrupa objetos en una corrida con horario.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    }

    <!-- ===== Drawer Política ===== -->
    @if (politicaAbierta()) {
      <app-drawer [titulo]="politicaEdicionId() ? 'Editar política' : 'Nueva política'" eyebrow="Ingesta" (cerrar)="politicaAbierta.set(false)">
        <form (ngSubmit)="guardarPolitica()">
          <div class="campo"><label>Objeto (clave)</label><input name="objeto" [(ngModel)]="fp.objeto" required placeholder="ventas_facturas" [disabled]="!!politicaEdicionId()" /></div>
          <div class="campo"><label>Nombre de negocio</label><input name="nombreNegocio" [(ngModel)]="fp.nombreNegocio" required placeholder="Ventas — Facturas" /></div>

          <div class="grid2">
            <div class="campo">
              <label>Dominio</label>
              <select name="dominio" [(ngModel)]="fp.dominio" required>
                @for (d of dominios(); track d.id) { <option [value]="d.clave">{{ d.nombre }}</option> }
              </select>
              @if (!agregandoDominio()) {
                <button type="button" class="enlace" (click)="agregandoDominio.set(true)">+ nuevo dominio</button>
              } @else {
                <div class="mini-form">
                  <input name="ndClave" [(ngModel)]="nuevoDom.clave" placeholder="clave (ej. inventario)" />
                  <input name="ndNombre" [(ngModel)]="nuevoDom.nombre" placeholder="Nombre visible" />
                  <div class="mini-acciones">
                    <button type="button" class="secundario pequeno" (click)="cancelarDominio()">Cancelar</button>
                    <button type="button" class="pequeno" (click)="crearDominio()">Agregar</button>
                  </div>
                </div>
              }
            </div>
            <div class="campo"><label>Tipo</label>
              <select name="tipoObjeto" [(ngModel)]="fp.tipoObjeto" (ngModelChange)="onTipoChange()">
                <option value="hecho">hecho</option><option value="maestro">maestro</option>
              </select>
            </div>
          </div>

          <div class="campo">
            <label>Estrategia <span class="sutil">· definida por el motor</span></label>
            <select name="estrategia" [(ngModel)]="fp.estrategia">
              @for (e of estrategiasDisponibles(); track e) { <option [value]="e">{{ ESTRATEGIAS[e].etiqueta }} ({{ e }})</option> }
            </select>
            <p class="nota-estrategia">{{ ESTRATEGIAS[fp.estrategia].ayuda }}</p>
          </div>

          <div class="campo"><label>Fuente en origen (table function / vista)</label><input name="fuenteObjeto" [(ngModel)]="fp.fuenteObjeto" required placeholder="DW_READONLY.TF_FACTURAS" /></div>

          @if (fp.estrategia === 'incremental_ventana') {
            <div class="grid2">
              <div class="campo"><label>Campo de fecha</label><input name="campoFecha" [(ngModel)]="fp.campoFecha" placeholder="DocDate" /></div>
              <div class="campo"><label>Ventana hacia atrás</label>
                <div style="display:flex; gap:8px;">
                  <input type="number" name="lookbackValor" [(ngModel)]="fp.lookbackValor" placeholder="12" style="flex:1;" />
                  <select name="lookbackUnidad" [(ngModel)]="fp.lookbackUnidad" style="flex:1;">
                    <option value="meses">meses</option><option value="dias">días</option>
                  </select>
                </div>
              </div>
            </div>
          }
          @if (fp.estrategia === 'versionado') {
            <div class="campo"><label>Columnas que versionan (coma-separadas)</label><input name="columnasVersionado" [(ngModel)]="fp.columnasVersionado" placeholder="nombre, region" /></div>
          }

          <!-- Clave natural como chips (admite varias columnas) -->
          <div class="campo">
            <label>Clave natural <span class="sutil">· admite varias columnas</span></label>
            <div class="chips">
              @for (c of clavesNaturales(); track c) {
                <span class="tag">{{ c }} <button type="button" (click)="quitarClave(c)" aria-label="quitar">×</button></span>
              }
              <input class="chip-input" name="nuevaClave" [(ngModel)]="nuevaClave" placeholder="DocEntry"
                     (keydown.enter)="$event.preventDefault(); agregarClave()" (blur)="agregarClave()" />
            </div>
            <p class="sutil" style="margin-top:4px;">Enter para agregar. Ej. hecho a nivel línea: <code>DocEntry</code> + <code>LineNum</code>.</p>
          </div>

          <div class="campo">
            <label>Modelos dbt <span class="sutil">· transformación Bronze → Gold</span></label>
            <input name="modelosDbt" [(ngModel)]="fp.modelosDbt" placeholder="silver_socio_negocio+" />
            <p class="sutil" style="margin-top:4px;">Selección de <code>dbt build --select</code>. El <code>+</code> final incluye lo que depende aguas abajo (snapshot, dimensión). Vacío = sin botón Transformar.</p>
          </div>

          <div class="campo"><label>Owner</label><input name="owner" [(ngModel)]="fp.owner" required placeholder="data_engineer" /></div>
          <label class="check"><input type="checkbox" name="activoP" [(ngModel)]="fp.activo" /> Activa</label>

          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="politicaAbierta.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }

    <!-- ===== Drawer Plan ===== -->
    @if (planAbierto()) {
      <app-drawer [titulo]="planEdicionId() ? 'Editar plan' : 'Nuevo plan'" eyebrow="Ingesta" (cerrar)="planAbierto.set(false)">
        <form (ngSubmit)="guardarPlan()">
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="fpl.nombre" required placeholder="order-to-cash" [disabled]="!!planEdicionId()" /></div>
          <div class="campo"><label>Descripción</label><input name="descripcion" [(ngModel)]="fpl.descripcion" placeholder="Corrida diaria del corte order-to-cash" /></div>
          <div class="campo"><label>Cron</label><input name="cron" [(ngModel)]="fpl.cron" required placeholder="0 5 * * *" /></div>
          <!-- Solo sociedades de la organización activa: el backend rechaza las ajenas,
               así que la UI no las ofrece. -->
          <div class="campo">
            <div class="lista-head">
              <label>Sociedades incluidas <span class="sutil">· {{ fpl.empresas.length }} de {{ sociedades().length }}</span></label>
            </div>
            <div class="pills">
              @for (s of sociedades(); track s.id) {
                <button type="button" class="pill" [class.on]="fpl.empresas.includes(s.empresaId)"
                        [title]="s.nombre" (click)="toggleEmpresa(s.empresaId)">
                  <span class="marca">{{ fpl.empresas.includes(s.empresaId) ? '✓' : '+' }}</span>{{ s.empresaId }}
                </button>
              } @empty { <span class="sutil">Esta organización no tiene sociedades registradas.</span> }
            </div>
          </div>

          <div class="campo">
            <div class="lista-head">
              <label>Objetos incluidos <span class="sutil">· {{ fpl.objetos.length }} de {{ politicas().length }}</span></label>
              <span>
                <button type="button" class="enlace" (click)="seleccionarTodos()">Todos</button>
                <button type="button" class="enlace" (click)="seleccionarNinguno()">Ninguno</button>
              </span>
            </div>
            <div class="pills">
              @for (p of politicas(); track p.id) {
                <button type="button" class="pill" [class.on]="fpl.objetos.includes(p.objeto)"
                        [title]="nombreDominio(p.dominio) + ' · ' + etiquetaEstrategia(p.estrategia)"
                        (click)="toggleObjeto(p.objeto)">
                  <span class="marca">{{ fpl.objetos.includes(p.objeto) ? '✓' : '+' }}</span>{{ p.objeto }}
                </button>
              } @empty { <span class="sutil">Crea políticas primero.</span> }
            </div>
          </div>

          <label class="check"><input type="checkbox" name="encadena" [(ngModel)]="fpl.encadenaTransformacion" /> Encadena transformación (Bronze → Gold en la misma corrida)</label>
          <label class="check"><input type="checkbox" name="activoPl" [(ngModel)]="fpl.activo" /> Activo</label>

          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="planAbierto.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }

  `,
  styles: [`
    .fila-acciones { display:inline-flex; gap:8px; justify-content:flex-end; }
    .contexto-org { margin:4px 0 0; font-size:13px; color:var(--muted); }
    .contexto-org code { font-size:12px; }
    .seccion-head { display:flex; align-items:flex-end; justify-content:space-between; margin: 8px 0 12px; }
    .seccion-head h3 { margin:0; font-size:16px; }
    .ayuda { margin:2px 0 0; font-size:12.5px; color:var(--muted); max-width:640px; }
    .sutil { font-size:11.5px; color:var(--faint); font-weight:400; }
    .chip { background:var(--brand-50,#eef4ee); color:var(--brand-700,#2f6b3f); border-radius:6px; padding:2px 8px; font-size:12px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .check { display:flex; align-items:center; gap:8px; font-size:13.5px; margin:8px 0; color:var(--muted); }
    .enlace { background:none; border:none; color:var(--brand-600,#2f6b3f); font-size:12.5px; cursor:pointer; padding:2px 6px; }
    .enlace:hover { text-decoration:underline; }
    .nota-estrategia { margin:6px 0 0; font-size:12px; color:var(--muted); background:var(--surface-2,#f6f8f6); border-left:3px solid var(--brand-300,#8fb89a); padding:7px 10px; border-radius:0 6px 6px 0; }
    .mini-form { display:flex; flex-direction:column; gap:6px; margin-top:8px; padding:10px; border:1px dashed var(--border); border-radius:8px; }
    .mini-acciones { display:flex; gap:8px; justify-content:flex-end; }
    /* chips clave natural */
    .chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; border:1px solid var(--border); border-radius:8px; padding:7px; }
    .tag { display:inline-flex; align-items:center; gap:6px; background:var(--brand-50,#eef4ee); color:var(--brand-700,#2f6b3f); border-radius:6px; padding:3px 8px; font-size:12.5px; font-family:var(--mono,monospace); }
    .tag button { background:none; border:none; color:inherit; cursor:pointer; font-size:14px; line-height:1; padding:0; }
    .chip-input { border:none; outline:none; flex:1; min-width:100px; padding:2px; background:transparent; }
    /* selector de objetos del plan (pills) */
    .lista-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .pills { display:flex; flex-wrap:wrap; gap:8px; }
    .pill {
      display:inline-flex; align-items:center; gap:6px;
      background:var(--surface,#fff); color:var(--muted); cursor:pointer;
      border:1px solid var(--border); border-radius:20px; padding:6px 13px;
      font-family:var(--mono,monospace); font-size:12.5px; font-weight:500; line-height:1;
      transition:all .12s ease;
    }
    .pill:hover { border-color:var(--brand-400,#6fa17d); }
    .pill .marca { font-family:inherit; font-weight:700; opacity:.55; }
    .pill.on { background:var(--brand-600,#2f6b3f); color:#fff; border-color:var(--brand-600,#2f6b3f); }
    .pill.on .marca { opacity:1; }
    /* campos por entidad */
    .grupo-tabla { margin:14px 0; }
    .grupo-head { font-size:12.5px; margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid var(--border); }
    .campo-fila { display:flex; align-items:flex-start; gap:10px; padding:8px; border-radius:8px; cursor:pointer; }
    .campo-fila:hover { background:var(--surface-2,#f6f8f6); }
    .campo-fila.on { background:var(--brand-50,#eef4ee); }
    .campo-fila input { margin-top:3px; }
    .campo-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .campo-nombre { display:flex; align-items:center; gap:6px; font-size:13px; }
    .campo-desc { font-size:12px; color:var(--muted); }
    .campo-map { font-size:12px; color:var(--faint); }
    .badge { font-size:10px; text-transform:uppercase; letter-spacing:.03em; border-radius:4px; padding:1px 5px; font-weight:600; }
    .badge.udf { background:#eef1f6; color:#4b5a76; }
    .badge.sug { background:var(--amber-100,#fdf0d5); color:var(--amber-700,#8a5a00); }
  `],
})
export class IngestaComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly orgs = inject(OrganizacionService);

  readonly ESTRATEGIAS = ESTRATEGIAS;

  readonly politicas = signal<PoliticaIngesta[]>([]);
  readonly planes = signal<PlanIngesta[]>([]);
  readonly sociedades = signal<Sociedad[]>([]);
  readonly dominios = signal<Dominio[]>([]);
  readonly politicaAbierta = signal(false);
  readonly planAbierto = signal(false);
  readonly politicaEdicionId = signal<number | null>(null);
  readonly planEdicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  // Clave natural como chips
  readonly clavesNaturales = signal<string[]>([]);
  nuevaClave = '';

  // Alta inline de dominio
  readonly agregandoDominio = signal(false);
  nuevoDom = { clave: '', nombre: '' };

  fp: FormPolitica = this.politicaVacia();
  fpl: FormPlan = this.planVacio();

  // Método (no computed): fp es un objeto plano, así que debe re-evaluarse en cada cambio de tipo.
  estrategiasDisponibles(): Estrategia[] {
    return (Object.keys(ESTRATEGIAS) as Estrategia[]).filter((e) => ESTRATEGIAS[e].tipo === this.fp.tipoObjeto);
  }

  constructor() {
    // Recarga al cambiar de organización en la barra superior: lo que se ve en esta
    // pantalla es siempre la configuración de un solo tenant.
    effect(() => {
      const organizacionId = this.orgs.activaId();
      if (organizacionId === null) {
        this.politicas.set([]);
        this.planes.set([]);
        this.sociedades.set([]);
        return;
      }
      this.cargar();
    });
  }

  cargar(): void {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null) return;

    this.api.get<PoliticaIngesta[]>('/ingesta/politicas', { organizacionId }).subscribe({
      next: (d) => this.politicas.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las políticas', e.message),
    });
    this.api.get<PlanIngesta[]>('/ingesta/planes', { organizacionId }).subscribe({
      next: (d) => this.planes.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los planes', e.message),
    });
    this.api.get<Sociedad[]>('/sociedades', { organizacionId }).subscribe({
      next: (d) => this.sociedades.set(d),
      error: () => {},
    });
    this.api.get<Dominio[]>('/ingesta/dominios').subscribe({
      next: (d) => this.dominios.set(d),
      error: () => {},
    });
  }

  nombreDominio(clave: string): string {
    return this.dominios().find((d) => d.clave === clave)?.nombre ?? clave;
  }
  etiquetaEstrategia(e: Estrategia): string {
    return ESTRATEGIAS[e].etiqueta;
  }
  ayudaEstrategia(e: Estrategia): string {
    return ESTRATEGIAS[e].ayuda;
  }


  private politicaVacia(): FormPolitica {
    return {
      objeto: '', nombreNegocio: '', dominio: this.dominios()[0]?.clave ?? 'ventas', tipoObjeto: 'hecho',
      estrategia: 'incremental_ventana', fuenteObjeto: '', campoFecha: '', lookbackValor: 12,
      lookbackUnidad: 'meses', columnasVersionado: '', modelosDbt: '', owner: '', activo: true,
    };
  }

  private planVacio(): FormPlan {
    return { nombre: '', descripcion: '', cron: '0 5 * * *', empresas: [], objetos: [], encadenaTransformacion: true, activo: true };
  }

  onTipoChange(): void {
    this.fp.estrategia = this.estrategiasDisponibles()[0];
  }

  // --- Clave natural (chips) ---
  agregarClave(): void {
    const v = this.nuevaClave.trim();
    if (v && !this.clavesNaturales().includes(v)) this.clavesNaturales.update((a) => [...a, v]);
    this.nuevaClave = '';
  }
  quitarClave(c: string): void {
    this.clavesNaturales.update((a) => a.filter((x) => x !== c));
  }

  // --- Dominio inline ---
  cancelarDominio(): void {
    this.agregandoDominio.set(false);
    this.nuevoDom = { clave: '', nombre: '' };
  }
  crearDominio(): void {
    const cuerpo = { clave: this.nuevoDom.clave.trim(), nombre: this.nuevoDom.nombre.trim() };
    if (!cuerpo.clave || !cuerpo.nombre) return;
    this.api.post<Dominio>('/ingesta/dominios', cuerpo).subscribe({
      next: (d) => {
        this.dominios.update((a) => [...a, d].sort((x, y) => x.clave.localeCompare(y.clave)));
        this.fp.dominio = d.clave;
        this.cancelarDominio();
        this.toast.exito('Dominio creado', d.nombre);
      },
      error: (e: Error) => this.toast.error('No se pudo crear el dominio', e.message),
    });
  }

  // --- Políticas ---
  nuevaPolitica(): void {
    this.fp = this.politicaVacia();
    this.clavesNaturales.set([]);
    this.politicaEdicionId.set(null);
    this.agregandoDominio.set(false);
    this.errorForm.set(null);
    this.politicaAbierta.set(true);
  }

  editarPolitica(p: PoliticaIngesta): void {
    this.fp = {
      objeto: p.objeto, nombreNegocio: p.nombreNegocio, dominio: p.dominio, tipoObjeto: p.tipoObjeto,
      estrategia: p.estrategia, fuenteObjeto: p.fuenteObjeto, campoFecha: p.campoFecha ?? '',
      lookbackValor: p.lookbackValor, lookbackUnidad: p.lookbackUnidad ?? 'meses',
      columnasVersionado: p.columnasVersionado.join(', '), modelosDbt: p.modelosDbt ?? '',
      owner: p.owner, activo: p.activo,
    };
    this.clavesNaturales.set(p.claveNatural ? p.claveNatural.split(',').map((s) => s.trim()).filter(Boolean) : []);
    this.politicaEdicionId.set(p.id);
    this.agregandoDominio.set(false);
    this.errorForm.set(null);
    this.politicaAbierta.set(true);
  }

  private cuerpoPolitica(): Record<string, unknown> {
    const esVentana = this.fp.estrategia === 'incremental_ventana';
    const esVersionado = this.fp.estrategia === 'versionado';
    return {
      nombreNegocio: this.fp.nombreNegocio,
      dominio: this.fp.dominio,
      tipoObjeto: this.fp.tipoObjeto,
      estrategia: this.fp.estrategia,
      fuenteObjeto: this.fp.fuenteObjeto,
      campoFecha: esVentana ? this.fp.campoFecha || undefined : undefined,
      lookbackValor: esVentana ? this.fp.lookbackValor ?? undefined : undefined,
      lookbackUnidad: esVentana ? this.fp.lookbackUnidad : undefined,
      claveNatural: this.clavesNaturales().join(','),
      columnasVersionado: esVersionado ? this.separar(this.fp.columnasVersionado) : [],
      modelosDbt: this.fp.modelosDbt.trim() || null,
      owner: this.fp.owner,
      activo: this.fp.activo,
    };
  }

  guardarPolitica(): void {
    this.agregarClave(); // absorbe texto pendiente en el input de chips
    if (!this.clavesNaturales().length) {
      this.errorForm.set('Indica al menos una columna de clave natural');
      return;
    }
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.politicaEdicionId();
    // La organización solo se manda al crear: una política no se reasigna de tenant.
    const cuerpo = {
      ...this.cuerpoPolitica(),
      ...(id ? {} : { objeto: this.fp.objeto, organizacionId: this.orgs.exigirId() }),
    };
    const accion = id
      ? this.api.put<PoliticaIngesta>(`/ingesta/politicas/${id}`, cuerpo)
      : this.api.post<PoliticaIngesta>('/ingesta/politicas', cuerpo);
    accion.subscribe({
      next: (p) => {
        this.toast.exito(id ? 'Política actualizada' : 'Política creada', p.objeto);
        this.guardando.set(false);
        this.politicaAbierta.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  // --- Planes ---
  nuevoPlan(): void {
    this.fpl = this.planVacio();
    this.planEdicionId.set(null);
    this.errorForm.set(null);
    this.planAbierto.set(true);
  }

  editarPlan(pl: PlanIngesta): void {
    this.fpl = {
      nombre: pl.nombre, descripcion: pl.descripcion ?? '', cron: pl.cron,
      empresas: [...pl.empresas], objetos: [...pl.objetos],
      encadenaTransformacion: pl.encadenaTransformacion, activo: pl.activo,
    };
    this.planEdicionId.set(pl.id);
    this.errorForm.set(null);
    this.planAbierto.set(true);
  }

  toggleObjeto(objeto: string): void {
    this.fpl.objetos = this.fpl.objetos.includes(objeto)
      ? this.fpl.objetos.filter((o) => o !== objeto)
      : [...this.fpl.objetos, objeto];
  }
  toggleEmpresa(empresaId: string): void {
    this.fpl.empresas = this.fpl.empresas.includes(empresaId)
      ? this.fpl.empresas.filter((e) => e !== empresaId)
      : [...this.fpl.empresas, empresaId];
  }
  seleccionarTodos(): void {
    this.fpl.objetos = this.politicas().map((p) => p.objeto);
  }
  seleccionarNinguno(): void {
    this.fpl.objetos = [];
  }

  guardarPlan(): void {
    if (!this.fpl.empresas.length) {
      this.errorForm.set('Selecciona al menos una sociedad');
      return;
    }
    if (!this.fpl.objetos.length) {
      this.errorForm.set('Selecciona al menos un objeto');
      return;
    }
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.planEdicionId();
    const cuerpo = {
      descripcion: this.fpl.descripcion || undefined,
      cron: this.fpl.cron,
      empresas: this.fpl.empresas,
      objetos: this.fpl.objetos,
      encadenaTransformacion: this.fpl.encadenaTransformacion,
      activo: this.fpl.activo,
      ...(id ? {} : { nombre: this.fpl.nombre, organizacionId: this.orgs.exigirId() }),
    };
    const accion = id
      ? this.api.put<PlanIngesta>(`/ingesta/planes/${id}`, cuerpo)
      : this.api.post<PlanIngesta>('/ingesta/planes', cuerpo);
    accion.subscribe({
      next: (pl) => {
        this.toast.exito(id ? 'Plan actualizado' : 'Plan creado', pl.nombre);
        this.guardando.set(false);
        this.planAbierto.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  private separar(csv: string): string[] {
    return csv.split(',').map((s) => s.trim()).filter(Boolean);
  }
}
