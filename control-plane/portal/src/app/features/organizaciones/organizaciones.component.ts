import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { Organizacion } from '../../core/modelos';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';

interface FormOrg {
  codigo: string;
  nombre: string;
  sector: string;
  erpTipo: string;
  estado: string;
  colorMarca: string;
}

@Component({
  selector: 'app-organizaciones',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <span class="eyebrow">Tenants</span>
        <h2>Organizaciones</h2>
      </div>
      <button (click)="nuevo()">+ Nueva organización</button>
    </div>

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr><th>Código</th><th>Nombre</th><th>ERP</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            @for (o of orgs(); track o.id) {
              <tr>
                <td><code>{{ o.codigo }}</code></td>
                <td>{{ o.nombre }}</td>
                <td><span class="badge badge--pill">{{ o.erpTipo }}</span></td>
                <td><span class="badge badge--{{ o.estado }}">{{ o.estado }}</span></td>
                <td style="text-align:right;"><button class="secundario pequeno" (click)="editar(o)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Sin organizaciones</strong>Registra la primera con “Nueva organización”.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar organización' : 'Nueva organización'"
                  [eyebrow]="edicionId() ? form.codigo : 'Tenant'" (cerrar)="cerrar()">
        <form (ngSubmit)="guardar()">
          <div class="campo">
            <label>Código</label>
            <input name="codigo" [(ngModel)]="form.codigo" required placeholder="grupocresta" [disabled]="!!edicionId()" />
          </div>
          <div class="campo"><label>Nombre</label><input name="nombre" [(ngModel)]="form.nombre" required /></div>
          <div class="campo"><label>Sector</label><input name="sector" [(ngModel)]="form.sector" /></div>
          <div class="campo">
            <label>ERP de origen</label>
            <select name="erpTipo" [(ngModel)]="form.erpTipo">
              <option value="sap_b1">SAP Business One</option>
              <option value="odoo">Odoo</option>
            </select>
          </div>
          @if (edicionId()) {
            <div class="campo">
              <label>Estado</label>
              <select name="estado" [(ngModel)]="form.estado">
                <option value="en_arranque">En arranque</option>
                <option value="activa">Activa</option>
                <option value="inactiva">Inactiva</option>
              </select>
            </div>
          }
          <div class="campo">
            <label>Color de marca <span style="font-weight:400;color:var(--faint);">· tiñe el portal</span></label>
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="color" name="colorMarca" [(ngModel)]="form.colorMarca" style="width:46px; height:38px; padding:2px; cursor:pointer;" />
              <input name="colorMarcaHex" [(ngModel)]="form.colorMarca" placeholder="#2d5aa0" style="max-width:130px; font-family:var(--mono);" />
              <button type="button" class="secundario pequeno" (click)="form.colorMarca=''">Default</button>
              <span [style.background]="form.colorMarca || '#2d5aa0'" style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-2);display:inline-block;"></span>
            </div>
          </div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
            <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-drawer>
    }
  `,
})
export class OrganizacionesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly tema = inject(ThemeService);

  readonly orgs = signal<Organizacion[]>([]);
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormOrg = this.vacio();

  ngOnInit(): void {
    this.cargar();
  }

  private vacio(): FormOrg {
    return { codigo: '', nombre: '', sector: '', erpTipo: 'sap_b1', estado: 'en_arranque', colorMarca: '' };
  }

  cargar(): void {
    this.api.get<Organizacion[]>('/organizaciones').subscribe({
      next: (d) => this.orgs.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las organizaciones', e.message),
    });
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(o: Organizacion): void {
    this.form = { codigo: o.codigo, nombre: o.nombre, sector: o.sector ?? '', erpTipo: o.erpTipo, estado: o.estado, colorMarca: o.colorMarca ?? '' };
    this.edicionId.set(o.id);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  guardar(): void {
    this.errorForm.set(null);
    this.guardando.set(true);
    const id = this.edicionId();
    const cuerpo = {
      nombre: this.form.nombre,
      sector: this.form.sector || undefined,
      erpTipo: this.form.erpTipo,
      colorMarca: this.form.colorMarca || null,
      ...(id ? { estado: this.form.estado } : { codigo: this.form.codigo }),
    };
    const accion = id
      ? this.api.put<Organizacion>(`/organizaciones/${id}`, cuerpo)
      : this.api.post<Organizacion>('/organizaciones', cuerpo);
    accion.subscribe({
      next: (o) => {
        this.toast.exito(id ? 'Organización actualizada' : 'Organización creada', o.nombre);
        // Si es la organización primaria, aplica su color al portal al instante.
        if (this.orgs()[0]?.id === o.id || this.orgs().length === 0) this.tema.aplicar(o.colorMarca ?? null);
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
