import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { PerfilOrg, UsuarioOrg } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';
import { PestanaTab, TabsComponent } from '../../ui/tabs.component';

interface FormUsuario {
  email: string;
  nombre: string;
  password: string;
  esAdmin: boolean;
  activo: boolean;
}

const PESTANAS: PestanaTab[] = [
  { etiqueta: 'Usuarios', segmento: 'usuarios' },
  { etiqueta: 'Perfiles', segmento: 'perfiles' },
  { etiqueta: 'Auditoría', segmento: 'auditoria' },
];

/** Administración de usuarios de la organización (solo su admin). */
@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [FormsModule, DrawerComponent, TabsComponent, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Administración" titulo="Usuarios">
      <button acciones (click)="nuevo()">+ Nuevo usuario</button>
    </app-page-header>
    <app-tabs [baseRuta]="['/', tenant.hash(), 'admin']" [items]="pestanas"></app-tabs>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap tabla-responsive">
        <table>
          <thead><tr><th scope="col">Usuario</th><th scope="col">Perfiles</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            @if (cargando()) {
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
              <app-skeleton variante="fila-tabla" [columnas]="5"></app-skeleton>
            } @else {
              @for (u of usuarios(); track u.id) {
                <tr>
                  <td data-label="Usuario"><strong>{{ u.nombre }}</strong><br /><span class="sutil">{{ u.email }}</span></td>
                  <td data-label="Perfiles">
                    @for (p of u.perfiles; track p.id) { <span class="chip">{{ p.nombre }}</span> }
                    @if (!u.perfiles.length) { <span class="sutil">—</span> }
                  </td>
                  <td data-label="Rol">@if (u.esAdmin) { <span class="chip chip--admin">admin</span> } @else { <span class="sutil">usuario</span> }</td>
                  <td data-label="Estado">@if (u.activo) { <span class="ok">activo</span> } @else { <span class="sutil">inactivo</span> }</td>
                  <td data-label="Acciones" class="col-acciones">
                    <details class="menu-acciones">
                      <summary [attr.aria-label]="'Acciones para ' + u.nombre"><app-icon name="menu" [size]="16"></app-icon></summary>
                      <div class="menu-acciones__lista">
                        <button type="button" (click)="editar(u); cerrarMenu($event)"><app-icon name="editar" [size]="15"></app-icon> Editar</button>
                        <button type="button" (click)="abrirPerfiles(u); cerrarMenu($event)"><app-icon name="usuarios" [size]="15"></app-icon> Perfiles</button>
                        <button type="button" (click)="abrirRestablecer(u); cerrarMenu($event)"><app-icon name="candado" [size]="15"></app-icon> Contraseña</button>
                      </div>
                    </details>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5"><app-empty titulo="Sin usuarios">Crea los usuarios de tu organización.</app-empty></td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (drawerUsuario()) {
      <app-drawer [titulo]="edicionId() ? 'Editar usuario' : 'Nuevo usuario'" eyebrow="Usuarios" (cerrar)="drawerUsuario.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo"><label>Email</label><input name="email" type="email" [(ngModel)]="form.email" required [disabled]="!!edicionId()" /></div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required /></div>
          @if (!edicionId()) {
            <div class="campo">
              <label>Contraseña temporal</label>
              <input name="password" type="text" [(ngModel)]="form.password" required minlength="8" />
              <span class="sutil">El usuario deberá cambiarla en su primer ingreso.</span>
            </div>
          }
          <label class="check"><input type="checkbox" name="esAdmin" [(ngModel)]="form.esAdmin" /> Administrador de la organización</label>
          @if (edicionId()) {
            <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activo</label>
          }
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerUsuario.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }

    @if (drawerPerfiles()) {
      <app-drawer titulo="Perfiles del usuario" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerPerfiles.set(false)">
        <p class="ayuda">Los perfiles definen qué tableros ve el usuario (y mañana, el alcance del chatbot).</p>
        <fieldset>
          <legend>Perfiles asignados</legend>
          @for (p of perfiles(); track p.id) {
            <label class="check">
              <input type="checkbox" [checked]="perfilesSeleccionados().includes(p.id)" (change)="alternarPerfil(p.id)" />
              {{ p.nombre }} <span class="sutil">({{ p.clave }})</span>
            </label>
          } @empty {
            <p class="sutil">Aún no hay perfiles. Créalos en la pestaña Perfiles.</p>
          }
        </fieldset>
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="drawerPerfiles.set(false)">Cancelar</button>
          <button (click)="guardarPerfiles()" [disabled]="guardando()">
            @if (guardando()) { <span class="spinner"></span> }
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </app-drawer>
    }

    @if (drawerRestablecer()) {
      <app-drawer titulo="Restablecer contraseña" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerRestablecer.set(false)">
        <form (ngSubmit)="restablecer()">
          <div class="campo">
            <label>Contraseña temporal nueva</label>
            <input name="passwordNueva" type="text" [(ngModel)]="passwordNueva" required minlength="8" />
            <span class="sutil">El usuario deberá cambiarla en su siguiente ingreso.</span>
          </div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerRestablecer.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Restableciendo…' : 'Restablecer' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin: 0 0 12px; font-size: var(--fs-sm); color: var(--muted); }
    .sutil { font-size: var(--fs-xs); color: var(--faint); }
    .check { display: flex; align-items: center; gap: 8px; font-size: var(--fs-base); margin: 8px 0; color: var(--muted); }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: var(--fs-xs); margin: 1px 3px 1px 0; }
    .chip--admin { background: var(--amber-100); color: var(--amber-700); }
    .ok { color: var(--ok); }
  `],
})
export class UsuariosComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS;
  readonly usuarios = signal<UsuarioOrg[]>([]);
  readonly perfiles = signal<PerfilOrg[]>([]);
  readonly cargando = signal(true);
  readonly drawerUsuario = signal(false);
  readonly drawerPerfiles = signal(false);
  readonly drawerRestablecer = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly seleccionado = signal<UsuarioOrg | null>(null);
  readonly perfilesSeleccionados = signal<number[]>([]);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormUsuario = this.vacio();
  passwordNueva = '';

  constructor() {
    this.cargar();
  }

  private vacio(): FormUsuario {
    return { email: '', nombre: '', password: '', esAdmin: false, activo: true };
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.get<UsuarioOrg[]>('/admin/usuarios').subscribe({
      next: (d) => {
        this.usuarios.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.toast.error('No se pudieron cargar los usuarios', e.message);
        this.cargando.set(false);
      },
    });
    this.api.get<PerfilOrg[]>('/admin/perfiles').subscribe({
      next: (d) => this.perfiles.set(d),
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
    this.drawerUsuario.set(true);
  }

  editar(u: UsuarioOrg): void {
    this.form = { email: u.email, nombre: u.nombre, password: '', esAdmin: u.esAdmin, activo: u.activo };
    this.edicionId.set(u.id);
    this.errorForm.set(null);
    this.drawerUsuario.set(true);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const accion = id
      ? this.api.put(`/admin/usuarios/${id}`, {
          nombre: this.form.nombre,
          esAdmin: this.form.esAdmin,
          activo: this.form.activo,
        })
      : this.api.post('/admin/usuarios', {
          email: this.form.email,
          nombre: this.form.nombre,
          password: this.form.password,
          esAdmin: this.form.esAdmin,
        });
    accion.subscribe({
      next: () => {
        this.toast.exito(id ? 'Usuario actualizado' : 'Usuario creado', this.form.nombre);
        this.guardando.set(false);
        this.drawerUsuario.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  abrirPerfiles(u: UsuarioOrg): void {
    this.seleccionado.set(u);
    this.perfilesSeleccionados.set(u.perfiles.map((p) => p.id));
    this.errorForm.set(null);
    this.drawerPerfiles.set(true);
  }

  alternarPerfil(perfilId: number): void {
    const actuales = this.perfilesSeleccionados();
    this.perfilesSeleccionados.set(
      actuales.includes(perfilId) ? actuales.filter((id) => id !== perfilId) : [...actuales, perfilId],
    );
  }

  guardarPerfiles(): void {
    const usuario = this.seleccionado();
    if (!usuario) return;
    this.guardando.set(true);
    this.api
      .put(`/admin/usuarios/${usuario.id}/perfiles`, { perfilIds: this.perfilesSeleccionados() })
      .subscribe({
        next: () => {
          this.toast.exito('Perfiles asignados', usuario.nombre);
          this.guardando.set(false);
          this.drawerPerfiles.set(false);
          this.cargar();
        },
        error: (e: Error) => {
          this.errorForm.set(e.message);
          this.guardando.set(false);
        },
      });
  }

  abrirRestablecer(u: UsuarioOrg): void {
    this.seleccionado.set(u);
    this.passwordNueva = '';
    this.errorForm.set(null);
    this.drawerRestablecer.set(true);
  }

  restablecer(): void {
    const usuario = this.seleccionado();
    if (!usuario) return;
    this.guardando.set(true);
    this.api
      .post(`/admin/usuarios/${usuario.id}/restablecer-password`, { password: this.passwordNueva })
      .subscribe({
        next: () => {
          this.toast.exito('Contraseña restablecida', usuario.email);
          this.guardando.set(false);
          this.drawerRestablecer.set(false);
        },
        error: (e: Error) => {
          this.errorForm.set(e.message);
          this.guardando.set(false);
        },
      });
  }
}
