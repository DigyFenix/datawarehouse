import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Rol, RolDeUsuario, Usuario } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule, DrawerComponent, NgTemplateOutlet],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Acceso</span>
        <h2>Usuarios y roles</h2>
      </div>
      <button (click)="nuevo()">+ Nuevo usuario</button>
    </div>

    <p class="intro">
      Estas personas administran <strong>la plataforma</strong>: dan de alta organizaciones,
      configuran la ingesta y certifican métricas. No son quienes consultan tableros —
      esos viven en el portal de cada organización y se administran desde allí.
    </p>

    <!-- Dos poblaciones distintas, y conviene no mezclarlas: quien tiene rol en ESTA
         organización, y quien opera el producto entero. Verlas juntas hacía parecer
         que el filtro no funcionaba, cuando lo que pasa es que casi todos son globales. -->
    <section class="bloque">
      <header class="bloque__cab">
        <h3>Con acceso a {{ orgs.activa()?.nombre ?? 'esta organización' }}</h3>
        <span class="bloque__cuenta">{{ deLaOrganizacion().length }}</span>
      </header>
      <div class="tarjeta" style="padding:0;">
        <div class="tabla-wrap">
          <table>
            <thead><tr><th>Correo</th><th>Nombre</th><th>Roles</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (u of deLaOrganizacion(); track u.id) {
                <tr>
                  <td>{{ u.email }}</td>
                  <td>{{ u.nombre }}</td>
                  <td>{{ '' }}<ng-container *ngTemplateOutlet="chips; context: { $implicit: u }"></ng-container></td>
                  <td>
                    @if (u.activo) { <span class="badge badge--ok">Activo</span> }
                    @else { <span class="badge">Inactivo</span> }
                  </td>
                  <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(u)">Editar</button></td>
                </tr>
              } @empty {
                <tr><td colspan="5"><div class="vacio">
                  <strong>Nadie tiene un rol propio en esta organización</strong>
                  Hoy sólo la administran los operadores del producto, listados abajo.
                </div></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="bloque">
      <header class="bloque__cab">
        <h3>Operadores del producto</h3>
        <span class="bloque__cuenta">{{ globales().length }}</span>
      </header>
      <p class="bloque__nota">
        Alcance global: ven y administran <strong>todas</strong> las organizaciones, incluidas
        las que se den de alta después. Aparecen elijas la organización que elijas.
      </p>
      <div class="tarjeta" style="padding:0;">
        <div class="tabla-wrap">
          <table>
            <thead><tr><th>Correo</th><th>Nombre</th><th>Roles</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (u of globales(); track u.id) {
                <tr>
                  <td>{{ u.email }}</td>
                  <td>{{ u.nombre }}</td>
                  <td>{{ '' }}<ng-container *ngTemplateOutlet="chips; context: { $implicit: u }"></ng-container></td>
                  <td>
                    @if (u.activo) { <span class="badge badge--ok">Activo</span> }
                    @else { <span class="badge">Inactivo</span> }
                  </td>
                  <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(u)">Editar</button></td>
                </tr>
              } @empty {
                <tr><td colspan="5"><div class="vacio"><strong>Sin operadores globales</strong>
                  Nadie administra la plataforma completa.</div></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    @if (sinRol().length) {
      <section class="bloque">
        <header class="bloque__cab">
          <h3>Sin ningún rol</h3>
          <span class="bloque__cuenta">{{ sinRol().length }}</span>
        </header>
        <p class="bloque__nota">Todavía no pueden entrar a ninguna parte. Asígnales un rol para darles acceso.</p>
        <div class="tarjeta" style="padding:0;">
          <div class="tabla-wrap">
            <table>
              <thead><tr><th>Correo</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (u of sinRol(); track u.id) {
                  <tr>
                    <td>{{ u.email }}</td>
                    <td>{{ u.nombre }}</td>
                    <td>
                      @if (u.activo) { <span class="badge badge--ok">Activo</span> }
                      @else { <span class="badge">Inactivo</span> }
                    </td>
                    <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(u)">Editar</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>
    }

    <ng-template #chips let-u>
      @for (r of rolesPorUsuario()[u.id]; track r.rolId + '-' + r.organizacionId) {
        <span class="badge badge--pill" style="margin:1px 2px;" [title]="tituloRol(r)">
          {{ nombreRol(r.rolId) }}
          @if (r.organizacionId === null) {
            <span class="badge badge--global">Global</span>
          } @else if (r.organizacionId !== orgs.activaId()) {
            <span class="marca-otra-org">· {{ nombreOrganizacion(r.organizacionId) }}</span>
          }
        </span>
      } @empty { <span style="color:var(--faint);">Sin roles</span> }
    </ng-template>

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

          <h4 style="margin:22px 0 6px;">Roles asignados</h4>
          <p class="ayuda">
            El rol define <strong>qué puede hacer</strong> esta persona; el alcance, <strong>en qué
            organización</strong>. Un rol global convierte al usuario en operador del producto:
            ve y administra todas las organizaciones.
          </p>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
            @for (r of rolesActuales(); track r.rolId + '-' + r.organizacionId) {
              <span class="badge badge--pill" style="gap:8px;">
                {{ nombreRol(r.rolId) }}
                @if (r.organizacionId === null) {
                  <span class="badge badge--global">Global</span>
                } @else {
                  <span class="marca-otra-org">· {{ nombreOrganizacion(r.organizacionId) }}</span>
                }
                <button class="icono" style="padding:0 2px; font-size:13px;"
                        (click)="quitarRol(r)"
                        [attr.aria-label]="'Quitar ' + nombreRol(r.rolId)">✕</button>
              </span>
            } @empty { <span style="color:var(--faint); font-size:13px;">Todavía sin roles: este usuario no puede entrar a ninguna organización.</span> }
          </div>
          <div class="campo">
            <label>Agregar rol</label>
            <select name="rol" [(ngModel)]="rolAsignar">
              @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.nombre }}</option> }
            </select>
            @if (descripcionRolElegido()) { <span class="ayuda">{{ descripcionRolElegido() }}</span> }
          </div>
          <div style="display:flex; gap:8px; align-items:flex-end;">
            <div class="campo" style="flex:1; margin:0;">
              <label>Alcance</label>
              <select name="alcance" [(ngModel)]="rolAlcance">
                <option value="organizacion">Una organización</option>
                <option value="global">Global — operador del producto</option>
              </select>
            </div>
            @if (rolAlcance === 'organizacion') {
              <div class="campo" style="flex:1; margin:0;">
                <label>Organización</label>
                <select name="rolOrganizacionId" [(ngModel)]="rolOrganizacionId">
                  <option [ngValue]="null" disabled>Elige una…</option>
                  @for (o of orgs.organizaciones(); track o.id) { <option [ngValue]="o.id">{{ o.nombre }}</option> }
                </select>
              </div>
            }
            <button type="button" (click)="asignar()">Agregar</button>
          </div>
          @if (rolAlcance === 'global') {
            <p class="aviso-global">
              Con alcance global, esta persona podrá ver y administrar <strong>todas</strong> las
              organizaciones del portal, incluidas las que se den de alta en el futuro.
            </p>
          }
        }
      </app-drawer>
    }
  `,
  styles: [
    `
      .intro {
        margin: 0 0 22px;
        max-width: 78ch;
        font-size: 13.5px;
        line-height: 1.6;
        color: var(--faint);
      }
      .intro strong {
        color: var(--texto);
      }
      .bloque {
        margin-bottom: 26px;
      }
      .bloque__cab {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .bloque__cab h3 {
        margin: 0;
        font-size: 14.5px;
      }
      .bloque__cuenta {
        min-width: 24px;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--surface-2);
        font-size: 12px;
        text-align: center;
        color: var(--faint);
      }
      .bloque__nota {
        margin: 0 0 10px;
        max-width: 78ch;
        font-size: 12.5px;
        line-height: 1.55;
        color: var(--faint);
      }
      .bloque__nota strong {
        color: var(--texto);
      }
      .marca-otra-org {
        font-size: 11.5px;
        color: var(--faint);
      }
      .ayuda {
        display: block;
        margin: 4px 0 12px;
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--faint);
      }
      .aviso-global {
        margin-top: 12px;
        padding: 10px 12px;
        border-left: 3px solid var(--marca);
        border-radius: 0 8px 8px 0;
        background: var(--surface-2);
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--faint);
      }
      .aviso-global strong {
        color: var(--texto);
      }
    `,
  ],
})
export class UsuariosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly orgs = inject(OrganizacionService);

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
  rolAlcance: 'global' | 'organizacion' = 'organizacion';
  rolOrganizacionId: number | null = null;

  /** Quien tiene un rol acotado a la organización activa (no cuenta el global). */
  readonly deLaOrganizacion = computed(() => {
    const orgActiva = this.orgs.activaId();
    const mapa = this.rolesPorUsuario();
    return this.usuarios().filter((u) =>
      (mapa[u.id] ?? []).some((r) => r.organizacionId !== null && r.organizacionId === orgActiva),
    );
  });

  /** Operadores del producto: al menos un rol sin organización. */
  readonly globales = computed(() => {
    const mapa = this.rolesPorUsuario();
    return this.usuarios().filter((u) => (mapa[u.id] ?? []).some((r) => r.organizacionId === null));
  });

  /**
   * Sin ningún rol: no pueden entrar a ninguna parte. Se listan aparte porque si se
   * ocultaran, un usuario recién creado desaparecería justo de la pantalla donde hay
   * que darle acceso.
   */
  readonly sinRol = computed(() => {
    const mapa = this.rolesPorUsuario();
    return this.usuarios().filter((u) => (mapa[u.id] ?? []).length === 0);
  });

  readonly descripcionRolElegido = computed(() => {
    const elegido = this.roles().find((r) => r.id === Number(this.rolAsignar));
    return elegido?.descripcion ?? null;
  });

  nombreOrganizacion(id: number): string {
    return this.orgs.organizaciones().find((o) => o.id === id)?.nombre ?? `#${id}`;
  }

  /** Nombre legible del rol; la clave técnica (`data_owner`) no se le muestra a nadie. */
  nombreRol(rolId: number): string {
    return this.roles().find((r) => r.id === rolId)?.nombre ?? `#${rolId}`;
  }

  tituloRol(r: RolDeUsuario): string {
    const alcance =
      r.organizacionId === null
        ? 'en todas las organizaciones'
        : `en ${this.nombreOrganizacion(r.organizacionId)}`;
    return `${this.nombreRol(r.rolId)} ${alcance}`;
  }

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
    this.rolAlcance = 'global';
    this.rolOrganizacionId = null;
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
    if (this.rolAlcance === 'organizacion' && this.rolOrganizacionId === null) {
      this.toast.error('Falta la organización', 'Elige la organización para el alcance del rol.');
      return;
    }
    const organizacionId = this.rolAlcance === 'global' ? null : this.rolOrganizacionId;
    this.api.post(`/usuarios/${u.id}/roles`, { rolId: Number(this.rolAsignar), organizacionId }).subscribe({
      next: () => {
        this.toast.exito('Rol asignado', u.email);
        this.cargarRoles(u.id);
      },
      error: (e: Error) => this.toast.error('No se pudo asignar el rol', e.message),
    });
  }

  /** Quita SOLO la asignación señalada: el mismo rol puede existir en otras organizaciones. */
  quitarRol(r: RolDeUsuario): void {
    const u = this.editando();
    if (!u) return;
    const alcance = r.organizacionId === null ? 'global' : String(r.organizacionId);
    this.api.delete(`/usuarios/${u.id}/roles/${r.rolId}?alcance=${alcance}`).subscribe({
      next: () => {
        this.toast.info('Rol quitado', this.tituloRol(r));
        this.cargarRoles(u.id);
      },
      error: (e: Error) => this.toast.error('No se pudo quitar el rol', e.message),
    });
  }
}
