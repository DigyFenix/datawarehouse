import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Conexion, NitAfiliado, Sociedad } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';

interface FormSociedad {
  empresaId: string;
  nombre: string;
  nit: string;
  moneda: string;
  monedaPresentacion: string;
  conexionId: number | null;
  esquemaOrigen: string;
  activo: boolean;
  orden: number;
}

/**
 * Sociedades (empresas) de la organización en edición y la lista de NITs de
 * compañías afiliadas con la que se detectan las operaciones entre empresas del grupo.
 */
@Component({
  selector: 'app-sociedades',
  standalone: true,
  imports: [FormsModule, DrawerComponent, PageHeaderComponent, EmptyComponent, IconComponent, SkeletonComponent],
  template: `
    <app-page-header eyebrow="Datos de origen" titulo="Sociedades">
      <button acciones (click)="nuevo()" [disabled]="orgs.activaId() === null">+ Nueva sociedad</button>
    </app-page-header>
    <p class="ayuda">
      Empresas de <strong>{{ orgs.activa()?.nombre ?? 'la organización' }}</strong>. Cada una apunta a la
      conexión de la que se cargan sus datos. Si varias empresas viven en el mismo servidor, comparten la conexión.
    </p>

    <div class="tarjeta tarjeta--tabla">
      @if (sociedades().length > 5) {
        <div class="barra-lista">
          <input type="search" class="buscador" placeholder="Buscar por nombre o código…"
                 [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" name="filtro" aria-label="Buscar sociedad" />
          <span class="sutil">{{ filtradas().length }} de {{ sociedades().length }}</span>
        </div>
      }
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th scope="col">Sociedad</th><th scope="col">Código</th><th scope="col">Moneda</th><th scope="col">Conexión</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
            } @else {
              @for (s of filtradas(); track s.id) {
                <tr>
                  <td data-label="Sociedad"><strong>{{ s.nombre }}</strong>@if (s.nit) { <br /><span class="sutil">NIT {{ s.nit }}</span> }</td>
                  <td data-label="Código"><code>{{ s.empresaId }}</code></td>
                  <td data-label="Moneda">
                    @if (s.moneda) {
                      {{ s.moneda }}@if (s.monedaPresentacion && s.monedaPresentacion !== s.moneda) { <span class="sutil"> · se presenta en {{ s.monedaPresentacion }}</span> }
                    } @else { <span class="sutil">—</span> }
                  </td>
                  <td data-label="Conexión">
                    @if (s.conexionId === null) { <span class="badge badge--en_revision">Sin conexión</span> }
                    @else { {{ nombreConexion(s.conexionId) }}@if (s.esquemaOrigen) { <br /><span class="sutil">{{ s.esquemaOrigen }}</span> } }
                  </td>
                  <td data-label="Estado">
                    @if (s.activo) { <span class="badge badge--ok">Activa</span> } @else { <span class="badge badge--neutral">Inactiva</span> }
                  </td>
                  <td data-label="Acciones" class="col-acciones">
                    <details class="menu-acciones">
                      <summary [attr.aria-label]="'Acciones para ' + s.nombre"><app-icon name="menu" [size]="16"></app-icon></summary>
                      <div class="menu-acciones__lista">
                        <button type="button" (click)="editar(s); cerrarMenu($event)"><app-icon name="editar" [size]="15"></app-icon> Editar</button>
                        <button type="button" class="peligro" (click)="eliminar(s); cerrarMenu($event)"><app-icon name="papelera" [size]="15"></app-icon> Eliminar</button>
                      </div>
                    </details>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6">
                  @if (orgs.activaId() === null) {
                    <app-empty titulo="No hay organización en edición">Crea o elige una organización en «Organizaciones» para registrar sus sociedades.</app-empty>
                  } @else if (sociedades().length === 0) {
                    <app-empty titulo="Esta organización aún no tiene sociedades">Registra cada empresa del grupo de {{ orgs.activa()?.nombre }} con «Nueva sociedad».</app-empty>
                  } @else {
                    <app-empty titulo="Ninguna sociedad coincide">No hay resultados para «{{ filtro() }}».</app-empty>
                  }
                </td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (orgs.activaId() !== null) {
      <div class="seccion">
        <h3>Compañías afiliadas</h3>
        <p class="ayuda">
          Clientes y proveedores cuyo NIT esté en esta lista se tratan como <strong>operaciones entre empresas
          del grupo</strong> y se pueden separar en los tableros. No importa cómo esté escrito el NIT en el ERP
          (con guiones, espacios o prefijos): se compara por sus dígitos. Aplica a partir de la próxima carga de datos.
        </p>
      </div>

      <div class="tarjeta tarjeta--tabla">
        <div class="tabla-wrap tabla-responsive">
          <table>
            <thead><tr><th scope="col">NIT</th><th scope="col">Empresa</th><th scope="col">En uso</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              @for (n of nits(); track n.id) {
                <tr>
                  <td data-label="NIT"><code>{{ n.nit }}</code></td>
                  <td data-label="Empresa">@if (n.nombre) { {{ n.nombre }} } @else { <span class="sutil">—</span> }</td>
                  <td data-label="En uso">
                    <label class="check check--celda">
                      <input type="checkbox" [checked]="n.activo" (change)="alternarActivo(n)" [attr.aria-label]="'Usar el NIT ' + n.nit" />
                      <span class="sutil">{{ n.activo ? 'Sí' : 'No' }}</span>
                    </label>
                  </td>
                  <td data-label="Acciones" class="col-acciones">
                    <button type="button" class="secundario pequeno peligro" (click)="eliminarNit(n)">Eliminar</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4"><app-empty titulo="Sin compañías afiliadas">Mientras la lista esté vacía, ninguna venta o compra se marca como operación entre empresas del grupo.</app-empty></td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="lote">
          <label for="nits-nuevos">Agregar NITs <span class="sutil">· uno por línea, o separados por coma</span></label>
          <textarea id="nits-nuevos" name="nitsNuevos" rows="3" [(ngModel)]="nitsNuevos"
                    placeholder="1230263&#10;109967739"></textarea>
          <div class="acciones-fila">
            <button (click)="agregarNits()" [disabled]="agregando() || !nitsNuevos.trim()" [attr.aria-busy]="agregando()">
              @if (agregando()) { <span class="spinner"></span> }
              {{ agregando() ? 'Agregando…' : 'Agregar a la lista' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar sociedad' : 'Nueva sociedad'" [eyebrow]="orgs.activa()?.nombre ?? 'Sociedades'" (cerrar)="abierto.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo"><label for="soc-nombre">Nombre</label><input id="soc-nombre" name="nombre" [(ngModel)]="form.nombre" (ngModelChange)="onNombre($event)" required placeholder="Productos Avícolas, S.A." /></div>
          <div class="grid2">
            <div class="campo">
              <label for="soc-codigo">Código de la sociedad</label>
              <input id="soc-codigo" name="empresaId" [ngModel]="form.empresaId" (ngModelChange)="onCodigo($event)" required placeholder="proavisa" [disabled]="!!edicionId()" autocomplete="off" spellcheck="false" />
              @if (!edicionId()) {
                <span class="sutil">Se propone a partir del nombre; puedes ajustarlo. Etiqueta cada dato de esta empresa y no se puede cambiar después.</span>
              } @else {
                <span class="sutil">Etiqueta cada dato de esta empresa; no se puede cambiar.</span>
              }
            </div>
            <div class="campo"><label for="soc-nit">NIT <span class="sutil">· opcional</span></label><input id="soc-nit" name="nit" [(ngModel)]="form.nit" /></div>
          </div>
          <div class="grid2">
            <div class="campo"><label for="soc-moneda">Moneda en la que opera</label><input id="soc-moneda" name="moneda" [(ngModel)]="form.moneda" maxlength="3" placeholder="GTQ" class="corto" />
              <span class="sutil">Código de tres letras: GTQ, USD…</span>
            </div>
            <div class="campo"><label for="soc-monpres">Moneda de presentación <span class="sutil">· opcional</span></label><input id="soc-monpres" name="monedaPresentacion" [(ngModel)]="form.monedaPresentacion" maxlength="3" placeholder="= la de operación" class="corto" />
              <span class="sutil">Si es distinta, sus cifras se convierten con el tipo de cambio registrado en su propio ERP; sin tasa válida no entra en el consolidado.</span>
            </div>
          </div>
          <div class="grid2">
            <div class="campo"><label for="soc-cx">Conexión</label>
              <select id="soc-cx" name="conexionId" [(ngModel)]="form.conexionId">
                <option [ngValue]="null">Sin asignar</option>
                @for (c of conexionesPropias(); track c.id) { <option [ngValue]="c.id">{{ c.nombre }}{{ c.activo ? '' : ' (inactiva)' }}</option> }
              </select>
              @if (conexionesPropias().length === 0) {
                <span class="sutil">Aún no hay conexiones para esta organización: créala en «Conexiones al ERP».</span>
              }
            </div>
            <div class="campo"><label for="soc-esq">Ubicación en el ERP <span class="sutil">· opcional</span></label><input id="soc-esq" name="esquemaOrigen" [(ngModel)]="form.esquemaOrigen" placeholder="SBOPROAVISA_" />
              <span class="sutil">En SAP Business One, el nombre de la base de la compañía (p. ej. SBOPROAVISA_). En Odoo se deja vacío.</span>
            </div>
          </div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activa <span class="sutil">· si está inactiva, no se cargan sus datos</span></label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="abierto.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()" [attr.aria-busy]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : (edicionId() ? 'Guardar cambios' : 'Crear sociedad') }}
            </button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .barra-lista { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .buscador { max-width: 360px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .corto { max-width: 130px; text-transform: uppercase; }
    .campo label .sutil { font-weight: 400; }
    .check--celda { margin: 0; }
    .seccion { margin-top: var(--sp-6); }
    .seccion h3 { margin-bottom: 6px; }
    .lote { padding: 14px 16px; border-top: 1px solid var(--border); }
    .lote label { display: block; font-size: var(--fs-sm); font-weight: 500; margin-bottom: 6px; }
    .lote label .sutil { font-weight: 400; }
    .lote textarea { width: 100%; resize: vertical; }
  `],
})
export class SociedadesComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly orgs = inject(OrganizacionService);

  readonly sociedades = signal<Sociedad[]>([]);
  readonly conexiones = signal<Conexion[]>([]);
  /** Solo las conexiones de la organización en edición: una sociedad no apunta a otra organización. */
  readonly conexionesPropias = computed(() => this.conexiones().filter((c) => c.organizacionId === this.orgs.activaId()));
  readonly cargando = signal(true);
  readonly filtro = signal('');
  readonly filtradas = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    if (!q) return this.sociedades();
    return this.sociedades().filter((s) => s.nombre.toLowerCase().includes(q) || s.empresaId.toLowerCase().includes(q) || (s.nit ?? '').includes(q));
  });
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);
  readonly nits = signal<NitAfiliado[]>([]);
  readonly agregando = signal(false);
  private codigoManual = false;

  form: FormSociedad = this.vacio();
  nitsNuevos = '';

  constructor() {
    // Sigue a la organización en edición.
    effect(
      () => {
        this.orgs.activaId();
        this.filtro.set('');
        this.cargar();
      },
      { allowSignalWrites: true },
    );
  }

  private vacio(): FormSociedad {
    return { empresaId: '', nombre: '', nit: '', moneda: '', monedaPresentacion: '', conexionId: null, esquemaOrigen: '', activo: true, orden: 0 };
  }

  cargar(): void {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null) {
      this.sociedades.set([]);
      this.nits.set([]);
      this.cargando.set(false);
      return;
    }
    this.cargando.set(true);
    this.api.get<Sociedad[]>('/sociedades', { organizacionId }).subscribe({
      next: (d) => {
        this.sociedades.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudieron cargar las sociedades', e.message);
      },
    });
    this.api.get<Conexion[]>('/conexiones').subscribe({
      next: (d) => this.conexiones.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las conexiones', e.message),
    });
    this.api.get<NitAfiliado[]>('/nits-afiliados', { organizacionId }).subscribe({
      next: (d) => this.nits.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las compañías afiliadas', e.message),
    });
  }

  cerrarMenu(evento: Event): void {
    (evento.currentTarget as HTMLElement)?.closest('details')?.removeAttribute('open');
  }

  /** Código corto: minúsculas, sin tildes, solo letras, dígitos y guion bajo. */
  slug(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .slice(0, 30);
  }

  onNombre(nombre: string): void {
    if (this.edicionId() || this.codigoManual) return;
    // Se propone con la primera palabra significativa: «Productos Avícolas, S.A.» → «productos».
    const primera = nombre.split(/[\s,]+/).find((p) => this.slug(p).length > 2) ?? nombre;
    this.form.empresaId = this.slug(primera);
  }

  onCodigo(codigo: string): void {
    const limpio = this.slug(codigo);
    this.codigoManual = limpio.length > 0;
    this.form.empresaId = limpio;
  }

  agregarNits(): void {
    const lista = this.nitsNuevos
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (!lista.length) return;
    this.agregando.set(true);
    this.api
      .post<{ creados: NitAfiliado[]; omitidos: number }>('/nits-afiliados', {
        organizacionId: this.orgs.exigirId(),
        nits: lista,
      })
      .subscribe({
        next: (r) => {
          const detalle = r.omitidos ? `${r.creados.length} nuevos · ${r.omitidos} ya estaban` : `${r.creados.length} nuevos`;
          this.toast.exito('Compañías afiliadas actualizadas', `${detalle}. Se aplican en la próxima carga de datos.`);
          this.nitsNuevos = '';
          this.agregando.set(false);
          this.cargar();
        },
        error: (e: Error) => {
          this.toast.error('No se pudieron agregar los NITs', e.message);
          this.agregando.set(false);
        },
      });
  }

  alternarActivo(n: NitAfiliado): void {
    this.api.put<NitAfiliado>(`/nits-afiliados/${n.id}`, { activo: !n.activo }).subscribe({
      next: () => this.cargar(),
      error: (e: Error) => this.toast.error('No se pudo actualizar el NIT', e.message),
    });
  }

  async eliminarNit(n: NitAfiliado): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Quitar NIT de la lista',
      mensaje: `El NIT ${n.nit}${n.nombre ? ` (${n.nombre})` : ''} dejará de contar como compañía afiliada en la próxima carga de datos.`,
      textoConfirmar: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    this.api.delete<void>(`/nits-afiliados/${n.id}`).subscribe({
      next: () => {
        this.toast.exito('NIT quitado de la lista', n.nit);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo quitar el NIT', e.message),
    });
  }

  async eliminar(s: Sociedad): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Eliminar sociedad',
      mensaje: `Se eliminará «${s.nombre}» de la configuración. Sus datos ya cargados no se borran, pero dejarán de actualizarse.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    this.api.delete<void>(`/sociedades/${s.id}`).subscribe({
      next: () => {
        this.toast.exito('Sociedad eliminada', s.nombre);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar la sociedad', e.message),
    });
  }

  nombreConexion(id: number): string {
    return this.conexiones().find((c) => c.id === id)?.nombre ?? `Conexión #${id}`;
  }

  nuevo(): void {
    this.form = this.vacio();
    this.codigoManual = false;
    // Con una sola conexión no hay nada que elegir.
    if (this.conexionesPropias().length === 1) this.form.conexionId = this.conexionesPropias()[0].id;
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(s: Sociedad): void {
    this.form = {
      empresaId: s.empresaId, nombre: s.nombre, nit: s.nit ?? '', moneda: s.moneda ?? '',
      monedaPresentacion: s.monedaPresentacion ?? '', conexionId: s.conexionId,
      esquemaOrigen: s.esquemaOrigen ?? '', activo: s.activo, orden: s.orden,
    };
    this.edicionId.set(s.id);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  guardar(): void {
    const id = this.edicionId();
    if (!id && !this.form.empresaId) {
      this.errorForm.set('El código de la sociedad no puede quedar vacío.');
      return;
    }
    this.errorForm.set(null);
    this.guardando.set(true);
    const cuerpo = {
      nombre: this.form.nombre,
      nit: this.form.nit || undefined,
      moneda: this.form.moneda ? this.form.moneda.toUpperCase() : null,
      monedaPresentacion: this.form.monedaPresentacion ? this.form.monedaPresentacion.toUpperCase() : null,
      conexionId: this.form.conexionId,
      esquemaOrigen: this.form.esquemaOrigen || undefined,
      activo: this.form.activo,
      orden: this.form.orden,
      // La sociedad nace dentro de la organización en edición.
      ...(id ? {} : { empresaId: this.form.empresaId, organizacionId: this.orgs.exigirId() }),
    };
    const accion = id
      ? this.api.put<Sociedad>(`/sociedades/${id}`, cuerpo)
      : this.api.post<Sociedad>('/sociedades', cuerpo);
    accion.subscribe({
      next: (s) => {
        const siguiente = s.conexionId === null
          ? `${s.nombre} quedó sin conexión: asígnale una para poder cargar sus datos.`
          : id ? s.nombre : `${s.nombre}. Siguiente: provisiona la organización desde «Organizaciones».`;
        this.toast.exito(id ? 'Sociedad actualizada' : 'Sociedad creada', siguiente);
        this.guardando.set(false);
        this.abierto.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }
}
