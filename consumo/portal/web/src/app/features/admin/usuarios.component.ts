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
import { TabsComponent } from '../../ui/tabs.component';
import { PESTANAS_ADMIN } from './pestanas';

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
                @if (errorCarga()) {
                  <tr><td colspan="5"><app-empty titulo="No se pudieron cargar los usuarios">{{ errorCarga() }} <button type="button" class="enlace" (click)="cargar()">Reintentar</button></app-empty></td></tr>
                } @else {
                  <tr><td colspan="5"><app-empty titulo="Sin usuarios">Crea los usuarios de tu organización.</app-empty></td></tr>
                }
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (drawerUsuario()) {
      <app-drawer [titulo]="edicionId() ? 'Editar usuario' : 'Nuevo usuario'" eyebrow="Usuarios" (cerrar)="drawerUsuario.set(false)">
        <form #f="ngForm" (ngSubmit)="f.valid && guardar()">
          <div class="campo"><label>Email</label><input name="email" type="email" [(ngModel)]="form.email" required email maxlength="200" [disabled]="!!edicionId()" /></div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required minlength="2" maxlength="200" /></div>
          @if (!edicionId()) {
            <div class="campo">
              <label>Contraseña temporal</label>
              <div class="pass-fila">
                <input name="password" type="text" [(ngModel)]="form.password" required minlength="8" maxlength="100" autocomplete="off" spellcheck="false" />
                <button type="button" class="secundario pequeno" (click)="form.password = generarPassword()">Generar</button>
                <button type="button" class="secundario pequeno" (click)="copiar(form.password)" [disabled]="!form.password">Copiar</button>
              </div>
              <span class="sutil">Entrégasela al usuario; deberá cambiarla en su primer ingreso.</span>
            </div>
            <div class="campo">
              <label>Perfiles</label>
              <div class="chips-sel">
                @for (p of perfiles(); track p.id) {
                  <button type="button" class="chip-sel" [class.chip-sel--on]="perfilesNuevo().has(p.id)" (click)="alternarPerfilNuevo(p.id)" [attr.aria-pressed]="perfilesNuevo().has(p.id)" [disabled]="!p.activo">{{ p.nombre }}</button>
                } @empty { <span class="sutil">@if (errorPerfiles()) { No se pudieron cargar los perfiles: {{ errorPerfiles() }} } @else { Aún no hay perfiles: créalos en la pestaña Perfiles. }</span> }
              </div>
              @if (perfiles().length && perfilesNuevo().size === 0 && !form.esAdmin) { <span class="aviso">Sin perfil, el usuario entra pero no ve tableros ni puede usar el asistente.</span> }
            </div>
          }
          <label class="check"><input type="checkbox" name="esAdmin" [(ngModel)]="form.esAdmin" /> Administrador de la organización</label>
          @if (edicionId()) {
            <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activo</label>
          }
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerUsuario.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando() || f.invalid">
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
            <p class="sutil">@if (errorPerfiles()) { No se pudieron cargar los perfiles: {{ errorPerfiles() }} } @else { Aún no hay perfiles. Créalos en la pestaña Perfiles. }</p>
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
        <form #fr="ngForm" (ngSubmit)="fr.valid && restablecer()">
          <div class="campo">
            <label>Contraseña temporal nueva</label>
            <div class="pass-fila">
              <input name="passwordNueva" type="text" [(ngModel)]="passwordNueva" required minlength="8" maxlength="100" autocomplete="off" spellcheck="false" />
              <button type="button" class="secundario pequeno" (click)="passwordNueva = generarPassword()">Generar</button>
              <button type="button" class="secundario pequeno" (click)="copiar(passwordNueva)" [disabled]="!passwordNueva">Copiar</button>
            </div>
            <span class="sutil">Entrégasela al usuario; deberá cambiarla en su siguiente ingreso.</span>
          </div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="drawerRestablecer.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando() || fr.invalid">
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
    .pass-fila { display: flex; gap: 6px; }
    .pass-fila input { flex: 1; font-family: var(--mono); letter-spacing: .02em; }
    .chips-sel { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-sel { min-height: 0; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text); font-size: var(--fs-sm); font-weight: 500; cursor: pointer; }
    .chip-sel:hover:not(:disabled) { background: var(--surface-2); }
    .chip-sel:disabled { opacity: .5; cursor: not-allowed; }
    .chip-sel--on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
    .aviso { display: block; margin-top: 6px; padding: 6px 10px; border-radius: var(--r-sm); background: var(--warn-bg); color: var(--warn); font-size: var(--fs-xs); }
  `],
})
export class UsuariosComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly pestanas = PESTANAS_ADMIN;
  readonly usuarios = signal<UsuarioOrg[]>([]);
  readonly perfiles = signal<PerfilOrg[]>([]);
  readonly cargando = signal(true);
  /** Distinguen «no se pudo cargar» de «no hay»: antes un fallo se mostraba como lista vacía. */
  readonly errorCarga = signal<string | null>(null);
  readonly errorPerfiles = signal<string | null>(null);
  readonly drawerUsuario = signal(false);
  readonly drawerPerfiles = signal(false);
  readonly drawerRestablecer = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly seleccionado = signal<UsuarioOrg | null>(null);
  readonly perfilesSeleccionados = signal<number[]>([]);
  readonly perfilesNuevo = signal<Set<number>>(new Set());
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
    this.errorCarga.set(null);
    this.errorPerfiles.set(null);
    this.api.get<UsuarioOrg[]>('/admin/usuarios').subscribe({
      next: (d) => {
        this.usuarios.set(d);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.errorCarga.set(e.message);
        this.cargando.set(false);
      },
    });
    this.api.get<PerfilOrg[]>('/admin/perfiles').subscribe({
      next: (d) => this.perfiles.set(d),
      error: (e: Error) => this.errorPerfiles.set(e.message),
    });
  }

  /** Inserta o reemplaza un usuario en la lista con lo que devolvió el API (sin volver a pedir todo). */
  private ponerEnLista(id: number, cambios: Partial<UsuarioOrg>): void {
    this.usuarios.update((lista) => {
      const existe = lista.some((u) => u.id === id);
      const nueva = existe
        ? lista.map((u) => (u.id === id ? { ...u, ...cambios } : u))
        : [...lista, { perfiles: [], ...cambios } as UsuarioOrg];
      return nueva.sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
  }

  /** Cierra el <details> de acciones tras elegir una opción del menú. */
  cerrarMenu(evento: Event): void {
    (evento.currentTarget as HTMLElement)?.closest('details')?.removeAttribute('open');
  }

  nuevo(): void {
    this.form = this.vacio();
    this.form.password = this.generarPassword();
    this.perfilesNuevo.set(new Set());
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
      ? this.api.put<Partial<UsuarioOrg> & { id: number }>(`/admin/usuarios/${id}`, {
          nombre: this.form.nombre,
          esAdmin: this.form.esAdmin,
          activo: this.form.activo,
        })
      : this.api.post<Partial<UsuarioOrg> & { id: number }>('/admin/usuarios', {
          email: this.form.email,
          nombre: this.form.nombre,
          password: this.form.password,
          esAdmin: this.form.esAdmin,
          perfilIds: [...this.perfilesNuevo()],
        });
    accion.subscribe({
      next: (fila) => {
        this.toast.exito(id ? 'Usuario actualizado' : 'Usuario creado', id ? this.form.nombre : `${this.form.nombre}: entrégale su contraseña temporal; la cambia al entrar.`);
        this.guardando.set(false);
        this.drawerUsuario.set(false);
        this.ponerEnLista(fila.id, fila);
      },
      error: (e: Error) => {
        this.errorForm.set(e.message);
        this.guardando.set(false);
      },
    });
  }

  alternarPerfilNuevo(id: number): void {
    const s = new Set(this.perfilesNuevo());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.perfilesNuevo.set(s);
  }

  /** 12 caracteres legibles (sin 0/O, 1/l/I) con mayúscula, minúscula, dígito y símbolo garantizados. */
  generarPassword(): string {
    const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!#$%&*+?'];
    const todo = grupos.join('');
    const azar = (alfabeto: string) => alfabeto[crypto.getRandomValues(new Uint32Array(1))[0] % alfabeto.length];
    const letras = grupos.map(azar);
    while (letras.length < 12) letras.push(azar(todo));
    for (let i = letras.length - 1; i > 0; i -= 1) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [letras[i], letras[j]] = [letras[j], letras[i]];
    }
    return letras.join('');
  }

  copiar(texto: string): void {
    void navigator.clipboard.writeText(texto).then(
      () => this.toast.exito('Copiada', 'La contraseña temporal está en el portapapeles.'),
      () => this.toast.error('No se pudo copiar', 'Selecciónala y cópiala a mano.'),
    );
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
    const perfilIds = this.perfilesSeleccionados();
    this.api
      .put(`/admin/usuarios/${usuario.id}/perfiles`, { perfilIds })
      .subscribe({
        next: () => {
          this.toast.exito('Perfiles asignados', usuario.nombre);
          this.guardando.set(false);
          this.drawerPerfiles.set(false);
          const elegidos = new Set(perfilIds);
          this.ponerEnLista(usuario.id, {
            perfiles: this.perfiles()
              .filter((p) => elegidos.has(p.id))
              .map((p) => ({ id: p.id, clave: p.clave, nombre: p.nombre }))
              .sort((a, b) => a.nombre.localeCompare(b.nombre)),
          });
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
