import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { AlcancePerfil, PerfilOrg, TableroAdmin } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { PestanaTab, TabsComponent } from '../../ui/tabs.component';

interface FormPerfil {
  clave: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

const PESTANAS: PestanaTab[] = [
  { etiqueta: 'Usuarios', segmento: 'usuarios' },
  { etiqueta: 'Perfiles', segmento: 'perfiles' },
  { etiqueta: 'Glosario', segmento: 'glosario' },
  { etiqueta: 'Indicadores', segmento: 'indicadores' },
  { etiqueta: 'Auditoría', segmento: 'auditoria' },
];

/**
 * Perfiles de acceso de la organización: qué tableros ve cada perfil y — para
 * el chatbot futuro — qué dominios/métricas podrá consultar (alcances).
 */
@Component({
  selector: 'app-admin-perfiles',
  standalone: true,
  imports: [FormsModule, DrawerComponent, TabsComponent, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Perfiles">
      <button acciones (click)="nuevo()">+ Nuevo perfil</button>
    </app-page-header>
    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th scope="col">Perfil</th><th scope="col">Tableros</th><th scope="col">Alcances (chatbot)</th><th scope="col">Usuarios</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="6"></app-skeleton>
            } @else {
              @for (p of perfiles(); track p.id) {
                <tr>
                  <td data-label="Perfil"><strong>{{ p.nombre }}</strong><br /><code class="sutil">{{ p.clave }}</code></td>
                  <td data-label="Tableros">{{ p.tableroIds.length }}</td>
                  <td data-label="Alcances">
                    @for (a of p.alcances; track a.recursoTipo + a.recursoClave) {
                      <span class="chip">{{ a.recursoTipo }}: {{ a.recursoClave }}</span>
                    }
                    @if (!p.alcances.length) { <span class="sutil">—</span> }
                  </td>
                  <td data-label="Usuarios">{{ p.usuarios }}</td>
                  <td data-label="Estado">@if (p.activo) { <span class="ok">activo</span> } @else { <span class="sutil">inactivo</span> }</td>
                  <td data-label="Acciones" class="col-acciones">
                    <details class="menu-acciones">
                      <summary [attr.aria-label]="'Acciones para ' + p.nombre"><app-icon name="menu" [size]="16"></app-icon></summary>
                      <div class="menu-acciones__lista">
                        <button type="button" (click)="editar(p); cerrarMenu($event)"><app-icon name="editar" [size]="15"></app-icon> Editar</button>
                        <button type="button" (click)="abrirTableros(p); cerrarMenu($event)"><app-icon name="grafico" [size]="15"></app-icon> Tableros</button>
                        <button type="button" (click)="abrirAlcances(p); cerrarMenu($event)"><app-icon name="externo" [size]="15"></app-icon> Alcances</button>
                        <button type="button" class="peligro" (click)="eliminar(p); cerrarMenu($event)"><app-icon name="papelera" [size]="15"></app-icon> Eliminar</button>
                      </div>
                    </details>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6"><app-empty titulo="Sin perfiles">Crea perfiles (gerencia, finanzas, ventas…) y asígnales tableros.</app-empty></td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (drawerPerfil()) {
      <app-drawer [titulo]="edicionId() ? 'Editar perfil' : 'Nuevo perfil'" eyebrow="Perfiles" (cerrar)="drawerPerfil.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo">
            <label>Clave</label>
            <input name="clave" [(ngModel)]="form.clave" required placeholder="gerencia" [disabled]="!!edicionId()" />
            <span class="sutil">Minúsculas, números y guion bajo.</span>
          </div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required placeholder="Gerencia" /></div>
          <div class="campo"><label>Descripción</label><input name="descripcion" [(ngModel)]="form.descripcion" /></div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activo</label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerPerfil.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }

    @if (drawerTableros()) {
      <app-drawer titulo="Tableros del perfil" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerTableros.set(false)">
        <p class="ayuda">Los usuarios con este perfil verán estos tableros.</p>
        <fieldset>
          <legend>Tableros visibles</legend>
          @for (t of tableros(); track t.id) {
            <label class="check">
              <input type="checkbox" [checked]="tablerosSeleccionados().includes(t.id)" (change)="alternarTablero(t.id)" [disabled]="!t.activo" />
              {{ t.nombre }} @if (!t.activo) { <span class="sutil">(inactivo)</span> }
            </label>
          } @empty {
            <p class="sutil">El proveedor aún no ha dado de alta tableros para tu organización.</p>
          }
        </fieldset>
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="drawerTableros.set(false)">Cancelar</button>
          <button (click)="guardarTableros()" [disabled]="guardando()">
            @if (guardando()) { <span class="spinner"></span> }
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </app-drawer>
    }

    @if (drawerAlcances()) {
      <app-drawer titulo="Alcances del perfil (chatbot)" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerAlcances.set(false)">
        <p class="ayuda">
          Preparación del chatbot: define qué dominios, métricas o empresas podrá consultar este
          perfil cuando el módulo entre en funcionamiento. Usa <code>*</code> para todo el tipo.
        </p>
        <p class="ayuda">
          <strong>Empresa:</strong> qué filas ve este perfil (RLS del agente). Sin ninguna fila de
          tipo empresa, el perfil no ve datos. Usa <code>*</code> para todas.
        </p>
        <fieldset>
          <legend>Alcances</legend>
          @for (a of alcancesEdicion(); track $index) {
            <div class="fila-alcance">
              <label class="sr-solo" [attr.for]="'tipo-' + $index">Tipo de alcance</label>
              <select [id]="'tipo-' + $index" [ngModel]="a.recursoTipo" (ngModelChange)="actualizarAlcance($index, 'recursoTipo', $event)" name="tipo-{{ $index }}">
                <option value="dominio">dominio</option>
                <option value="metrica">métrica</option>
                <option value="empresa">empresa</option>
              </select>
              <label class="sr-solo" [attr.for]="'clave-' + $index">Clave del alcance</label>
              <input [id]="'clave-' + $index" [ngModel]="a.recursoClave" (ngModelChange)="actualizarAlcance($index, 'recursoClave', $event)" name="clave-{{ $index }}"
                     [placeholder]="a.recursoTipo === 'empresa' ? 'empresa_id o *' : 'ventas | ventas_netas | *'" />
              <button type="button" class="secundario pequeno icono-solo" (click)="quitarAlcance($index)" aria-label="Quitar este alcance">
                <app-icon name="cerrar" [size]="14"></app-icon>
              </button>
            </div>
          }
        </fieldset>
        <button type="button" class="secundario pequeno" (click)="agregarAlcance()">+ Agregar alcance</button>
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="drawerAlcances.set(false)">Cancelar</button>
          <button (click)="guardarAlcances()" [disabled]="guardando()">
            @if (guardando()) { <span class="spinner"></span> }
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin: 0 0 12px; font-size: var(--fs-sm); color: var(--muted); }
    .sutil { font-size: var(--fs-xs); color: var(--faint); }
    .check { display: flex; align-items: center; gap: 8px; font-size: var(--fs-base); margin: 8px 0; color: var(--muted); }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: var(--fs-xs); margin: 1px 3px 1px 0; }
    .ok { color: var(--ok); }
    .fila-alcance { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center; }
    .sr-solo { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  `],
})
export class PerfilesComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS;
  readonly perfiles = signal<PerfilOrg[]>([]);
  readonly tableros = signal<TableroAdmin[]>([]);
  readonly cargando = signal(true);
  readonly drawerPerfil = signal(false);
  readonly drawerTableros = signal(false);
  readonly drawerAlcances = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly seleccionado = signal<PerfilOrg | null>(null);
  readonly tablerosSeleccionados = signal<number[]>([]);
  readonly alcancesEdicion = signal<AlcancePerfil[]>([]);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormPerfil = this.vacio();

  constructor() {
    this.cargar();
  }

  private vacio(): FormPerfil {
    return { clave: '', nombre: '', descripcion: '', activo: true };
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<PerfilOrg[]>('/admin/perfiles').subscribe({
      next: (d) => {
        this.perfiles.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudieron cargar los perfiles', e.message);
        this.cargando.set(false);
      },
    });
    this.api.get<TableroAdmin[]>('/admin/tableros').subscribe({
      next: (d) => this.tableros.set(d),
      error: () => {},
    });
  }

  /** Cierra el <details> de acciones tras elegir una opción del menú. */
  cerrarMenu(evento: Event): void {
    (evento.currentTarget as HTMLElement)?.closest('details')?.removeAttribute('open');
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.drawerPerfil.set(true);
  }

  editar(p: PerfilOrg): void {
    this.form = { clave: p.clave, nombre: p.nombre, descripcion: p.descripcion ?? '', activo: p.activo };
    this.edicionId.set(p.id);
    this.errorForm.set(null);
    this.drawerPerfil.set(true);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.form.nombre,
      descripcion: this.form.descripcion || undefined,
      activo: this.form.activo,
      ...(id ? {} : { clave: this.form.clave }),
    };
    const accion = id
      ? this.api.put(`/admin/perfiles/${id}`, cuerpo)
      : this.api.post('/admin/perfiles', cuerpo);
    accion.subscribe({
      next: () => {
        this.toast.exito(id ? 'Perfil actualizado' : 'Perfil creado', this.form.nombre);
        this.guardando.set(false);
        this.drawerPerfil.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  async eliminar(p: PerfilOrg): Promise<void> {
    const ok = await this.confirm.confirmar({
      titulo: 'Eliminar perfil',
      mensaje: `¿Eliminar el perfil "${p.nombre}"? Sus ${p.usuarios} usuario(s) perderán los tableros asignados por él.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    this.api.delete(`/admin/perfiles/${p.id}`).subscribe({
      next: () => {
        this.toast.exito('Perfil eliminado', p.nombre);
        this.cargar();
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }

  abrirTableros(p: PerfilOrg): void {
    this.seleccionado.set(p);
    this.tablerosSeleccionados.set([...p.tableroIds]);
    this.errorForm.set(null);
    this.drawerTableros.set(true);
  }

  alternarTablero(tableroId: number): void {
    const actuales = this.tablerosSeleccionados();
    this.tablerosSeleccionados.set(
      actuales.includes(tableroId) ? actuales.filter((id) => id !== tableroId) : [...actuales, tableroId],
    );
  }

  guardarTableros(): void {
    const perfil = this.seleccionado();
    if (!perfil) return;
    this.guardando.set(true);
    this.api
      .put(`/admin/perfiles/${perfil.id}/tableros`, { tableroIds: this.tablerosSeleccionados() })
      .subscribe({
        next: () => {
          this.toast.exito('Tableros asignados', perfil.nombre);
          this.guardando.set(false);
          this.drawerTableros.set(false);
          this.cargar();
        },
        error: (e: Error) => {
          this.errorForm.set(e.message);
          this.guardando.set(false);
        },
      });
  }

  abrirAlcances(p: PerfilOrg): void {
    this.seleccionado.set(p);
    this.alcancesEdicion.set(p.alcances.map((a) => ({ ...a })));
    this.errorForm.set(null);
    this.drawerAlcances.set(true);
  }

  agregarAlcance(): void {
    this.alcancesEdicion.set([...this.alcancesEdicion(), { recursoTipo: 'dominio', recursoClave: '' }]);
  }

  quitarAlcance(indice: number): void {
    this.alcancesEdicion.set(this.alcancesEdicion().filter((_, i) => i !== indice));
  }

  actualizarAlcance(indice: number, campo: 'recursoTipo' | 'recursoClave', valor: string): void {
    this.alcancesEdicion.set(
      this.alcancesEdicion().map((a, i) => (i === indice ? { ...a, [campo]: valor } : a)),
    );
  }

  guardarAlcances(): void {
    const perfil = this.seleccionado();
    if (!perfil) return;
    const alcances = this.alcancesEdicion().filter((a) => a.recursoClave.trim().length > 0);
    this.guardando.set(true);
    this.api.put(`/admin/perfiles/${perfil.id}/alcances`, { alcances }).subscribe({
      next: () => {
        this.toast.exito('Alcances guardados', perfil.nombre);
        this.guardando.set(false);
        this.drawerAlcances.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }
}
