import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { PerfilOrg, UsuarioOrg } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

interface FormUsuario {
  email: string;
  nombre: string;
  password: string;
  esAdmin: boolean;
  activo: boolean;
}

/** Administración de usuarios de la organización (solo su admin). */
@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [FormsModule, DrawerComponent, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Administración</span>
        <h2>Usuarios</h2>
      </div>
      <button (click)="nuevo()">+ Nuevo usuario</button>
    </div>
    <nav class="tabs">
      <a [routerLink]="['/', tenant.hash(), 'admin', 'usuarios']" class="tab activo">Usuarios</a>
      <a [routerLink]="['/', tenant.hash(), 'admin', 'perfiles']" class="tab">Perfiles</a>
      <a [routerLink]="['/', tenant.hash(), 'admin', 'auditoria']" class="tab">Auditoría</a>
    </nav>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Usuario</th><th>Perfiles</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (u of usuarios(); track u.id) {
              <tr>
                <td><strong>{{ u.nombre }}</strong><br /><span class="sutil">{{ u.email }}</span></td>
                <td>
                  @for (p of u.perfiles; track p.id) { <span class="chip">{{ p.nombre }}</span> }
                  @if (!u.perfiles.length) { <span class="sutil">—</span> }
                </td>
                <td>@if (u.esAdmin) { <span class="chip chip--admin">admin</span> } @else { <span class="sutil">usuario</span> }</td>
                <td>@if (u.activo) { <span class="ok">activo</span> } @else { <span class="sutil">inactivo</span> }</td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="secundario pequeno" (click)="editar(u)">Editar</button>
                  <button class="secundario pequeno" (click)="abrirPerfiles(u)">Perfiles</button>
                  <button class="secundario pequeno" (click)="abrirRestablecer(u)">Contraseña</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Sin usuarios</strong>Crea los usuarios de tu organización.</div></td></tr>
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
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }

    @if (drawerPerfiles()) {
      <app-drawer titulo="Perfiles del usuario" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerPerfiles.set(false)">
        <p class="ayuda">Los perfiles definen qué tableros ve el usuario (y mañana, el alcance del chatbot).</p>
        @for (p of perfiles(); track p.id) {
          <label class="check">
            <input type="checkbox" [checked]="perfilesSeleccionados().includes(p.id)" (change)="alternarPerfil(p.id)" />
            {{ p.nombre }} <span class="sutil">({{ p.clave }})</span>
          </label>
        } @empty {
          <p class="sutil">Aún no hay perfiles. Créalos en la pestaña Perfiles.</p>
        }
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="drawerPerfiles.set(false)">Cancelar</button>
          <button (click)="guardarPerfiles()" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
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
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Restablecer' }}</button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin: 0 0 12px; font-size: 12.5px; color: var(--muted); }
    .sutil { font-size: 11.5px; color: var(--faint); }
    .check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; margin: 8px 0; color: var(--muted); }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: 11.5px; margin: 1px 3px 1px 0; }
    .chip--admin { background: var(--amber-100); color: var(--amber-700); }
    .ok { color: var(--ok); }
    .tabs { display: flex; gap: 4px; margin: 0 0 16px; border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 14px; text-decoration: none; color: var(--muted); font-size: 13.5px; border-bottom: 2px solid transparent; }
    .tab.activo { color: var(--text); border-bottom-color: var(--brand-600); font-weight: 600; }
  `],
})
export class UsuariosComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly usuarios = signal<UsuarioOrg[]>([]);
  readonly perfiles = signal<PerfilOrg[]>([]);
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
    this.api.get<UsuarioOrg[]>('/admin/usuarios').subscribe({
      next: (d) => this.usuarios.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los usuarios', e.message),
    });
    this.api.get<PerfilOrg[]>('/admin/perfiles').subscribe({
      next: (d) => this.perfiles.set(d),
      error: () => {},
    });
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
