import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Conexion, Entorno } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';

interface FormConexion {
  nombre: string;
  entornoClave: string;
  host: string;
  puerto: number | null;
  baseDatos: string;
  secretoRef: string;
  notas: string;
  activo: boolean;
}

/**
 * Conexiones a los servidores de origen (ERP) de la organización en edición.
 * El API lista todas las que el actor puede ver; aquí se muestran solo las de la
 * organización activa y las nuevas nacen dentro de ella.
 */
@Component({
  selector: 'app-conexiones',
  standalone: true,
  imports: [FormsModule, DrawerComponent, PageHeaderComponent, EmptyComponent, IconComponent, SkeletonComponent],
  template: `
    <app-page-header eyebrow="Datos de origen" titulo="Conexiones al ERP">
      <button acciones (click)="nuevo()" [disabled]="orgs.activaId() === null">+ Nueva conexión</button>
    </app-page-header>
    <p class="ayuda">
      Servidores de los que se extraen los datos de <strong>{{ orgs.activa()?.nombre ?? 'la organización' }}</strong>
      (SAP Business One sobre HANA o SQL Server, Odoo sobre PostgreSQL). Cada sociedad apunta a una conexión.
    </p>

    <div class="tarjeta tarjeta--tabla">
      @if (propias().length > 5) {
        <div class="barra-lista">
          <input type="search" class="buscador" placeholder="Buscar por nombre o servidor…"
                 [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" name="filtro" aria-label="Buscar conexión" />
          <span class="sutil">{{ filtradas().length }} de {{ propias().length }}</span>
        </div>
      }
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th scope="col">Conexión</th><th scope="col">Tipo</th><th scope="col">Servidor</th><th scope="col">Credencial</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
            } @else {
              @for (c of filtradas(); track c.id) {
                <tr>
                  <td data-label="Conexión"><strong>{{ c.nombre }}</strong>@if (c.notas) { <br /><span class="sutil">{{ c.notas }}</span> }</td>
                  <td data-label="Tipo">{{ nombreEntorno(c.entornoClave) }}</td>
                  <td data-label="Servidor"><code>{{ c.host }}:{{ c.puerto }}</code>@if (c.baseDatos) { <br /><span class="sutil">{{ c.baseDatos }}</span> }</td>
                  <td data-label="Credencial">{{ c.secretoRef }}</td>
                  <td data-label="Estado">
                    @if (c.activo) { <span class="badge badge--ok">Activa</span> } @else { <span class="badge badge--neutral">Inactiva</span> }
                  </td>
                  <td data-label="Acciones" class="col-acciones">
                    <details class="menu-acciones">
                      <summary [attr.aria-label]="'Acciones para ' + c.nombre"><app-icon name="menu" [size]="16"></app-icon></summary>
                      <div class="menu-acciones__lista">
                        <button type="button" (click)="editar(c); cerrarMenu($event)"><app-icon name="editar" [size]="15"></app-icon> Editar</button>
                        <button type="button" class="peligro" (click)="eliminar(c); cerrarMenu($event)"><app-icon name="papelera" [size]="15"></app-icon> Eliminar</button>
                      </div>
                    </details>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6">
                  @if (orgs.activaId() === null) {
                    <app-empty titulo="No hay organización en edición">Crea o elige una organización en «Organizaciones» para registrar sus conexiones.</app-empty>
                  } @else if (propias().length === 0) {
                    <app-empty titulo="Esta organización aún no tiene conexiones">Registra el servidor del ERP de {{ orgs.activa()?.nombre }} con «Nueva conexión»; es el primer paso de la puesta en marcha.</app-empty>
                  } @else {
                    <app-empty titulo="Ninguna conexión coincide">No hay resultados para «{{ filtro() }}».</app-empty>
                  }
                </td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar conexión' : 'Nueva conexión'" [eyebrow]="orgs.activa()?.nombre ?? 'Conexiones'" (cerrar)="abierto.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo">
            <label for="cx-org">Organización</label>
            <input id="cx-org" name="organizacion" [ngModel]="orgs.activa()?.nombre ?? ''" disabled />
            <span class="sutil">La conexión pertenece a la organización en edición y no se puede mover a otra.</span>
          </div>
          <div class="campo"><label for="cx-nombre">Nombre</label><input id="cx-nombre" name="nombre" [(ngModel)]="form.nombre" required placeholder="Servidor principal de SAP" /></div>
          <div class="campo"><label for="cx-entorno">Tipo de servidor</label>
            <select id="cx-entorno" name="entornoClave" [(ngModel)]="form.entornoClave" (ngModelChange)="onEntorno()" required>
              <option value="" disabled>Elige…</option>
              @for (e of entornos(); track e.id) { <option [value]="e.clave">{{ e.nombre }}</option> }
            </select>
          </div>
          <div class="grid2">
            <div class="campo"><label for="cx-host">Servidor</label><input id="cx-host" name="host" [(ngModel)]="form.host" required placeholder="10.0.0.10 o hana.miempresa.com" /></div>
            <div class="campo"><label for="cx-puerto">Puerto</label><input id="cx-puerto" type="number" name="puerto" [(ngModel)]="form.puerto" required /></div>
          </div>
          <div class="campo"><label for="cx-bd">Base de datos <span class="sutil">· opcional</span></label><input id="cx-bd" name="baseDatos" [(ngModel)]="form.baseDatos" placeholder="Si se deja vacío, la que el servidor use por defecto" /></div>
          <div class="campo">
            <label for="cx-cred">Nombre de la credencial</label>
            <input id="cx-cred" name="secretoRef" [ngModel]="form.secretoRef" (ngModelChange)="onCredencial($event)" required placeholder="SAP_PRINCIPAL" autocomplete="off" spellcheck="false" />
            <span class="sutil">El usuario y la contraseña del ERP no se guardan aquí: se configuran en el servidor con este nombre.</span>
          </div>
          <div class="campo"><label for="cx-notas">Notas <span class="sutil">· opcional</span></label><input id="cx-notas" name="notas" [(ngModel)]="form.notas" placeholder="Para quien administre esta conexión" /></div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activa <span class="sutil">· si está inactiva, no se usa para cargar datos</span></label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="abierto.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()" [attr.aria-busy]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : (edicionId() ? 'Guardar cambios' : 'Crear conexión') }}
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
    .campo label .sutil { font-weight: 400; }
  `],
})
export class ConexionesComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly orgs = inject(OrganizacionService);

  readonly conexiones = signal<Conexion[]>([]);
  readonly entornos = signal<Entorno[]>([]);
  readonly cargando = signal(true);
  readonly filtro = signal('');
  /** El API devuelve todas las visibles; aquí solo cuentan las de la organización en edición. */
  readonly propias = computed(() => this.conexiones().filter((c) => c.organizacionId === this.orgs.activaId()));
  readonly filtradas = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    if (!q) return this.propias();
    return this.propias().filter((c) => c.nombre.toLowerCase().includes(q) || c.host.toLowerCase().includes(q) || c.secretoRef.toLowerCase().includes(q));
  });
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormConexion = this.vacio();

  constructor() {
    // Sigue a la organización en edición: al cambiarla se recarga y se limpia el buscador.
    effect(
      () => {
        this.orgs.activaId();
        this.filtro.set('');
        this.cargar();
      },
      { allowSignalWrites: true },
    );
  }

  private vacio(): FormConexion {
    return { nombre: '', entornoClave: '', host: '', puerto: null, baseDatos: '', secretoRef: '', notas: '', activo: true };
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<Conexion[]>('/conexiones').subscribe({
      next: (d) => {
        this.conexiones.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudieron cargar las conexiones', e.message);
      },
    });
    if (this.entornos().length === 0) {
      this.api.get<Entorno[]>('/entornos').subscribe({
        next: (d) => this.entornos.set(d),
        error: (e: Error) => this.toast.error('No se pudieron cargar los tipos de servidor', e.message),
      });
    }
  }

  nombreEntorno(clave: string): string {
    return this.entornos().find((e) => e.clave === clave)?.nombre ?? clave;
  }

  cerrarMenu(evento: Event): void {
    (evento.currentTarget as HTMLElement)?.closest('details')?.removeAttribute('open');
  }

  onEntorno(): void {
    const e = this.entornos().find((x) => x.clave === this.form.entornoClave);
    if (e?.puertoDefault && !this.form.puerto) this.form.puerto = e.puertoDefault;
  }

  /** El nombre de la credencial se usa como clave en el servidor: mayúsculas, dígitos y guion bajo. */
  onCredencial(valor: string): void {
    this.form.secretoRef = valor
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+/, '');
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(c: Conexion): void {
    this.form = {
      nombre: c.nombre, entornoClave: c.entornoClave, host: c.host, puerto: c.puerto,
      baseDatos: c.baseDatos ?? '', secretoRef: c.secretoRef, notas: c.notas ?? '', activo: c.activo,
    };
    this.edicionId.set(c.id);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  async eliminar(c: Conexion): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Eliminar conexión',
      mensaje: `Se eliminará «${c.nombre}». Las sociedades que apunten a ella quedarán sin conexión y no se podrán cargar sus datos hasta reasignarlas.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    this.api.delete<void>(`/conexiones/${c.id}`).subscribe({
      next: () => {
        this.toast.exito('Conexión eliminada', `${c.nombre}. Revisa en Sociedades cuáles quedaron sin conexión.`);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar la conexión', e.message),
    });
  }

  guardar(): void {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null) {
      this.errorForm.set('Elige primero una organización en «Organizaciones».');
      return;
    }
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.form.nombre,
      entornoClave: this.form.entornoClave,
      host: this.form.host,
      puerto: this.form.puerto,
      baseDatos: this.form.baseDatos || undefined,
      secretoRef: this.form.secretoRef,
      notas: this.form.notas || undefined,
      activo: this.form.activo,
      // La organización solo se fija al crear: una conexión no se reasigna de organización (el API la omite al editar).
      ...(id ? {} : { organizacionId }),
    };
    const accion = id
      ? this.api.put<Conexion>(`/conexiones/${id}`, cuerpo)
      : this.api.post<Conexion>('/conexiones', cuerpo);
    accion.subscribe({
      next: (c) => {
        this.toast.exito(
          id ? 'Conexión actualizada' : 'Conexión creada',
          id ? c.nombre : `${c.nombre}. Siguiente: registra las sociedades que usan esta conexión.`,
        );
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
