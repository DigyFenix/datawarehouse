import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Conexion, EstadoPortalOrg, Organizacion, Sociedad } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';

interface FormOrg {
  codigo: string;
  nombre: string;
  sector: string;
  erpTipo: string;
  estado: string;
  colorMarca: string;
  moduloAsistente: boolean;
}

/** Lo que devuelve POST /organizaciones/:id/provisionar. */
interface ResultadoProvision {
  baseDatos: string;
  baseCreada: boolean;
  corte: string;
  ddlAplicado: string[];
  seedsAplicados: string[];
  advertencias: string[];
}

type EstadoPaso = 'hecho' | 'pendiente' | 'cargando';

/** Un paso del checklist de alta. `ruta` lleva a la pantalla donde se completa; `accion` lo resuelve aquí. */
interface PasoAlta {
  numero: number;
  titulo: string;
  detalle: string;
  estado: EstadoPaso;
  ruta: string | null;
  accion: 'provisionar' | null;
}

/** Etiquetas legibles de los valores que guarda el API (organizacion.dto.ts). */
const ETIQUETA_ESTADO: Record<string, string> = {
  en_arranque: 'En arranque',
  activa: 'Activa',
  inactiva: 'Inactiva',
};
const ETIQUETA_ERP: Record<string, string> = {
  sap_b1: 'SAP Business One',
  odoo: 'Odoo',
};
const BADGE_ESTADO: Record<string, string> = {
  en_arranque: 'badge--en_revision',
  activa: 'badge--ok',
  inactiva: 'badge--neutral',
};

/**
 * Organizaciones (tenants) del producto. Desde aquí se da de alta un cliente y se
 * sigue su puesta en marcha: el checklist deduce el estado de cada paso con lo que
 * el API ya expone (conexiones, sociedades, estado del portal) y lleva a la
 * pantalla donde se completa el siguiente.
 */
@Component({
  selector: 'app-organizaciones',
  standalone: true,
  imports: [FormsModule, RouterLink, DrawerComponent, PageHeaderComponent, EmptyComponent, IconComponent, SkeletonComponent],
  template: `
    <app-page-header eyebrow="Clientes" titulo="Organizaciones">
      <button acciones (click)="nuevo()">+ Nueva organización</button>
    </app-page-header>

    <div class="tarjeta tarjeta--tabla">
      @if (orgs.organizaciones().length > 0) {
        <div class="barra-lista">
          <input type="search" class="buscador" placeholder="Buscar por nombre o código…"
                 [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" name="filtro" aria-label="Buscar organización" />
          <span class="sutil">{{ filtradas().length }} de {{ orgs.organizaciones().length }}</span>
        </div>
      }
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead>
            <tr><th scope="col">Organización</th><th scope="col">ERP</th><th scope="col">Estado</th><th scope="col">Asistente</th><th scope="col">Acciones</th></tr>
          </thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
            } @else {
              @for (o of filtradas(); track o.id) {
                <tr [class.fila--activa]="o.id === orgs.activaId()">
                  <td data-label="Organización">
                    <strong>{{ o.nombre }}</strong>
                    @if (o.id === orgs.activaId()) { <span class="chip chip--admin">en edición</span> }
                    <br /><span class="sutil">{{ o.codigo }}@if (o.sector) { · {{ o.sector }} }</span>
                  </td>
                  <td data-label="ERP">{{ etiquetaErp(o.erpTipo) }}</td>
                  <td data-label="Estado"><span [class]="'badge ' + claseEstado(o.estado)">{{ etiquetaEstado(o.estado) }}</span></td>
                  <td data-label="Asistente">@if (o.moduloAsistente) { <span class="ok">Contratado</span> } @else { <span class="sutil">No incluido</span> }</td>
                  <td data-label="Acciones" class="col-acciones">
                    <details class="menu-acciones">
                      <summary [attr.aria-label]="'Acciones para ' + o.nombre"><app-icon name="menu" [size]="16"></app-icon></summary>
                      <div class="menu-acciones__lista">
                        <button type="button" (click)="abrirAlta(o); cerrarMenu($event)"><app-icon name="info" [size]="15"></app-icon> Puesta en marcha</button>
                        @if (provisionDisponible()) {
                          <button type="button" (click)="abrirProvision(o); cerrarMenu($event)"><app-icon name="actualizar" [size]="15"></app-icon> Provisionar</button>
                        }
                        @if (o.id !== orgs.activaId()) {
                          <button type="button" (click)="orgs.seleccionar(o.id); cerrarMenu($event)"><app-icon name="tablero" [size]="15"></app-icon> Trabajar con esta</button>
                        }
                        <button type="button" (click)="editar(o); cerrarMenu($event)"><app-icon name="editar" [size]="15"></app-icon> Editar</button>
                      </div>
                    </details>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5">
                  @if (orgs.organizaciones().length === 0) {
                    <app-empty titulo="Todavía no hay organizaciones">Cada cliente es una organización con su propio ERP y su propia base de datos. Crea la primera con «Nueva organización».</app-empty>
                  } @else {
                    <app-empty titulo="Ninguna organización coincide">No hay resultados para «{{ filtro() }}». Prueba con otro nombre o código.</app-empty>
                  }
                </td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar organización' : 'Nueva organización'"
                  [eyebrow]="edicionId() ? form.nombre : 'Cliente nuevo'" (cerrar)="cerrar()">
        <form (ngSubmit)="guardar()">
          <div class="campo">
            <label for="org-nombre">Nombre</label>
            <input id="org-nombre" name="nombre" [(ngModel)]="form.nombre" (ngModelChange)="onNombre($event)" required placeholder="Grupo Cresta" autocomplete="off" />
          </div>
          <div class="campo">
            <label for="org-codigo">Código</label>
            <input id="org-codigo" name="codigo" [ngModel]="form.codigo" (ngModelChange)="onCodigo($event)" required
                   placeholder="grupocresta" [disabled]="!!edicionId()" autocomplete="off" spellcheck="false" />
            @if (!edicionId()) {
              <span class="sutil">Se genera a partir del nombre; puedes ajustarlo. Identifica al cliente en la base de datos y no se puede cambiar después.</span>
            } @else {
              <span class="sutil">El código identifica al cliente en la base de datos y no se puede cambiar.</span>
            }
          </div>
          <div class="campo"><label for="org-sector">Sector</label><input id="org-sector" name="sector" [(ngModel)]="form.sector" placeholder="Avícola, telecomunicaciones…" /></div>
          <div class="campo">
            <label for="org-erp">ERP de origen</label>
            <select id="org-erp" name="erpTipo" [(ngModel)]="form.erpTipo">
              <option value="sap_b1">SAP Business One</option>
              <option value="odoo">Odoo</option>
            </select>
          </div>
          @if (edicionId()) {
            <div class="campo">
              <label for="org-estado">Estado</label>
              <select id="org-estado" name="estado" [(ngModel)]="form.estado">
                <option value="en_arranque">En arranque</option>
                <option value="activa">Activa</option>
                <option value="inactiva">Inactiva</option>
              </select>
            </div>
          }
          <div class="campo">
            <label for="org-color">Color de marca</label>
            <div class="color-fila">
              <input id="org-color" type="color" name="colorMarca" [ngModel]="form.colorMarca || '#2d5aa0'" (ngModelChange)="form.colorMarca = $event" class="color-sel" />
              <input name="colorMarcaHex" [(ngModel)]="form.colorMarca" placeholder="#2d5aa0" class="color-hex" aria-label="Color en formato hexadecimal" />
              <button type="button" class="secundario pequeno" (click)="form.colorMarca = ''">Usar el color por defecto</button>
            </div>
            <span class="sutil">Tiñe los botones y acentos del portal de este cliente.</span>
          </div>
          <label class="check">
            <input type="checkbox" name="moduloAsistente" [(ngModel)]="form.moduloAsistente" />
            <span>Módulo Asistente (IA) <span class="sutil">· se contrata aparte; apagado no aparece en el portal del cliente</span></span>
          </label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
            <button type="submit" [disabled]="guardando()" [attr.aria-busy]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : (edicionId() ? 'Guardar cambios' : 'Crear organización') }}
            </button>
          </div>
        </form>
      </app-drawer>
    }

    @if (orgAlta(); as org) {
      <app-drawer titulo="Puesta en marcha" [eyebrow]="org.nombre" (cerrar)="orgAlta.set(null)">
        <p class="ayuda">
          Pasos para dejar a <strong>{{ org.nombre }}</strong> lista para cargar datos y entregar
          su portal. Se completan en orden; el siguiente aparece resaltado.
        </p>
        <ol class="pasos">
          @for (p of pasos(); track p.numero) {
            <li class="paso" [class.paso--hecho]="p.estado === 'hecho'" [class.paso--siguiente]="p.numero === siguientePaso()">
              <span class="paso__num" aria-hidden="true">
                @if (p.estado === 'hecho') { ✓ } @else { {{ p.numero }} }
              </span>
              <div class="paso__cuerpo">
                <strong>{{ p.titulo }}</strong>
                <span class="paso__detalle">
                  @if (p.estado === 'cargando') { Comprobando… } @else { {{ p.detalle }} }
                </span>
              </div>
              <div class="paso__accion">
                @if (p.estado === 'pendiente' && p.ruta) {
                  <a class="btn secundario pequeno" [routerLink]="p.ruta" (click)="orgAlta.set(null)">Ir</a>
                }
                @if (p.estado === 'pendiente' && p.accion === 'provisionar') {
                  @if (provisionDisponible()) {
                    <button type="button" class="secundario pequeno" (click)="abrirProvision(org)">Provisionar</button>
                  } @else {
                    <span class="sutil">No disponible en este servidor</span>
                  }
                }
                @if (p.estado === 'hecho' && p.ruta) {
                  <a class="enlace-sutil" [routerLink]="p.ruta" (click)="orgAlta.set(null)">Ver</a>
                }
              </div>
            </li>
          }
        </ol>
        @if (todoListo()) {
          <p class="listo">Todo en orden: el cliente ya puede entrar a su portal.</p>
        }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="cargarPasos(org)" [disabled]="pasosCargando()">
            @if (pasosCargando()) { <span class="spinner"></span> }
            {{ pasosCargando() ? 'Comprobando…' : 'Volver a comprobar' }}
          </button>
          <button type="button" (click)="orgAlta.set(null)">Cerrar</button>
        </div>
      </app-drawer>
    }

    @if (orgProvision(); as org) {
      <app-drawer titulo="Provisionar" [eyebrow]="org.nombre" (cerrar)="cerrarProvision()">
        <p class="ayuda">
          Crea la base de datos de <strong>{{ org.nombre }}</strong> y carga el paquete base de
          <strong>{{ etiquetaErp(org.erpTipo) }}</strong> (qué objetos se traen del ERP y cómo).
          Si ya se hizo antes, solo completa lo que falte: no duplica nada.
        </p>

        @if (org.erpTipo === 'odoo') {
          <div class="campo">
            <label for="prov-company">Compañía en Odoo</label>
            <input id="prov-company" type="number" min="1" [(ngModel)]="companyId" name="companyId"
                   placeholder="1" [ngModelOptions]="{ standalone: true }" />
            <span class="sutil">El número con que Odoo identifica a la empresa. Todo lo que se extraiga se limita a esa compañía.</span>
          </div>
        }

        <div class="campo">
          <label for="prov-corte">Traer datos desde</label>
          <input id="prov-corte" type="date" [(ngModel)]="corte" name="corte" [ngModelOptions]="{ standalone: true }" />
          <span class="sutil">
            Fecha desde la que se cargan ventas, compras, pagos y pedidos. Por defecto, el 1 de enero
            del año en curso.
          </span>
        </div>

        @if (errorProvision()) { <p class="error">{{ errorProvision() }}</p> }

        @if (resultado(); as r) {
          <div class="resultado">
            <h4>Resultado</h4>
            <ul>
              <li><strong>Base de datos del cliente:</strong> {{ r.baseCreada ? 'creada' : 'ya existía, se reutilizó' }}</li>
              <li><strong>Estructura del plano de datos:</strong> {{ r.ddlAplicado.length ? 'lista' : 'sin cambios' }}</li>
              <li><strong>Paquete base de {{ etiquetaErp(org.erpTipo) }}:</strong> {{ r.seedsAplicados.length ? 'cargado' : 'sin cambios' }}</li>
              <li><strong>Datos desde:</strong> {{ r.corte }}</li>
            </ul>
            @if (r.advertencias.length) {
              <div class="avisos">
                <strong>Avisos</strong>
                @for (a of r.advertencias; track a) { <p>{{ a }}</p> }
              </div>
            }
          </div>
        }

        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="cerrarProvision()">Cerrar</button>
          <button type="button" [disabled]="provisionando() !== null" [attr.aria-busy]="provisionando() !== null" (click)="provisionar(org)">
            @if (provisionando() !== null) { <span class="spinner"></span> }
            {{ provisionando() !== null ? 'Provisionando…' : (resultado() ? 'Repetir' : 'Provisionar') }}
          </button>
        </div>
      </app-drawer>
    }
  `,
  styles: [`
    .barra-lista { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .buscador { max-width: 360px; }
    .fila--activa td { background: color-mix(in srgb, var(--brand-100) 45%, var(--surface)); }
    .fila--activa .chip { margin-left: 6px; }
    .color-fila { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .color-sel { width: 46px; height: 38px; padding: 3px; cursor: pointer; }
    .color-hex { max-width: 130px; }
    .check > span { line-height: 1.4; }

    .pasos { list-style: none; margin: 0 0 var(--sp-4); padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .paso {
      display: flex; align-items: center; gap: 12px; padding: 10px 12px;
      border: 1px solid var(--border); border-radius: var(--r); background: var(--surface);
    }
    .paso--siguiente { border-color: var(--brand-500); background: color-mix(in srgb, var(--brand-100) 35%, var(--surface)); }
    .paso--hecho { opacity: .85; }
    .paso__num {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      display: grid; place-items: center; font-size: var(--fs-sm); font-weight: 600;
      background: var(--surface-2); color: var(--muted);
    }
    .paso--siguiente .paso__num { background: var(--brand-600); color: #fff; }
    .paso--hecho .paso__num { background: var(--ok-bg); color: var(--ok); }
    .paso__cuerpo { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; }
    .paso__cuerpo strong { font-weight: 600; font-size: var(--fs-base); }
    .paso__detalle { font-size: var(--fs-xs); color: var(--muted); }
    .paso__accion { flex-shrink: 0; }
    .enlace-sutil { font-size: var(--fs-sm); color: var(--muted); }
    .listo { padding: 10px 12px; border-radius: var(--r-sm); background: var(--ok-bg); color: var(--ok); font-size: var(--fs-sm); font-weight: 500; }

    .resultado { margin-top: var(--sp-4); padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2); }
    .resultado h4 { margin-bottom: 8px; }
    .resultado ul { margin: 0; padding-left: 18px; font-size: var(--fs-sm); line-height: 1.7; }
    .avisos { margin-top: 10px; padding: 8px 12px; border-radius: var(--r-sm); background: var(--warn-bg); color: var(--warn); font-size: var(--fs-xs); }
    .avisos p { margin-top: 4px; }
  `],
})
export class OrganizacionesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly tema = inject(ThemeService);
  private readonly confirm = inject(ConfirmService);
  readonly orgs = inject(OrganizacionService);

  readonly cargando = signal(true);
  readonly filtro = signal('');
  readonly filtradas = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    const lista = this.orgs.organizaciones();
    if (!q) return lista;
    return lista.filter((o) => o.nombre.toLowerCase().includes(q) || o.codigo.toLowerCase().includes(q));
  });

  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);
  /** El código deja de seguir al nombre en cuanto el usuario lo toca a mano. */
  private codigoManual = false;

  // Puesta en marcha (checklist de alta).
  readonly orgAlta = signal<Organizacion | null>(null);
  readonly pasos = signal<PasoAlta[]>([]);
  readonly pasosCargando = signal(false);
  readonly siguientePaso = computed(() => this.pasos().find((p) => p.estado === 'pendiente')?.numero ?? null);
  readonly todoListo = computed(() => this.pasos().length > 0 && this.pasos().every((p) => p.estado === 'hecho'));

  // Provisionamiento: sustituye los pasos manuales de consola del onboarding.
  readonly provisionDisponible = signal(false);
  readonly orgProvision = signal<Organizacion | null>(null);
  readonly provisionando = signal<number | null>(null);
  readonly errorProvision = signal<string | null>(null);
  readonly resultado = signal<ResultadoProvision | null>(null);
  companyId: number | null = null;
  corte = '';

  form: FormOrg = this.vacio();

  ngOnInit(): void {
    this.cargar();
    // Sin el metadata-store montado en el API no hay paquete que cargar:
    // el botón no se ofrece en vez de fallar a medio camino.
    this.api
      .get<{ disponible: boolean }>('/organizaciones/provisionar/disponible')
      .subscribe({
        next: (d) => this.provisionDisponible.set(d.disponible),
        error: () => this.provisionDisponible.set(false),
      });
  }

  etiquetaEstado(estado: string): string {
    return ETIQUETA_ESTADO[estado] ?? estado;
  }

  etiquetaErp(erp: string): string {
    return ETIQUETA_ERP[erp] ?? erp;
  }

  claseEstado(estado: string): string {
    return BADGE_ESTADO[estado] ?? 'badge--neutral';
  }

  cerrarMenu(evento: Event): void {
    (evento.currentTarget as HTMLElement)?.closest('details')?.removeAttribute('open');
  }

  /** Convierte el nombre en un código válido: minúsculas, sin tildes, sin espacios ni símbolos. */
  slug(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 40);
  }

  onNombre(nombre: string): void {
    if (!this.edicionId() && !this.codigoManual) this.form.codigo = this.slug(nombre);
  }

  onCodigo(codigo: string): void {
    const limpio = this.slug(codigo);
    this.codigoManual = limpio.length > 0;
    this.form.codigo = limpio;
  }

  // ---------- Puesta en marcha ----------

  abrirAlta(o: Organizacion): void {
    this.orgAlta.set(o);
    this.cargarPasos(o);
  }

  cargarPasos(o: Organizacion): void {
    this.pasosCargando.set(true);
    this.pasos.set([
      this.paso(1, 'Conexión al ERP', 'cargando', '', '/conexiones', null),
      this.paso(2, 'Sociedades', 'cargando', '', '/sociedades', null),
      this.paso(3, 'Provisionar', 'cargando', '', null, 'provisionar'),
      this.paso(4, 'Administrador del portal y logo', 'cargando', '', '/portal-usuario', null),
      this.paso(5, 'Tableros', 'cargando', '', '/portal-usuario', null),
    ]);
    forkJoin({
      conexiones: this.api.get<Conexion[]>('/conexiones').pipe(catchError(() => of([] as Conexion[]))),
      sociedades: this.api.get<Sociedad[]>('/sociedades', { organizacionId: o.id }).pipe(catchError(() => of([] as Sociedad[]))),
      // Si la base del cliente todavía no existe, este GET falla: equivale a «sin provisionar».
      portal: this.api.get<EstadoPortalOrg>(`/organizaciones/${o.id}/portal/estado`).pipe(catchError(() => of(null))),
    }).subscribe(({ conexiones, sociedades, portal }) => {
      const propias = conexiones.filter((c) => c.organizacionId === o.id);
      const activas = propias.filter((c) => c.activo);
      const provisionada = portal?.esquemaAplicado ?? false;
      const admin = portal?.adminExiste ?? false;
      const tableros = portal?.tableros ?? 0;
      this.pasos.set([
        this.paso(1, 'Conexión al ERP', activas.length ? 'hecho' : 'pendiente',
          activas.length
            ? `${activas.length} ${activas.length === 1 ? 'conexión activa' : 'conexiones activas'}`
            : propias.length ? 'Hay conexiones, pero ninguna está activa' : 'Registra el servidor del ERP al que se conecta la carga de datos',
          '/conexiones', null),
        this.paso(2, 'Sociedades', sociedades.length ? 'hecho' : 'pendiente',
          sociedades.length
            ? `${sociedades.length} ${sociedades.length === 1 ? 'sociedad registrada' : 'sociedades registradas'}`
            : 'Registra las empresas del grupo y a qué conexión apunta cada una',
          '/sociedades', null),
        this.paso(3, 'Provisionar', provisionada ? 'hecho' : 'pendiente',
          provisionada
            ? 'La base de datos del cliente está creada y con el paquete base cargado'
            : 'Crea la base de datos del cliente y carga el paquete base del ERP',
          null, 'provisionar'),
        this.paso(4, 'Administrador del portal y logo', admin ? 'hecho' : 'pendiente',
          admin
            ? (o.logoMime ? 'Administrador creado y logo cargado' : 'Administrador creado · aún sin logo')
            : provisionada ? 'Crea el primer usuario administrador del portal del cliente y sube su logo' : 'Disponible después de provisionar',
          '/portal-usuario', null),
        this.paso(5, 'Tableros', tableros > 0 ? 'hecho' : 'pendiente',
          tableros > 0
            ? `${tableros} ${tableros === 1 ? 'tablero publicado' : 'tableros publicados'}`
            : provisionada ? 'Publica los tableros de Power BI que verá el cliente' : 'Disponible después de provisionar',
          '/portal-usuario', null),
      ]);
      this.pasosCargando.set(false);
    });
  }

  private paso(
    numero: number, titulo: string, estado: EstadoPaso, detalle: string,
    ruta: string | null, accion: 'provisionar' | null,
  ): PasoAlta {
    return { numero, titulo, estado, detalle, ruta, accion };
  }

  // ---------- Provisionar ----------

  abrirProvision(o: Organizacion): void {
    this.orgProvision.set(o);
    this.errorProvision.set(null);
    this.resultado.set(null);
    this.companyId = null;
    this.corte = `${new Date().getFullYear()}-01-01`;
  }

  cerrarProvision(): void {
    this.orgProvision.set(null);
    const alta = this.orgAlta();
    if (alta) this.cargarPasos(alta);
  }

  provisionar(o: Organizacion): void {
    this.errorProvision.set(null);
    this.provisionando.set(o.id);
    const cuerpo = {
      ...(o.erpTipo === 'odoo' && this.companyId ? { companyId: this.companyId } : {}),
      ...(this.corte ? { corte: this.corte } : {}),
    };
    this.api.post<ResultadoProvision>(`/organizaciones/${o.id}/provisionar`, cuerpo).subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.provisionando.set(null);
        if (r.advertencias.length) {
          this.toast.info(`${o.nombre} provisionada con avisos`, 'Revisa los avisos antes de seguir con el administrador del portal.');
        } else {
          this.toast.exito(`${o.nombre} está provisionada`, 'Siguiente: crea el administrador del portal del cliente.');
        }
      },
      error: (e: Error) => {
        this.errorProvision.set(e.message);
        this.provisionando.set(null);
      },
    });
  }

  // ---------- Alta y edición ----------

  private vacio(): FormOrg {
    return { codigo: '', nombre: '', sector: '', erpTipo: 'sap_b1', estado: 'en_arranque', colorMarca: '', moduloAsistente: false };
  }

  cargar(): void {
    this.orgs.cargar().subscribe({
      next: () => this.cargando.set(false),
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudieron cargar las organizaciones', e.message);
      },
    });
  }

  nuevo(): void {
    this.form = this.vacio();
    this.codigoManual = false;
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(o: Organizacion): void {
    this.form = { codigo: o.codigo, nombre: o.nombre, sector: o.sector ?? '', erpTipo: o.erpTipo, estado: o.estado, colorMarca: o.colorMarca ?? '', moduloAsistente: o.moduloAsistente };
    this.edicionId.set(o.id);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  async guardar(): Promise<void> {
    // El Asistente se contrata aparte y consume la API de IA: encenderlo nunca debe ser un clic accidental.
    const id = this.edicionId();
    const antes = id ? this.orgs.organizaciones().find((o) => o.id === id)?.moduloAsistente ?? false : false;
    if (this.form.moduloAsistente && !antes) {
      const ok = await this.confirm.confirmar({
        titulo: 'Activar el módulo Asistente',
        mensaje: `El Asistente (IA) se contrata aparte y genera costo por uso. ¿Activarlo para ${this.form.nombre || 'esta organización'}?`,
        textoConfirmar: 'Activar',
      });
      if (!ok) return;
    }
    if (!id && !this.form.codigo) {
      this.errorForm.set('El código no puede quedar vacío: escribe un nombre o ajusta el código a mano.');
      return;
    }
    this.errorForm.set(null);
    this.guardando.set(true);
    const cuerpo = {
      nombre: this.form.nombre,
      sector: this.form.sector || undefined,
      erpTipo: this.form.erpTipo,
      colorMarca: this.form.colorMarca || null,
      moduloAsistente: this.form.moduloAsistente,
      ...(id ? { estado: this.form.estado } : { codigo: this.form.codigo }),
    };
    const accion = id
      ? this.api.put<Organizacion>(`/organizaciones/${id}`, cuerpo)
      : this.api.post<Organizacion>('/organizaciones', cuerpo);
    accion.subscribe({
      next: (o) => {
        this.guardando.set(false);
        this.abierto.set(false);
        this.orgs.cargar().subscribe({
          next: () => {
            if (id) {
              this.toast.exito('Organización actualizada', o.nombre);
              if (this.orgs.activaId() === o.id) this.tema.aplicar(o.colorMarca ?? null);
              return;
            }
            // Recién creada: pasa a ser la organización en edición y arranca su puesta en marcha.
            this.orgs.seleccionar(o.id);
            this.toast.exito('Organización creada', `${o.nombre} ya es la organización en edición. Siguiente: registra la conexión al ERP.`);
            this.abrirAlta(o);
          },
          error: () => {
            this.toast.exito(id ? 'Organización actualizada' : 'Organización creada', o.nombre);
          },
        });
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }
}
