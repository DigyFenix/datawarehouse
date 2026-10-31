import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { nombreDominio } from '../../core/dominios';
import { CanonicoCampo, CanonicoEntidad } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../ui/confirm.service';
import { EmptyComponent } from '../../ui/empty.component';
import { etiquetaTipoEntidad } from './canonico.component';

/** Tipos de dato de un campo canónico con su nombre legible. */
const TIPOS_CAMPO: { clave: string; etiqueta: string }[] = [
  { clave: 'text', etiqueta: 'Texto' },
  { clave: 'numeric', etiqueta: 'Número' },
  { clave: 'numeric(18,4)', etiqueta: 'Monto (4 decimales)' },
  { clave: 'date', etiqueta: 'Fecha' },
  { clave: 'integer', etiqueta: 'Entero' },
  { clave: 'boolean', etiqueta: 'Sí / No' },
];

@Component({
  selector: 'app-canonico-entidad',
  standalone: true,
  imports: [FormsModule, RouterLink, EmptyComponent],
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        <a routerLink="/canonico" class="volver">← Modelo canónico</a>
        <h2>{{ entidad()?.nombre ?? clave }}</h2>
        <span class="eyebrow">
          {{ etiquetaTipo(entidad()?.tipo) }}
          @if (entidad()?.dominio; as d) { · {{ nombreDominio(d) }} }
          · {{ campos().length }} {{ campos().length === 1 ? 'campo' : 'campos' }}
        </span>
      </div>
      <button (click)="abrirNuevo()">+ Nuevo campo</button>
    </div>

    @if (nuevoAbierto()) {
      <form class="tarjeta caja" (ngSubmit)="crear()">
        <div class="grid">
          <div class="campo">
            <label for="nc-nombre">Nombre del campo</label>
            <input id="nc-nombre" name="nombre" [(ngModel)]="ncNombre" required placeholder="limite_credito" autocomplete="off" spellcheck="false" />
            <span class="sutil">En minúsculas y con guion bajo, como se verá en la capa plata.</span>
          </div>
          <div class="campo">
            <label for="nc-tipo">Tipo de dato</label>
            <select id="nc-tipo" name="tipo" [(ngModel)]="ncTipo">
              @for (t of TIPOS; track t.clave) { <option [value]="t.clave">{{ t.etiqueta }}</option> }
            </select>
          </div>
          <div class="campo campo--desc">
            <label for="nc-desc">Descripción <span class="sutil">· opcional</span></label>
            <input id="nc-desc" name="descripcion" [(ngModel)]="ncDesc" placeholder="Qué representa este campo" />
          </div>
        </div>
        <label class="check"><input type="checkbox" name="requerido" [(ngModel)]="ncReq" /> Requerido: toda fila de esta entidad debe traerlo</label>
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="nuevoAbierto.set(false)">Cancelar</button>
          <button type="submit" [disabled]="creando()" [attr.aria-busy]="creando()">
            @if (creando()) { <span class="spinner"></span> }
            {{ creando() ? 'Agregando…' : 'Agregar campo' }}
          </button>
        </div>
      </form>
    }

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Campo</th><th>Tipo</th><th>Requerido</th><th>Descripción</th><th></th></tr></thead>
          <tbody>
            @for (c of campos(); track c.id) {
              <tr>
                <td><code>{{ c.nombre }}</code></td>
                <td>
                  <select class="sel" [ngModel]="c.tipo" (ngModelChange)="editar(c, { tipo: $event })" [attr.aria-label]="'Tipo de ' + c.nombre">
                    @for (t of TIPOS; track t.clave) { <option [value]="t.clave">{{ t.etiqueta }}</option> }
                  </select>
                </td>
                <td><label class="chk"><input type="checkbox" [checked]="c.requerido" (change)="editar(c, { requerido: !c.requerido })" [attr.aria-label]="'Requerido: ' + c.nombre" /></label></td>
                <td><input class="desc-inp" [ngModel]="c.descripcion ?? ''" (blur)="guardarDescripcion(c, $event)" placeholder="—" [attr.aria-label]="'Descripción de ' + c.nombre" /></td>
                <td class="col-acciones"><button class="secundario pequeno peligro" (click)="eliminar(c)">Eliminar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5">
                <app-empty titulo="Esta entidad todavía no tiene campos">Sin campos no hay a qué mapear las columnas del ERP. Agrega el primero con «+ Nuevo campo».</app-empty>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .titulo-grupo { display:flex; flex-direction:column; gap:2px; }
    .volver { font-size:12.5px; color:var(--brand-700); text-decoration:none; }
    .volver:hover { text-decoration:underline; }
    .caja { margin-bottom:16px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .campo--desc { grid-column:1 / -1; }
    .grid .campo { margin-bottom:0; }
    .sutil { font-size:11.5px; color:var(--faint); }
    .chk { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); }
    .sel { min-height:32px; padding:4px 28px 4px 8px; font-size:12.5px; width:auto; }
    .desc-inp { min-height:32px; padding:4px 8px; border-color:transparent; font-size:12.5px; background:transparent; }
    .desc-inp:hover, .desc-inp:focus { border-color:var(--border-2); background:var(--surface); }
    @media (max-width: 720px) { .grid { grid-template-columns:1fr; } }
  `],
})
export class CanonicoEntidadComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirmar = inject(ConfirmService);
  private readonly ruta = inject(ActivatedRoute);

  readonly TIPOS = TIPOS_CAMPO;
  readonly nombreDominio = nombreDominio;
  readonly etiquetaTipo = etiquetaTipoEntidad;
  readonly entidad = signal<CanonicoEntidad | null>(null);
  readonly campos = signal<CanonicoCampo[]>([]);
  readonly nuevoAbierto = signal(false);
  readonly creando = signal(false);
  readonly errorForm = signal<string | null>(null);
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
    this.errorForm.set(null);
    this.nuevoAbierto.set(true);
  }

  crear(): void {
    const nombre = this.ncNombre.trim();
    if (!nombre) {
      this.errorForm.set('El nombre del campo es obligatorio.');
      return;
    }
    this.errorForm.set(null);
    this.creando.set(true);
    this.api
      .post<CanonicoCampo>('/canonico/campos', {
        entidadClave: this.clave, nombre, tipo: this.ncTipo, requerido: this.ncReq,
        descripcion: this.ncDesc.trim() || undefined,
      })
      .subscribe({
        next: (c) => {
          this.creando.set(false);
          this.campos.update((a) => [...a, c]);
          this.nuevoAbierto.set(false);
          this.toast.exito('Campo creado', `${c.nombre}. Ya aparece como destino en «Mapea a» de la pantalla de Campos.`);
        },
        error: (e: Error) => {
          this.creando.set(false);
          this.errorForm.set(e.message);
        },
      });
  }

  guardarDescripcion(c: CanonicoCampo, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value.trim();
    if (valor === (c.descripcion ?? '')) return;
    this.editar(c, { descripcion: valor });
  }

  editar(c: CanonicoCampo, cambio: Partial<CanonicoCampo>): void {
    this.api.put<CanonicoCampo>(`/canonico/campos/${c.id}`, cambio).subscribe({
      next: (act) => this.campos.update((a) => a.map((x) => (x.id === c.id ? act : x))),
      error: (e: Error) => this.toast.error('No se pudo actualizar', e.message),
    });
  }

  async eliminar(c: CanonicoCampo): Promise<void> {
    const ok = await this.confirmar.confirmar({
      titulo: `Eliminar el campo «${c.nombre}»`,
      mensaje: 'Las columnas del ERP que estaban mapeadas a este campo quedarán sin destino en la capa plata. Esta acción no se puede deshacer.',
      textoConfirmar: 'Eliminar campo',
      peligro: true,
    });
    if (!ok) return;
    this.api.delete(`/canonico/campos/${c.id}`).subscribe({
      next: () => {
        this.campos.update((a) => a.filter((x) => x.id !== c.id));
        this.toast.exito('Campo eliminado', c.nombre);
      },
      error: (e: Error) => this.toast.error('No se pudo eliminar', e.message),
    });
  }
}
