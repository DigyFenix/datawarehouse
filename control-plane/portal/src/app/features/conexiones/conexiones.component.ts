import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Conexion, Entorno } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

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

@Component({
  selector: 'app-conexiones',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Plano de datos · configuración</span>
        <h2>Conexiones a orígenes</h2>
      </div>
      <button (click)="nuevo()">+ Nueva conexión</button>
    </div>
    <p class="ayuda">Servidores de origen (SAP B1 HANA/SQL Server, Odoo). Cada sociedad apunta a una conexión. La credencial vive en el <code>.env</code>/secrets — aquí solo su referencia.</p>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Conexión</th><th>Entorno</th><th>Host</th><th>Secreto</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (c of conexiones(); track c.id) {
              <tr>
                <td><strong>{{ c.nombre }}</strong></td>
                <td>{{ nombreEntorno(c.entornoClave) }}</td>
                <td><code>{{ c.host }}:{{ c.puerto }}</code></td>
                <td><code>{{ c.secretoRef }}</code></td>
                <td>{{ c.activo ? 'activa' : 'inactiva' }}</td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(c)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="vacio"><strong>Sin conexiones</strong>Crea la conexión a tu servidor de origen para empezar.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar conexión' : 'Nueva conexión'" eyebrow="Conexiones" (cerrar)="abierto.set(false)">
        <form (ngSubmit)="guardar()">
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required placeholder="HANA Servidor Principal" /></div>
          <div class="campo"><label>Entorno de ejecución</label>
            <select name="entornoClave" [(ngModel)]="form.entornoClave" (ngModelChange)="onEntorno()" required>
              <option value="" disabled>Elige…</option>
              @for (e of entornos(); track e.id) { <option [value]="e.clave">{{ e.nombre }}</option> }
            </select>
          </div>
          <div class="grid2">
            <div class="campo"><label>Host</label><input name="host" [(ngModel)]="form.host" required placeholder="10.0.0.10 / hana.midominio.com" /></div>
            <div class="campo"><label>Puerto</label><input type="number" name="puerto" [(ngModel)]="form.puerto" required /></div>
          </div>
          <div class="grid2">
            <div class="campo"><label>Base de datos (opcional)</label><input name="baseDatos" [(ngModel)]="form.baseDatos" placeholder="catálogo por defecto" /></div>
            <div class="campo"><label>Referencia del secreto</label><input name="secretoRef" [(ngModel)]="form.secretoRef" required placeholder="HANA_PRINCIPAL" /></div>
          </div>
          <p class="sutil">La credencial real (<code>{{ form.secretoRef || 'REF' }}_USER</code> / <code>_PASSWORD</code>) va en el <code>.env</code>, nunca aquí.</p>
          <div class="campo"><label>Notas</label><input name="notas" [(ngModel)]="form.notas" /></div>
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
    .sutil { font-size:11.5px; color:var(--faint); margin:2px 0 8px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .check { display:flex; align-items:center; gap:8px; font-size:13.5px; margin:8px 0; color:var(--muted); }
  `],
})
export class ConexionesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly conexiones = signal<Conexion[]>([]);
  readonly entornos = signal<Entorno[]>([]);
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormConexion = this.vacio();

  ngOnInit(): void {
    this.cargar();
  }

  private vacio(): FormConexion {
    return { nombre: '', entornoClave: '', host: '', puerto: null, baseDatos: '', secretoRef: '', notas: '', activo: true };
  }

  cargar(): void {
    this.api.get<Conexion[]>('/conexiones').subscribe({
      next: (d) => this.conexiones.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las conexiones', e.message),
    });
    this.api.get<Entorno[]>('/entornos').subscribe({
      next: (d) => this.entornos.set(d),
      error: () => {},
    });
  }

  nombreEntorno(clave: string): string {
    return this.entornos().find((e) => e.clave === clave)?.nombre ?? clave;
  }

  onEntorno(): void {
    const e = this.entornos().find((x) => x.clave === this.form.entornoClave);
    if (e?.puertoDefault && !this.form.puerto) this.form.puerto = e.puertoDefault;
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

  guardar(): void {
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
    };
    const accion = id
      ? this.api.put<Conexion>(`/conexiones/${id}`, cuerpo)
      : this.api.post<Conexion>('/conexiones', cuerpo);
    accion.subscribe({
      next: (c) => {
        this.toast.exito(id ? 'Conexión actualizada' : 'Conexión creada', c.nombre);
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
