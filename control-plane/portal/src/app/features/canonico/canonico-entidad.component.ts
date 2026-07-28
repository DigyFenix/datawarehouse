import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { CanonicoCampo, CanonicoEntidad } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';

const TIPOS = ['text', 'numeric', 'numeric(18,4)', 'date', 'integer', 'boolean'];

@Component({
  selector: 'app-canonico-entidad',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <a routerLink="/canonico" class="volver">← Modelo canónico</a>
        <h2>{{ entidad()?.nombre ?? clave }}</h2>
        <span class="eyebrow">{{ entidad()?.tipo }} · {{ entidad()?.dominio }} · {{ campos().length }} campos</span>
      </div>
      <button (click)="abrirNuevo()">+ Nuevo campo</button>
    </div>

    @if (nuevoAbierto()) {
      <div class="tarjeta caja">
        <div class="fila-form">
          <input [(ngModel)]="ncNombre" placeholder="nombre (ej. limite_credito)" />
          <select [(ngModel)]="ncTipo">@for (t of TIPOS; track t) { <option [value]="t">{{ t }}</option> }</select>
          <label class="chk"><input type="checkbox" [(ngModel)]="ncReq" /> requerido</label>
          <input [(ngModel)]="ncDesc" placeholder="descripción" class="crece" />
          <button class="secundario pequeno" (click)="nuevoAbierto.set(false)">Cancelar</button>
          <button class="pequeno" (click)="crear()">Agregar</button>
        </div>
      </div>
    }

    <div class="tarjeta" style="padding:0;">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Campo</th><th>Tipo</th><th>Requerido</th><th>Descripción</th><th></th></tr></thead>
          <tbody>
            @for (c of campos(); track c.id) {
              <tr>
                <td><code>{{ c.nombre }}</code></td>
                <td (click)="$event.stopPropagation()">
                  <select class="sel" [ngModel]="c.tipo" (ngModelChange)="editar(c, { tipo: $event })">
                    @for (t of TIPOS; track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                </td>
                <td><label class="chk"><input type="checkbox" [checked]="c.requerido" (change)="editar(c, { requerido: !c.requerido })" /></label></td>
                <td><input class="desc-inp" [ngModel]="c.descripcion ?? ''" (blur)="editar(c, { descripcion: $any($event.target).value })" placeholder="—" /></td>
                <td style="text-align:right;"><button class="enlace peligro" (click)="eliminar(c)">Eliminar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5"><div class="vacio"><strong>Sin campos</strong>Agrega el primer campo de esta entidad.</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .titulo-grupo { display:flex; flex-direction:column; gap:2px; }
    .volver { font-size:12.5px; color:var(--brand-600,#2f6b3f); text-decoration:none; }
    .volver:hover { text-decoration:underline; }
    .caja { padding:14px; margin-bottom:16px; }
    .fila-form { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .fila-form input, .fila-form select { padding:6px 10px; border:1px solid var(--border); border-radius:8px; font-size:13px; }
    .fila-form .crece { flex:1; min-width:160px; }
    .chk { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); }
    .sel { padding:4px 8px; border:1px solid var(--border); border-radius:6px; font-size:12.5px; background:var(--surface,#fff); }
    .desc-inp { width:100%; padding:4px 8px; border:1px solid transparent; border-radius:6px; font-size:12.5px; background:transparent; }
    .desc-inp:hover, .desc-inp:focus { border-color:var(--border); background:var(--surface,#fff); }
    .enlace { background:none; border:none; color:var(--brand-600,#2f6b3f); font-size:12.5px; cursor:pointer; padding:2px 6px; }
    .enlace.peligro { color:#a05252; }
    .enlace:hover { text-decoration:underline; }
  `],
})
export class CanonicoEntidadComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly ruta = inject(ActivatedRoute);

  readonly TIPOS = TIPOS;
  readonly entidad = signal<CanonicoEntidad | null>(null);
  readonly campos = signal<CanonicoCampo[]>([]);
  readonly nuevoAbierto = signal(false);
  clave = '';
  ncNombre = ''; ncTipo = 'text'; ncReq = false; ncDesc = '';

  ngOnInit(): void {
    this.clave = this.ruta.snapshot.paramMap.get('clave') ?? '';
    this.api.get<CanonicoEntidad[]>('/canonico/entidades').subscribe({
      next: (d) => this.entidad.set(d.find((e) => e.clave === this.clave) ?? null),
      error: () => {},
    });
    this.cargar();
  }

  cargar(): void {
    this.api.get<CanonicoCampo[]>(`/canonico/campos?entidad=${encodeURIComponent(this.clave)}`).subscribe({
      next: (d) => this.campos.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar los campos', e.message),
    });
  }

  abrirNuevo(): void {
    this.ncNombre = ''; this.ncTipo = 'text'; this.ncReq = false; this.ncDesc = '';
    this.nuevoAbierto.set(true);
  }

  crear(): void {
    const nombre = this.ncNombre.trim();
    if (!nombre) return;
    this.api
      .post<CanonicoCampo>('/canonico/campos', {
        entidadClave: this.clave, nombre, tipo: this.ncTipo, requerido: this.ncReq,
        descripcion: this.ncDesc.trim() || undefined,
      })
      .subscribe({
        next: (c) => {
          this.campos.update((a) => [...a, c]);
          this.nuevoAbierto.set(false);
          this.toast.exito('Campo creado', c.nombre);
        },
        error: (e: Error) => this.toast.error('No se pudo crear el campo', e.message),
      });
  }

  editar(c: CanonicoCampo, cambio: Partial<CanonicoCampo>): void {
    this.api.put<CanonicoCampo>(`/canonico/campos/${c.id}`, cambio).subscribe({
      next: (act) => this.campos.update((a) => a.map((x) => (x.id === c.id ? act : x))),
      error: (e: Error) => this.toast.error('No se pudo actualizar', e.message),
    });
  }

  eliminar(c: CanonicoCampo): void {
    this.api.delete(`/canonico/campos/${c.id}`).subscribe({
      next: () => {
        this.campos.update((a) => a.filter((x) => x.id !== c.id));
        this.toast.exito('Campo eliminado', c.nombre);
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }
}
