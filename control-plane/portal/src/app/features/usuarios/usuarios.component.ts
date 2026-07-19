import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Rol, RolDeUsuario, Usuario } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Acceso</span>
        <h2>Usuarios y roles</h2>
      </div>
      <button (click)="nuevo()">+ Nuevo usuario</button>
    </div>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Email</th><th>Nombre</th><th>Roles</th><th></th></tr></thead>
          <tbody>
            @for (u of usuarios(); track u.id) {
              <tr>
                <td>{{ u.email }}</td>
                <td>{{ u.nombre }}</td>
                <td>
                  @for (r of rolesPorUsuario()[u.id]; track r.rolId) {
                    <span class="badge badge--pill" style="margin:1px 2px;">{{ r.clave }}</span>
                  } @empty { <span style="color:var(--faint);">—</span> }
                </td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(u)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="4"><div class="vacio"><strong>Sin usuarios</strong>Crea el primer usuario con “Nuevo usuario”.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="editando() ? 'Editar usuario' : 'Nuevo usuario'"
                  [eyebrow]="editando() ? editando()!.email : 'Acceso'" (cerrar)="cerrar()">
        @if (!editando()) {
          <form (ngSubmit)="crear()">
            <div class="campo"><label>Email</label><input name="email" type="email" [(ngModel)]="nuevoU.email" required /></div>
            <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="nuevoU.nombre" required /></div>
            <div class="campo"><label>Contraseña</label><input type="password" name="password" [(ngModel)]="nuevoU.password" required /></div>
            @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
            <div class="acciones-fila">
              <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
              <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Creando…' : 'Crear usuario' }}</button>
            </div>
          </form>
        } @else {
          <form (ngSubmit)="guardarDatos()">
            <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="datos.nombre" required /></div>
            <div class="campo">
              <label>Estado</label>
              <select name="activo" [(ngModel)]="datos.activo">
                <option [ngValue]="true">Activo</option>
                <option [ngValue]="false">Inactivo</option>
              </select>
            </div>
            <div class="acciones-fila">
              <button type="submit" [disabled]="guardando()">Guardar cambios</button>
            </div>
          </form>

          <h4 style="margin:22px 0 12px;">Roles</h4>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
            @for (r of rolesActuales(); track r.rolId) {
              <span class="badge badge--pill" style="gap:8px;">
                {{ r.clave }}
                <button class="icono" style="padding:0 2px; font-size:13px;" (click)="quitarRol(r.rolId)" aria-label="Quitar">✕</button>
              </span>
            } @empty { <span style="color:var(--faint); font-size:13px;">Sin roles asignados.</span> }
          </div>
          <div style="display:flex; gap:8px; align-items:flex-end;">
            <div class="campo" style="flex:1; margin:0;">
              <label>Agregar rol</label>
              <select name="rol" [(ngModel)]="rolAsignar">
                @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.nombre }}</option> }
              </select>
            </div>
            <button type="button" (click)="asignar()">Agregar</button>
          </div>
        }
      </app-drawer>
    }
  `,
})
export class UsuariosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly usuarios = signal<Usuario[]>([]);
  readonly roles = signal<Rol[]>([]);
  readonly rolesPorUsuario = signal<Record<number, RolDeUsuario[]>>({});
  readonly abierto = signal(false);
  readonly editando = signal<Usuario | null>(null);
  readonly rolesActuales = signal<RolDeUsuario[]>([]);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  nuevoU = { email: '', nombre: '', password: '' };
  datos = { nombre: '', activo: true };
  rolAsignar: number | null = null;

  ngOnInit(): void {
    this.api.get<Rol[]>('/roles').subscribe({ next: (d) => this.roles.set(d) });
    this.cargar();
  }

  cargar(): void {
    this.api.get<Usuario[]>('/usuarios').subscribe({
      next: (us) => {
        this.usuarios.set(us);
        us.forEach((u) => this.cargarRoles(u.id));
      },
      error: (e: Error) => this.toast.error('No se pudieron cargar los usuarios', e.message),
    });
  }

  private cargarRoles(usuarioId: number): void {
    this.api.get<RolDeUsuario[]>(`/usuarios/${usuarioId}/roles`).subscribe({
      next: (rs) => {
        this.rolesPorUsuario.update((m) => ({ ...m, [usuarioId]: rs }));
        if (this.editando()?.id === usuarioId) this.rolesActuales.set(rs);
      },
    });
  }

  nuevo(): void {
    this.nuevoU = { email: '', nombre: '', password: '' };
    this.editando.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(u: Usuario): void {
    this.editando.set(u);
    this.datos = { nombre: u.nombre, activo: u.activo };
    this.rolesActuales.set(this.rolesPorUsuario()[u.id] ?? []);
    this.rolAsignar = this.roles()[0]?.id ?? null;
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  crear(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    this.api.post<Usuario>('/usuarios', this.nuevoU).subscribe({
      next: (u) => {
        this.toast.exito('Usuario creado', u.email);
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

  guardarDatos(): void {
    const u = this.editando();
    if (!u) return;
    this.guardando.set(true);
    this.api.put<Usuario>(`/usuarios/${u.id}`, this.datos).subscribe({
      next: () => {
        this.toast.exito('Usuario actualizado', u.email);
        this.guardando.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.guardando.set(false);
        this.toast.error('No se pudo actualizar', e.message);
      },
    });
  }

  asignar(): void {
    const u = this.editando();
    if (!u || this.rolAsignar === null) return;
    this.api.post(`/usuarios/${u.id}/roles`, { rolId: Number(this.rolAsignar) }).subscribe({
      next: () => {
        this.toast.exito('Rol asignado', u.email);
        this.cargarRoles(u.id);
      },
      error: (e: Error) => this.toast.error('No se pudo asignar el rol', e.message),
    });
  }

  quitarRol(rolId: number): void {
    const u = this.editando();
    if (!u) return;
    this.api.delete(`/usuarios/${u.id}/roles/${rolId}`).subscribe({
      next: () => {
        this.toast.info('Rol quitado');
        this.cargarRoles(u.id);
      },
      error: (e: Error) => this.toast.error('No se pudo quitar el rol', e.message),
    });
  }
}
