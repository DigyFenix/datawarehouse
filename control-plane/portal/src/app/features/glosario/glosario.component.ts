import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { DrawerComponent } from '../../core/drawer.component';
import { nombreDominio } from '../../core/dominios';
import { Metrica, TerminoGlosario } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { PageHeaderComponent } from '../../ui/page-header.component';

interface FormTermino {
  termino: string;
  definicion: string;
  equivaleA: string;
  dominio: string;
}

/**
 * Glosario del PRODUCTO: traduce el vocabulario del negocio a las métricas del
 * catálogo. No depende de la organización activa — lo que se escribe aquí lo
 * ven todas las organizaciones.
 */
@Component({
  selector: 'app-glosario',
  standalone: true,
  imports: [FormsModule, DrawerComponent, PageHeaderComponent, EmptyComponent],
  template: `
    <app-page-header eyebrow="Vocabulario · todas las organizaciones" titulo="Glosario de negocio">
      <button acciones (click)="nuevo()">+ Nuevo término</button>
    </app-page-header>
    <p class="intro">
      El glosario es del producto, no de una organización: cada término que agregues aquí lo
      entiende el asistente en <strong>todas</strong> las organizaciones. Sirve para que
      «cartón», «cliente moroso» o «venta neta» apunten a la métrica certificada correcta.
    </p>

    <div class="barra-lista">
      <input class="buscador" type="search" [(ngModel)]="filtroTexto" (ngModelChange)="filtro.set($event)"
             placeholder="Buscar término, definición o métrica…" aria-label="Buscar en el glosario" />
      <span class="sutil">{{ terminosFiltrados().length }} de {{ terminos().length }}</span>
    </div>

    <div class="tarjeta tarjeta--tabla">
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Término</th><th>Definición</th><th>Equivale a</th><th>Dominio</th><th></th></tr></thead>
          <tbody>
            @for (t of terminosFiltrados(); track t.id) {
              <tr>
                <td><strong>{{ t.termino }}</strong></td>
                <td class="definicion">{{ t.definicion }}</td>
                <td>
                  @if (t.equivaleA) {
                    {{ nombreMetrica(t.equivaleA) }}
                    <br /><code class="sutil">{{ t.equivaleA }}</code>
                  } @else { <span class="sutil">—</span> }
                </td>
                <td>{{ t.dominio ? nombreDominio(t.dominio) : '—' }}</td>
                <td class="col-acciones"><button class="secundario pequeno" (click)="editar(t)">Editar</button></td>
              </tr>
            } @empty {
              <tr><td colspan="5">
                @if (terminos().length) {
                  <app-empty titulo="Ningún término coincide con la búsqueda">Prueba con otra palabra o con el nombre de la métrica.</app-empty>
                } @else {
                  <app-empty titulo="El glosario está vacío">Agrega el primer término con «+ Nuevo término» para que el asistente entienda el vocabulario del negocio.</app-empty>
                }
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (abierto()) {
      <app-drawer [titulo]="edicionId() ? 'Editar término' : 'Nuevo término'" eyebrow="Glosario · todas las organizaciones" (cerrar)="cerrar()">
        <form (ngSubmit)="guardar()">
          <div class="campo">
            <label for="g-termino">Término</label>
            <input id="g-termino" name="termino" [(ngModel)]="form.termino" required placeholder="cartón" [disabled]="!!edicionId()" />
          </div>
          <div class="campo">
            <label for="g-def">Definición</label>
            <textarea id="g-def" name="definicion" rows="3" [(ngModel)]="form.definicion" required></textarea>
          </div>
          <div class="campo">
            <label for="g-equivale">Equivale a <span class="sutil">· métrica del catálogo</span></label>
            <select id="g-equivale" name="equivaleA" [(ngModel)]="form.equivaleA">
              <option value="">Ninguna métrica (solo vocabulario)</option>
              @for (m of metricas(); track m.id) {
                <option [value]="m.clave">{{ m.nombreOficial }} — {{ etiquetaEstado(m.estado) }}</option>
              }
            </select>
            @if (form.equivaleA && !existeMetrica(form.equivaleA)) {
              <span class="aviso">La clave guardada (<code>{{ form.equivaleA }}</code>) ya no está en el catálogo. Elige otra métrica o deja «Ninguna».</span>
            } @else if (!metricas().length) {
              <span class="sutil">Todavía no hay métricas en el catálogo; podrás enlazarla después.</span>
            }
          </div>
          <div class="campo">
            <label for="g-dominio">Dominio <span class="sutil">· opcional</span></label>
            <select id="g-dominio" name="dominio" [(ngModel)]="form.dominio">
              <option value="">Sin dominio</option>
              @for (d of dominios(); track d) { <option [value]="d">{{ nombreDominio(d) }}</option> }
            </select>
          </div>
          @if (errorForm()) { <p class="error">{{ errorForm() }}</p> }
          <div class="acciones-fila">
            <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
            <button type="submit" [disabled]="guardando()" [attr.aria-busy]="guardando()">
              @if (guardando()) { <span class="spinner"></span> }
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </app-drawer>
    }
  `,
  styles: [`
    .barra-lista { display:flex; align-items:center; gap:12px; margin:0 0 10px; }
    .buscador { max-width:420px; }
    .sutil { font-size:11.5px; color:var(--faint); }
    .definicion { color:var(--muted); max-width:420px; }
    .aviso { display:block; margin-top:6px; font-size:12px; color:var(--warn); }
  `],
})
export class GlosarioComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly nombreDominio = nombreDominio;
  readonly terminos = signal<TerminoGlosario[]>([]);
  readonly metricas = signal<Metrica[]>([]);
  readonly filtro = signal('');
  filtroTexto = '';
  readonly abierto = signal(false);
  readonly edicionId = signal<number | null>(null);
  readonly errorForm = signal<string | null>(null);
  readonly guardando = signal(false);

  form: FormTermino = this.vacio();

  private readonly etiquetas: Record<string, string> = {
    borrador: 'borrador',
    en_revision: 'en revisión',
    certificada: 'certificada',
    deprecada: 'deprecada',
    exploratoria: 'exploratoria',
  };

  readonly terminosFiltrados = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    if (!q) return this.terminos();
    return this.terminos().filter((t) =>
      [t.termino, t.definicion, t.equivaleA ?? '', this.nombreMetrica(t.equivaleA ?? ''), t.dominio ?? '']
        .some((v) => v.toLowerCase().includes(q)),
    );
  });

  /**
   * Dominios conocidos: los del producto más los que ya usa el glosario y el del
   * término en edición. Método (no computed) porque `form` es un objeto plano.
   */
  dominios(): string[] {
    const vistos = new Set<string>(['ventas', 'tesoreria', 'compras', 'inventario', 'rentabilidad', 'datos_maestros']);
    for (const t of this.terminos()) if (t.dominio) vistos.add(t.dominio);
    if (this.form.dominio) vistos.add(this.form.dominio);
    return [...vistos].sort((a, b) => nombreDominio(a).localeCompare(nombreDominio(b), 'es'));
  }

  ngOnInit(): void {
    this.cargar();
    this.api.get<Metrica[]>('/metricas').subscribe({
      next: (ms) => this.metricas.set([...ms].sort((a, b) => a.nombreOficial.localeCompare(b.nombreOficial, 'es'))),
      error: (e: Error) => this.toast.error('No se pudo cargar el catálogo de métricas', e.message),
    });
  }

  private vacio(): FormTermino {
    return { termino: '', definicion: '', equivaleA: '', dominio: '' };
  }

  etiquetaEstado(estado: string): string {
    return this.etiquetas[estado] ?? estado;
  }

  nombreMetrica(clave: string): string {
    return this.metricas().find((m) => m.clave === clave)?.nombreOficial ?? clave;
  }

  existeMetrica(clave: string): boolean {
    return this.metricas().some((m) => m.clave === clave);
  }

  cargar(): void {
    this.api.get<TerminoGlosario[]>('/glosario').subscribe({
      next: (d) => this.terminos.set(d),
      error: (e: Error) => this.toast.error('No se pudo cargar el glosario', e.message),
    });
  }

  nuevo(): void {
    this.form = this.vacio();
    this.edicionId.set(null);
    this.errorForm.set(null);
    this.abierto.set(true);
  }

  editar(t: TerminoGlosario): void {
    this.form = { termino: t.termino, definicion: t.definicion, equivaleA: t.equivaleA ?? '', dominio: t.dominio ?? '' };
    this.edicionId.set(t.id);
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
      definicion: this.form.definicion,
      equivaleA: this.form.equivaleA || undefined,
      dominio: this.form.dominio || undefined,
      ...(id ? {} : { termino: this.form.termino }),
    };
    const accion = id
      ? this.api.put<TerminoGlosario>(`/glosario/${id}`, cuerpo)
      : this.api.post<TerminoGlosario>('/glosario', cuerpo);
    accion.subscribe({
      next: (t) => {
        this.toast.exito(
          id ? 'Término actualizado' : 'Término agregado',
          `${t.termino}. El asistente ya lo reconoce en todas las organizaciones.`,
        );
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
