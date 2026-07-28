import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Conexion, Sociedad } from '../../core/modelos';
import { OrganizacionService } from '../../core/organizacion.service';
import { ToastService } from '../../core/toast.service';

interface FormSociedad {
  empresaId: string;
  nombre: string;
  nit: string;
  conexionId: number | null;
  esquemaOrigen: string;
  activo: boolean;
  orden: number;
}

@Component({
  selector: 'app-sociedades',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Plano de datos · configuración</span>
        <h2>Sociedades</h2>
      </div>
      <button (click)="nuevo()">+ Nueva sociedad</button>
    </div>
    <p class="ayuda">Empresas del grupo. Cada una apunta a una conexión y su esquema de origen. Una nueva sociedad en el mismo servidor solo necesita apuntar a la conexión existente.</p>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Sociedad</th><th>empresa_id</th><th>Conexión</th><th>Esquema origen</th><th></th></tr></thead>
          <tbody>
            @for (s of sociedades(); track s.id) {
              <tr>
                <td><strong>{{ s.nombre }}</strong>@if (s.nit) { <br /><span class="sutil">NIT {{ s.nit }}</span> }</td>
                <td><code>{{ s.empresaId }}</code></td>
                <td>{{ nombreConexion(s.conexionId) }}</td>
                <td>@if (s.esquemaOrigen) { <code>{{ s.esquemaOrigen }}</code> } @else { <span style="color:var(--faint);">—</span> }</td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(s)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Sin sociedades</strong>Registra las empresas del grupo.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar sociedad' : 'Nueva sociedad'" eyebrow="Sociedades" (cerrar)="abierto.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="grid2">
            <div class="campo">
              <label>empresa_id (clave)</label>
              <input name="empresaId" [(ngModel)]="form.empresaId" required placeholder="proavisa" [disabled]="!!edicionId()" />
              <span class="sutil">Código corto en minúsculas (letras, dígitos, _). Etiqueta cada fila de datos. El schema HANA (<code>SBOPROAVISA_</code>) va en “Esquema de origen”.</span>
            </div>
            <div class="campo"><label>NIT</label><input name="nit" [(ngModel)]="form.nit" /></div>
          </div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required placeholder="Productos Avícolas, S.A." /></div>
          <div class="grid2">
            <div class="campo"><label>Conexión</label>
              <select name="conexionId" [(ngModel)]="form.conexionId">
                <option [ngValue]="null">— sin asignar —</option>
                @for (c of conexiones(); track c.id) { <option [ngValue]="c.id">{{ c.nombre }}</option> }
              </select>
            </div>
            <div class="campo"><label>Esquema de origen</label><input name="esquemaOrigen" [(ngModel)]="form.esquemaOrigen" placeholder="SBOPROAVISA_" /></div>
          </div>
          <label class="check"><input type="checkbox" name="activo" [(ngModel)]="form.activo" /> Activa</label>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="abierto.set(false)">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .ayuda { margin:-4px 0 16px; font-size:12.5px; color:var(--muted); max-width:720px; }
    .sutil { font-size:11.5px; color:var(--faint); }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .check { display:flex; align-items:center; gap:8px; font-size:13.5px; margin:8px 0; color:var(--muted); }
  `],
})
export class SociedadesComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly orgs = inject(OrganizacionService);

  readonly sociedades = signal<Sociedad[]>([]);
  readonly conexiones = signal<Conexion[]>([]);
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormSociedad = this.vacio();

  constructor() {
    // Sigue a la organización activa de la barra superior.
    effect(() => {
      this.orgs.activaId();
      this.cargar();
    });
  }

  private vacio(): FormSociedad {
    return { empresaId: '', nombre: '', nit: '', conexionId: null, esquemaOrigen: '', activo: true, orden: 0 };
  }

  cargar(): void {
    const organizacionId = this.orgs.activaId();
    if (organizacionId === null) {
      this.sociedades.set([]);
      return;
    }
    this.api.get<Sociedad[]>('/sociedades', { organizacionId }).subscribe({
      next: (d) => this.sociedades.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las sociedades', e.message),
    });
    this.api.get<Conexion[]>('/conexiones').subscribe({
      next: (d) => this.conexiones.set(d),
      error: () => {},
    });
  }

  nombreConexion(id: number | null): string {
    if (id == null) return '— sin asignar —';
    return this.conexiones().find((c) => c.id === id)?.nombre ?? `#${id}`;
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(s: Sociedad): void {
    this.form = {
      empresaId: s.empresaId, nombre: s.nombre, nit: s.nit ?? '', conexionId: s.conexionId,
      esquemaOrigen: s.esquemaOrigen ?? '', activo: s.activo, orden: s.orden,
    };
    this.edicionId.set(s.id);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.form.nombre,
      nit: this.form.nit || undefined,
      conexionId: this.form.conexionId,
      esquemaOrigen: this.form.esquemaOrigen || undefined,
      activo: this.form.activo,
      orden: this.form.orden,
      // La sociedad nace dentro de la organización activa (obligatorio, migración 105).
      ...(id ? {} : { empresaId: this.form.empresaId, organizacionId: this.orgs.exigirId() }),
    };
    const accion = id
      ? this.api.put<Sociedad>(`/sociedades/${id}`, cuerpo)
      : this.api.post<Sociedad>('/sociedades', cuerpo);
    accion.subscribe({
      next: (s) => {
        this.toast.exito(id ? 'Sociedad actualizada' : 'Sociedad creada', s.nombre);
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
