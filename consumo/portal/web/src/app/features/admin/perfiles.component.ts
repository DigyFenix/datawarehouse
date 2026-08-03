import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { AlcancePerfil, PerfilOrg, TableroAdmin } from '../../core/modelos';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

interface FormPerfil {
  clave: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

/**
 * Perfiles de acceso de la organización: qué tableros ve cada perfil y — para
 * el chatbot futuro — qué dominios/métricas podrá consultar (alcances).
 */
@Component({
  selector: 'app-admin-perfiles',
  standalone: true,
  imports: [FormsModule, DrawerComponent, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Administración</span>
        <h2>Perfiles</h2>
      </div>
      <button (click)="nuevo()">+ Nuevo perfil</button>
    </div>
    <nav class="tabs">
      <a [routerLink]="['/', tenant.hash(), 'admin', 'usuarios']" class="tab">Usuarios</a>
      <a [routerLink]="['/', tenant.hash(), 'admin', 'perfiles']" class="tab activo">Perfiles</a>
      <a [routerLink]="['/', tenant.hash(), 'admin', 'auditoria']" class="tab">Auditoría</a>
    </nav>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Perfil</th><th>Tableros</th><th>Alcances (chatbot)</th><th>Usuarios</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (p of perfiles(); track p.id) {
              <tr>
                <td><strong>{{ p.nombre }}</strong><br /><code class="sutil">{{ p.clave }}</code></td>
                <td>{{ p.tableroIds.length }}</td>
                <td>
                  @for (a of p.alcances; track a.recursoTipo + a.recursoClave) {
                    <span class="chip">{{ a.recursoTipo }}: {{ a.recursoClave }}</span>
                  }
                  @if (!p.alcances.length) { <span class="sutil">—</span> }
                </td>
                <td>{{ p.usuarios }}</td>
                <td>@if (p.activo) { <span class="ok">activo</span> } @else { <span class="sutil">inactivo</span> }</td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="secundario pequeno" (click)="editar(p)">Editar</button>
                  <button class="secundario pequeno" (click)="abrirTableros(p)">Tableros</button>
                  <button class="secundario pequeno" (click)="abrirAlcances(p)">Alcances</button>
                  <button class="secundario pequeno" (click)="eliminar(p)">Eliminar</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="vacio"><strong>Sin perfiles</strong>Crea perfiles (gerencia, finanzas, ventas…) y asígnales tableros.</div></td></tr>
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
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }

    @if (drawerTableros()) {
      <app-drawer titulo="Tableros del perfil" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerTableros.set(false)">
        <p class="ayuda">Los usuarios con este perfil verán estos tableros.</p>
        @for (t of tableros(); track t.id) {
          <label class="check">
            <input type="checkbox" [checked]="tablerosSeleccionados().includes(t.id)" (change)="alternarTablero(t.id)" [disabled]="!t.activo" />
            {{ t.nombre }} @if (!t.activo) { <span class="sutil">(inactivo)</span> }
          </label>
        } @empty {
          <p class="sutil">El proveedor aún no ha dado de alta tableros para tu organización.</p>
        }
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="drawerTableros.set(false)">Cancelar</button>
          <button (click)="guardarTableros()" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </app-drawer>
    }

    @if (drawerAlcances()) {
      <app-drawer titulo="Alcances del perfil (chatbot)" [eyebrow]="seleccionado()?.nombre ?? ''" (cerrar)="drawerAlcances.set(false)">
        <p class="ayuda">
          Preparación del chatbot: define qué dominios o métricas podrá consultar este perfil
          cuando el módulo entre en funcionamiento. Usa <code>*</code> para todo el tipo.
        </p>
        @for (a of alcancesEdicion(); track $index) {
          <div class="fila-alcance">
            <select [ngModel]="a.recursoTipo" (ngModelChange)="actualizarAlcance($index, 'recursoTipo', $event)" name="tipo-{{ $index }}">
              <option value="dominio">dominio</option>
              <option value="metrica">métrica</option>
            </select>
            <input [ngModel]="a.recursoClave" (ngModelChange)="actualizarAlcance($index, 'recursoClave', $event)" name="clave-{{ $index }}" placeholder="ventas | ventas_netas | *" />
            <button type="button" class="secundario pequeno" (click)="quitarAlcance($index)">✕</button>
          </div>
        }
        <button type="button" class="secundario pequeno" (click)="agregarAlcance()">+ Agregar alcance</button>
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="drawerAlcances.set(false)">Cancelar</button>
          <button (click)="guardarAlcances()" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin: 0 0 12px; font-size: 12.5px; color: var(--muted); }
    .sutil { font-size: 11.5px; color: var(--faint); }
    .check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; margin: 8px 0; color: var(--muted); }
    .chip { display: inline-block; background: var(--brand-100); color: var(--brand-700); border-radius: 999px; padding: 2px 9px; font-size: 11.5px; margin: 1px 3px 1px 0; }
    .ok { color: var(--ok); }
    .tabs { display: flex; gap: 4px; margin: 0 0 16px; border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 14px; text-decoration: none; color: var(--muted); font-size: 13.5px; border-bottom: 2px solid transparent; }
    .tab.activo { color: var(--text); border-bottom-color: var(--brand-600); font-weight: 600; }
    .fila-alcance { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center; }
  `],
})
export class PerfilesComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly perfiles = signal<PerfilOrg[]>([]);
  readonly tableros = signal<TableroAdmin[]>([]);
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
    this.api.get<PerfilOrg[]>('/admin/perfiles').subscribe({
      next: (d) => this.perfiles.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los perfiles', e.message),
    });
    this.api.get<TableroAdmin[]>('/admin/tableros').subscribe({
      next: (d) => this.tableros.set(d),
      error: () => {},
    });
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

  eliminar(p: PerfilOrg): void {
    if (!confirm(`¿Eliminar el perfil "${p.nombre}"? Sus ${p.usuarios} usuario(s) perderán los tableros asignados por él.`)) return;
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
