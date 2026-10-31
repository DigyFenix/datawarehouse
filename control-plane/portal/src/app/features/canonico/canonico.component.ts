import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { nombreDominio } from '../../core/dominios';
import { CanonicoCampo, CanonicoEntidad } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { PageHeaderComponent } from '../../ui/page-header.component';

/** Tipos de entidad canónica con su nombre legible (la clave no se muestra sola). */
export const TIPOS_ENTIDAD: { clave: string; etiqueta: string }[] = [
  { clave: 'dimension', etiqueta: 'Dimensión (catálogo)' },
  { clave: 'hecho_cabecera', etiqueta: 'Hecho · cabecera' },
  { clave: 'hecho_linea', etiqueta: 'Hecho · línea' },
];

export function etiquetaTipoEntidad(clave: string | undefined | null): string {
  return TIPOS_ENTIDAD.find((t) => t.clave === clave)?.etiqueta ?? (clave ?? '');
}

interface FormEntidad {
  clave: string;
  nombre: string;
  dominio: string;
  tipo: string;
}

@Component({
  selector: 'app-canonico',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, EmptyComponent],
  template: `
    <app-page-header eyebrow="Plano de datos · capa plata" titulo="Modelo canónico">
      <button acciones (click)="alternarAlta()">{{ nuevaAbierta() ? 'Cerrar' : '+ Nueva entidad' }}</button>
    </app-page-header>
    <p class="ayuda">El destino agnóstico del mapeo (capa plata). Entra a una entidad para configurar sus campos.</p>

    @if (nuevaAbierta()) {
      <form class="tarjeta caja" (ngSubmit)="crearEntidad()">
        <div class="grid4">
          <div class="campo">
            <label for="ne-nombre">Nombre</label>
            <input id="ne-nombre" name="nombre" [(ngModel)]="ne.nombre" (ngModelChange)="alCambiarNombre()" required placeholder="Proveedor" />
          </div>
          <div class="campo">
            <label for="ne-clave">Clave</label>
            <input id="ne-clave" name="clave" [(ngModel)]="ne.clave" (ngModelChange)="claveTocada = true" required placeholder="proveedor" />
            <span class="sutil">Se genera del nombre; puedes ajustarla.</span>
          </div>
          <div class="campo">
            <label for="ne-dominio">Dominio</label>
            <input id="ne-dominio" name="dominio" [(ngModel)]="ne.dominio" required placeholder="compras" list="dominios-conocidos" />
            <datalist id="dominios-conocidos">
              @for (d of dominiosConocidos(); track d) { <option [value]="d">{{ nombreDominio(d) }}</option> }
            </datalist>
          </div>
          <div class="campo">
            <label for="ne-tipo">Tipo</label>
            <select id="ne-tipo" name="tipo" [(ngModel)]="ne.tipo">
              @for (t of TIPOS; track t.clave) { <option [value]="t.clave">{{ t.etiqueta }}</option> }
            </select>
          </div>
        </div>
        @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="nuevaAbierta.set(false)">Cancelar</button>
          <button type="submit" [disabled]="creando()" [attr.aria-busy]="creando()">
            @if (creando()) { <span class="spinner"></span> }
            {{ creando() ? 'Creando…' : 'Crear entidad' }}
          </button>
        </div>
      </form>
    }

    <div class="barra-lista">
      <input class="buscador" type="search" [(ngModel)]="filtroTexto" (ngModelChange)="filtro.set($event)"
             placeholder="Buscar entidad por nombre, clave o dominio…" aria-label="Buscar entidad" />
      <span class="sutil">{{ entidadesFiltradas().length }} de {{ entidades().length }}</span>
    </div>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Entidad</th><th>Tipo</th><th>Dominio</th><th>Campos</th><th></th></tr></thead>
          <tbody>
            @for (e of entidadesFiltradas(); track e.id) {
              <tr>
                <td><strong>{{ e.nombre }}</strong><br /><code>{{ e.clave }}</code></td>
                <td>{{ etiquetaTipo(e.tipo) }}</td>
                <td>{{ nombreDominio(e.dominio) }}</td>
                <td>{{ conteo(e.clave) }}</td>
                <td class="col-acciones"><a class="secundario pequeno" [routerLink]="['/canonico', e.clave]">Configurar</a></td>
              </tr>
            } @empty {
              <tr><td colspan="5">
                @if (entidades().length) {
                  <app-empty titulo="Ninguna entidad coincide con la búsqueda">Prueba con otro nombre, clave o dominio.</app-empty>
                } @else {
                  <app-empty titulo="Todavía no hay entidades canónicas">Sin entidades no hay a qué mapear las columnas del ERP. Crea la primera con «+ Nueva entidad».</app-empty>
                }
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .ayuda { margin:-4px 0 16px; font-size:12.5px; color:var(--muted); max-width:760px; }
    .caja { margin-bottom:16px; }
    .grid4 { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; }
    .grid4 .campo { margin-bottom:0; }
    .sutil { font-size:11.5px; color:var(--faint); }
    .barra-lista { display:flex; align-items:center; gap:12px; margin:0 0 10px; }
    .buscador { max-width:420px; }
    @media (max-width: 900px) { .grid4 { grid-template-columns:1fr 1fr; } }
  `],
})
export class CanonicoComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly TIPOS = TIPOS_ENTIDAD;
  readonly nombreDominio = nombreDominio;
  readonly etiquetaTipo = etiquetaTipoEntidad;
  readonly entidades = signal<CanonicoEntidad[]>([]);
  readonly campos = signal<CanonicoCampo[]>([]);
  readonly nuevaAbierta = signal(false);
  readonly creando = signal(false);
  readonly errorForm = signal<string | null>(null);
  readonly filtro = signal('');
  filtroTexto = '';
  claveTocada = false;

  ne: FormEntidad = this.vacio();

  readonly conteoPorEntidad = computed(() => {
    const m = new Map<string, number>();
    for (const c of this.campos()) m.set(c.entidadClave, (m.get(c.entidadClave) ?? 0) + 1);
    return m;
  });

  readonly dominiosConocidos = computed(() =>
    [...new Set(this.entidades().map((e) => e.dominio).filter(Boolean))].sort(),
  );

  readonly entidadesFiltradas = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    if (!q) return this.entidades();
    return this.entidades().filter((e) =>
      [e.nombre, e.clave, e.dominio, nombreDominio(e.dominio), etiquetaTipoEntidad(e.tipo)].some((v) => v.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    this.api.get<CanonicoEntidad[]>('/canonico/entidades').subscribe({
      next: (d) => this.entidades.set(d),
      error: (e: Error) => this.toast.error('No se pudieron cargar las entidades', e.message),
    });
    this.api.get<CanonicoCampo[]>('/canonico/campos').subscribe({
      next: (d) => this.campos.set(d),
      error: () => {},
    });
  }

  private vacio(): FormEntidad {
    return { clave: '', nombre: '', dominio: '', tipo: 'dimension' };
  }

  private slug(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }

  alCambiarNombre(): void {
    if (this.claveTocada) return;
    this.ne.clave = this.slug(this.ne.nombre);
  }

  alternarAlta(): void {
    if (!this.nuevaAbierta()) {
      this.ne = this.vacio();
      this.claveTocada = false;
      this.errorForm.set(null);
    }
    this.nuevaAbierta.set(!this.nuevaAbierta());
  }

  conteo(entidad: string): string {
    const n = this.conteoPorEntidad().get(entidad) ?? 0;
    return `${n} campo${n === 1 ? '' : 's'}`;
  }

  crearEntidad(): void {
    const cuerpo = {
      clave: this.ne.clave.trim(), nombre: this.ne.nombre.trim(),
      dominio: this.ne.dominio.trim(), tipo: this.ne.tipo,
    };
    if (!cuerpo.clave || !cuerpo.nombre || !cuerpo.dominio) {
      this.errorForm.set('Nombre, clave y dominio son obligatorios.');
      return;
    }
    this.errorForm.set(null);
    this.creando.set(true);
    this.api.post<CanonicoEntidad>('/canonico/entidades', cuerpo).subscribe({
      next: (e) => {
        this.creando.set(false);
        this.entidades.update((a) => [...a, e].sort((x, y) => x.clave.localeCompare(y.clave)));
        this.nuevaAbierta.set(false);
        this.ne = this.vacio();
        this.toast.exito('Entidad canónica creada', `${e.nombre}. Siguiente paso: entra a «Configurar» para definir sus campos.`);
      },
      error: (er: Error) => {
        this.creando.set(false);
        this.errorForm.set(er.message);
      },
    });
  }
}
