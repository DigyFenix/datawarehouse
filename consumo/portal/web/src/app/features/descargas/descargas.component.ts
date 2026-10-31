import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { nombreDominio } from '../../core/dominios';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { EmptyComponent } from '../../ui/empty.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SkeletonComponent } from '../../ui/skeleton.component';

interface MetricaDescargable {
  clave: string;
  nombre: string;
  dominio: string;
  estado: 'certificada' | 'exploratoria';
  definicion: string;
  dimensiones: string[];
  periodoDesde: string | null;
  periodoHasta: string | null;
  derivada: boolean;
}

interface CatalogoDescargas {
  modulos: { dominio: string; metricas: MetricaDescargable[] }[];
  empresas: { id: string; nombre: string }[];
  frescura: { dominio: string; fechaDatoMasReciente: string | null }[];
  proximaCarga: string | null;
}

type Nivel = 'mensual' | 'mensual_empresa' | 'mensual_dimension' | 'dimension_total' | 'aging_rango' | 'aging_socio';

const NIVELES: { clave: Nivel; nombre: string; detalle: string }[] = [
  { clave: 'mensual', nombre: 'Por mes', detalle: 'Una fila por mes, sumando las empresas de tu alcance.' },
  { clave: 'mensual_empresa', nombre: 'Por mes y empresa', detalle: 'Una fila por mes y empresa.' },
  { clave: 'dimension_total', nombre: 'Por miembro (total del período)', detalle: 'Una fila por cliente, producto, vendedor… con la suma del rango elegido.' },
  { clave: 'mensual_dimension', nombre: 'Por mes y miembro (máximo detalle)', detalle: 'Una fila por mes y por cliente, producto, vendedor…' },
  { clave: 'aging_rango', nombre: 'Cartera: por antigüedad', detalle: 'Saldo por rango de vencimiento al último corte.' },
  { clave: 'aging_socio', nombre: 'Cartera: por socio y antigüedad', detalle: 'Todos los socios con saldo, por rango, al último corte.' },
];

const NOMBRE_DIMENSION: Record<string, string> = {
  cliente: 'Cliente', producto: 'Producto', linea: 'Línea', vendedor: 'Vendedor', canal: 'Canal', sector: 'Sector', proveedor: 'Proveedor',
};

/**
 * Descargas autoservicio a Excel. El usuario elige módulo, métricas, nivel de detalle,
 * período y empresa; el API arma el .xlsx desde la capa semántica (métricas del catálogo,
 * RLS por empresa) y lo entrega con una hoja de ficha que explica cada dato. Nunca sale
 * un hecho crudo ni nada fuera de su alcance.
 */
@Component({
  selector: 'app-descargas',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, SkeletonComponent, EmptyComponent, IconComponent],
  template: `
    <app-page-header eyebrow="Autoservicio" titulo="Descargas a Excel"></app-page-header>

    <p class="intro">
      Arma tu tabulado con las métricas gobernadas de tu alcance y descárgalo en Excel. Cada archivo
      lleva una hoja «Ficha» con la definición, el estado de certificación, el período y la frescura
      de cada dato.
      @if (catalogo()?.proximaCarga; as pc) { <span class="sutil">Próxima actualización de datos {{ pc }}.</span> }
    </p>

    @if (cargando()) {
      <div class="pasos"><app-skeleton variante="tarjeta" [alto]="120" /><app-skeleton variante="tarjeta" [alto]="220" /></div>
    } @else if (!catalogo() || catalogo()!.modulos.length === 0) {
      <div class="tarjeta vacio-caja">
        <app-empty titulo="No tienes métricas descargables">
          Tu perfil no tiene métricas autorizadas. Pide acceso al administrador de tu organización.
        </app-empty>
      </div>
    } @else {
      <div class="pasos">
        <!-- 1. Módulo -->
        <section class="tarjeta paso">
          <h3><span class="num">1</span> Módulo</h3>
          <div class="chips">
            @for (m of catalogo()!.modulos; track m.dominio) {
              <button type="button" class="chip" [class.chip--activo]="modulo() === m.dominio" (click)="elegirModulo(m.dominio)">
                {{ nombreDominio(m.dominio) }} <span class="chip__n">{{ m.metricas.length }}</span>
              </button>
            }
          </div>
        </section>

        <!-- 2. Métricas -->
        @if (metricasDelModulo().length) {
          <section class="tarjeta paso">
            <h3><span class="num">2</span> Métricas <span class="sutil">(hasta 10, una hoja por métrica)</span></h3>
            <ul class="metricas">
              @for (m of metricasDelModulo(); track m.clave) {
                <li>
                  <label class="metrica" [class.metrica--off]="!compatible(m)">
                    <input type="checkbox" [checked]="seleccion().has(m.clave)" (change)="alternar(m.clave)" [disabled]="!compatible(m)" />
                    <span class="metrica__txt">
                      <strong>{{ m.nombre }}</strong>
                      <span class="badge" [class.badge--certificada]="m.estado === 'certificada'" [class.badge--exploratoria]="m.estado === 'exploratoria'">{{ m.estado === 'certificada' ? 'Certificada' : 'Exploratoria' }}</span>
                      <span class="sutil">{{ m.definicion }}</span>
                      <span class="sutil mono">
                        @if (m.periodoDesde) { datos {{ m.periodoDesde }} a {{ m.periodoHasta }} } @else { sin datos aún }
                        @if (m.dimensiones.length) { · desglosable por {{ nombresDimensiones(m.dimensiones) }} }
                        @if (m.derivada) { · indicador compuesto: solo por mes }
                      </span>
                    </span>
                  </label>
                </li>
              }
            </ul>
          </section>
        }

        <!-- 3. Detalle -->
        @if (seleccion().size) {
          <section class="tarjeta paso">
            <h3><span class="num">3</span> Nivel de detalle</h3>
            <div class="niveles">
              @for (n of nivelesDisponibles(); track n.clave) {
                <label class="nivel" [class.nivel--activo]="nivel() === n.clave">
                  <input type="radio" name="nivel" [value]="n.clave" [checked]="nivel() === n.clave" (change)="nivel.set(n.clave)" />
                  <span><strong>{{ n.nombre }}</strong><span class="sutil">{{ n.detalle }}</span></span>
                </label>
              }
            </div>
            @if (pideDimension()) {
              <div class="campo campo--inline">
                <label for="dimension">Desglosar por</label>
                <select id="dimension" [ngModel]="dimension()" (ngModelChange)="dimension.set($event)">
                  <option value="">Elige…</option>
                  @for (d of dimensionesComunes(); track d) { <option [value]="d">{{ nombreDimension(d) }}</option> }
                </select>
                @if (dimensionesComunes().length === 0) { <span class="error">Las métricas elegidas no comparten ninguna dimensión; elige menos métricas.</span> }
              </div>
            }
          </section>

          <!-- 4. Período y empresa -->
          <section class="tarjeta paso">
            <h3><span class="num">4</span> Período y empresa</h3>
            <div class="fila">
              @if (!esAging()) {
                <div class="campo campo--inline">
                  <label for="desde">Desde (mes)</label>
                  <input id="desde" type="month" [ngModel]="desde()" (ngModelChange)="desde.set($event)" />
                </div>
                <div class="campo campo--inline">
                  <label for="hasta">Hasta (mes)</label>
                  <input id="hasta" type="month" [ngModel]="hasta()" (ngModelChange)="hasta.set($event)" />
                </div>
                <button type="button" class="pequeno secundario" (click)="esteAnio()">Este año</button>
                <button type="button" class="pequeno secundario" (click)="ultimos12()">Últimos 12 meses</button>
              } @else {
                <p class="sutil">La cartera es una foto al último corte: no lleva período.</p>
              }
              @if (catalogo()!.empresas.length > 1) {
                <div class="campo campo--inline">
                  <label for="empresa">Empresa</label>
                  <select id="empresa" [ngModel]="empresa()" (ngModelChange)="empresa.set($event)">
                    <option value="">Todas las de mi alcance</option>
                    @for (e of catalogo()!.empresas; track e.id) { <option [value]="e.id">{{ e.nombre }}</option> }
                  </select>
                </div>
              }
            </div>
          </section>

          <div class="accion">
            <button type="button" (click)="descargar()" [disabled]="!puedeDescargar() || descargando()">
              <app-icon name="descargar" [size]="15" /> {{ descargando() ? 'Preparando…' : 'Descargar Excel' }}
            </button>
            <span class="sutil">{{ resumenSeleccion() }}</span>
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
        }
      </div>
    }
  `,
  styles: [`
    .intro { color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; max-width: 820px; margin: 0 0 var(--sp-4); }
    .pasos { display: flex; flex-direction: column; gap: var(--sp-3); }
    .paso { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); }
    .paso h3 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: var(--fs-base); }
    .num { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--brand-600); color: #fff; font-size: 12px; font-weight: 700; }
    .sutil { font-size: var(--fs-xs); color: var(--muted); font-weight: 400; }
    .mono { font-family: var(--sans); font-variant-numeric: tabular-nums; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 8px; background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 999px; padding: 6px 14px; font-size: var(--fs-sm); }
    .chip:hover { background: var(--surface-2); border-color: var(--brand-500); }
    .chip--activo { background: var(--brand-600); color: #fff; border-color: var(--brand-600); }
    .chip__n { font-family: var(--sans); font-variant-numeric: tabular-nums; font-size: var(--fs-2xs); opacity: .8; }
    .metricas { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--sp-2); }
    .metrica { display: flex; gap: 10px; align-items: flex-start; padding: var(--sp-3); border: 1px solid var(--border); border-radius: var(--r); cursor: pointer; }
    .metrica:hover { border-color: var(--brand-400); }
    .metrica--off { opacity: .5; cursor: not-allowed; }
    .metrica input, .nivel input { flex: none; width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--brand-600); }
    .metrica__txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .metrica__txt .badge { align-self: flex-start; }
    .niveles { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-2); }
    .nivel { display: flex; gap: 10px; align-items: flex-start; padding: var(--sp-3); border: 1px solid var(--border); border-radius: var(--r); cursor: pointer; }
    .nivel--activo { border-color: var(--brand-600); background: var(--brand-100); }
    .nivel > span { display: flex; flex-direction: column; gap: 2px; }
    .fila { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: flex-end; }
    .campo--inline { margin: 0; display: flex; flex-direction: column; gap: 4px; }
    .accion { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
    .accion button { display: inline-flex; align-items: center; gap: 8px; }
  `],
})
export class DescargasComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly tenant = inject(TenantService);

  readonly catalogo = signal<CatalogoDescargas | null>(null);
  readonly cargando = signal(true);
  readonly modulo = signal<string | null>(null);
  readonly seleccion = signal<Set<string>>(new Set());
  readonly nivel = signal<Nivel>('mensual');
  readonly dimension = signal<string>('');
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly empresa = signal<string>('');
  readonly descargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly nombreDominio = nombreDominio;

  readonly metricasDelModulo = computed(() => this.catalogo()?.modulos.find((m) => m.dominio === this.modulo())?.metricas ?? []);
  readonly seleccionadas = computed(() => this.metricasDelModulo().filter((m) => this.seleccion().has(m.clave)));
  readonly esAging = computed(() => this.nivel() === 'aging_rango' || this.nivel() === 'aging_socio');
  readonly pideDimension = computed(() => this.nivel() === 'mensual_dimension' || this.nivel() === 'dimension_total');
  /** Dimensiones que TODAS las métricas elegidas admiten (una hoja por métrica, mismo eje). */
  readonly dimensionesComunes = computed(() => {
    const ms = this.seleccionadas();
    if (!ms.length) return [] as string[];
    return ms.slice(1).reduce((acc, m) => acc.filter((d) => m.dimensiones.includes(d)), [...ms[0].dimensiones]);
  });
  readonly nivelesDisponibles = computed(() => {
    const ms = this.seleccionadas();
    const soloCartera = ms.length > 0 && ms.every((m) => m.clave === 'saldo_cxc' || m.clave === 'saldo_cxp');
    const algunaDerivada = ms.some((m) => m.derivada);
    return NIVELES.filter((n) => {
      if (n.clave.startsWith('aging')) return soloCartera;
      if (algunaDerivada) return n.clave === 'mensual';
      if (n.clave.includes('dimension')) return this.dimensionesComunes().length > 0;
      return true;
    });
  });
  readonly puedeDescargar = computed(() => {
    if (!this.seleccion().size) return false;
    if (this.pideDimension() && !this.dimension()) return false;
    if (this.desde() && this.hasta() && this.desde() > this.hasta()) return false;
    return this.nivelesDisponibles().some((n) => n.clave === this.nivel());
  });
  readonly resumenSeleccion = computed(() => {
    const n = this.seleccion().size;
    if (!n) return '';
    const nivel = NIVELES.find((x) => x.clave === this.nivel())?.nombre ?? '';
    const periodo = this.esAging() ? 'último corte' : `${this.desde() || 'inicio'} a ${this.hasta() || 'último dato'}`;
    return `${n} métrica${n === 1 ? '' : 's'} · ${nivel} · ${periodo}`;
  });

  ngOnInit(): void {
    this.api.get<CatalogoDescargas>('/descargas/catalogo').subscribe({
      next: (c) => {
        this.catalogo.set(c);
        this.cargando.set(false);
        if (c.modulos.length) this.elegirModulo(c.modulos.find((m) => m.dominio === 'ventas')?.dominio ?? c.modulos[0].dominio);
        this.esteAnio();
      },
      error: (e: Error) => {
        this.cargando.set(false);
        this.toast.error('No se pudo cargar el catálogo', e.message);
      },
    });
  }

  elegirModulo(dominio: string): void {
    this.modulo.set(dominio);
    this.seleccion.set(new Set());
    this.nivel.set('mensual');
    this.dimension.set('');
    this.error.set(null);
  }

  /** Las métricas de cartera y las demás no se mezclan en una misma descarga (niveles distintos). */
  compatible(m: MetricaDescargable): boolean {
    const ms = this.seleccionadas();
    if (!ms.length || ms.some((x) => x.clave === m.clave)) return true;
    const esCartera = (c: string) => c === 'saldo_cxc' || c === 'saldo_cxp';
    return esCartera(m.clave) === esCartera(ms[0].clave);
  }

  alternar(clave: string): void {
    const s = new Set(this.seleccion());
    if (s.has(clave)) s.delete(clave);
    else if (s.size < 10) s.add(clave);
    else this.toast.error('Máximo 10 métricas por descarga');
    this.seleccion.set(s);
    if (!this.nivelesDisponibles().some((n) => n.clave === this.nivel())) this.nivel.set(this.nivelesDisponibles()[0]?.clave ?? 'mensual');
    if (!this.dimensionesComunes().includes(this.dimension())) this.dimension.set('');
    this.error.set(null);
  }

  nombreDimension(d: string): string {
    return NOMBRE_DIMENSION[d] ?? d;
  }
  nombresDimensiones(ds: string[]): string {
    return ds.map((d) => this.nombreDimension(d).toLowerCase()).join(', ');
  }

  esteAnio(): void {
    const hoy = new Date();
    this.desde.set(`${hoy.getFullYear()}-01`);
    this.hasta.set(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);
  }
  ultimos12(): void {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
    this.desde.set(`${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`);
    this.hasta.set(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);
  }

  descargar(): void {
    if (!this.puedeDescargar()) return;
    this.descargando.set(true);
    this.error.set(null);
    const cuerpo: Record<string, unknown> = { metricas: [...this.seleccion()], nivel: this.nivel() };
    if (!this.esAging()) {
      if (this.desde()) cuerpo['periodo_desde'] = this.desde();
      if (this.hasta()) cuerpo['periodo_hasta'] = this.hasta();
    }
    if (this.pideDimension()) cuerpo['dimension'] = this.dimension();
    if (this.empresa()) cuerpo['empresa_id'] = this.empresa();

    this.api.postArchivo('/descargas/excel', cuerpo).subscribe({
      next: ({ blob, nombre }) => {
        this.descargando.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre ?? 'quilate_descarga.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.toast.exito('Archivo listo', 'Revisa la hoja «Ficha» para el contexto de cada dato.');
      },
      error: (e: Error) => {
        this.descargando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
