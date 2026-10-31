import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

import { IconComponent } from '../../ui/icon.component';
import { ConjuntoDatos, VistaConsulta } from './chat.service';

/**
 * Un conjunto de datos del asistente, visto como tabla, barras o líneas, con exportación
 * a CSV. Sin librerías: SVG propio, suficiente para una serie mensual o un ranking.
 *
 * El dato llega estructurado (métrica, período, estado): la cabecera siempre lo dice, y
 * una métrica exploratoria se marca distinto. Nada aquí recalcula una cifra.
 */
@Component({
  selector: 'app-datos-visual',
  standalone: true,
  imports: [IconComponent],
  template: `
    <section class="dv" [class.dv--exploratoria]="conjunto.estado === 'exploratoria'">
      <header class="dv__cab">
        <div class="dv__titulos">
          <strong>{{ conjunto.titulo }}</strong>
          <span class="dv__meta">{{ conjunto.metricaNombre }} · {{ conjunto.periodo }}</span>
        </div>
        <div class="dv__acciones">
          <span class="badge" [class.badge--certificada]="conjunto.estado === 'certificada'"
                [class.badge--exploratoria]="conjunto.estado === 'exploratoria'">
            {{ conjunto.estado === 'certificada' ? 'Certificada' : 'Exploratoria' }}
          </span>
          <div class="dv__vistas" role="tablist" aria-label="Vista">
            <button type="button" class="dv__vista" [class.dv__vista--activa]="vista() === 'tabla'" (click)="cambiar('tabla')">Tabla</button>
            <button type="button" class="dv__vista" [class.dv__vista--activa]="vista() === 'barras'" (click)="cambiar('barras')">Barras</button>
            @if (conjunto.tipo === 'serie') {
              <button type="button" class="dv__vista" [class.dv__vista--activa]="vista() === 'lineas'" (click)="cambiar('lineas')">Líneas</button>
            }
          </div>
          <button type="button" class="pequeno secundario dv__csv" (click)="descargarCsv()" title="Descargar CSV">
            <app-icon name="descargar" [size]="14" /> CSV
          </button>
        </div>
      </header>

      @if (conjunto.filas.length === 0) {
        <p class="dv__vacio">Sin filas para este período.</p>
      } @else if (vista() === 'tabla') {
        <div class="dv__tabla">
          <table>
            <thead>
              <tr>
                @for (c of conjunto.columnas; track c.clave) {
                  <th [class.num]="c.tipo === 'numero'">{{ c.nombre }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (f of conjunto.filas; track $index) {
                <tr>
                  @for (c of conjunto.columnas; track c.clave) {
                    <td [class.num]="c.tipo === 'numero'">{{ celda(f, c) }}</td>
                  }
                </tr>
              }
            </tbody>
            @if (columnaValor(); as cv) {
              <tfoot>
                <tr>
                  <td>{{ conjunto.tipo === 'ranking' ? 'Total de los listados' : 'Total' }}</td>
                  @for (c of conjunto.columnas.slice(1); track c.clave) {
                    <td [class.num]="c.tipo === 'numero'">{{ c.clave === cv.clave ? formatear(total()) : '' }}</td>
                  }
                </tr>
              </tfoot>
            }
          </table>
        </div>
      } @else {
        <svg class="dv__svg" [attr.viewBox]="'0 0 ' + ANCHO + ' ' + ALTO" preserveAspectRatio="none" role="img" [attr.aria-label]="conjunto.titulo">
          <!-- grilla -->
          @for (g of grilla(); track g.y) {
            <line [attr.x1]="MARGEN_IZQ" [attr.x2]="ANCHO - 8" [attr.y1]="g.y" [attr.y2]="g.y" class="dv__grilla" />
            <text [attr.x]="MARGEN_IZQ - 6" [attr.y]="g.y + 3" class="dv__eje" text-anchor="end">{{ g.etiqueta }}</text>
          }
          <line [attr.x1]="MARGEN_IZQ" [attr.x2]="ANCHO - 8" [attr.y1]="yCero()" [attr.y2]="yCero()" class="dv__base" />
          @if (vista() === 'barras') {
            @for (p of puntos(); track p.i) {
              <rect [attr.x]="p.x - anchoBarra() / 2" [attr.y]="p.valor >= 0 ? p.y : yCero()"
                    [attr.width]="anchoBarra()" [attr.height]="abs(yCero() - p.y)"
                    class="dv__barra" [class.dv__barra--neg]="p.valor < 0">
                <title>{{ p.etiqueta }}: {{ formatear(p.valor) }}</title>
              </rect>
            }
          } @else {
            <polyline [attr.points]="poli()" class="dv__linea" />
            @for (p of puntos(); track p.i) {
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" class="dv__punto"><title>{{ p.etiqueta }}: {{ formatear(p.valor) }}</title></circle>
            }
          }
          @for (p of puntos(); track p.i) {
            @if (p.mostrarEtiqueta) {
              <text [attr.x]="p.x" [attr.y]="ALTO - 6" class="dv__cat" text-anchor="middle">{{ p.etiquetaCorta }}</text>
            }
          }
        </svg>
        @if (conjunto.tipo !== 'serie') {
          <ol class="dv__leyenda">
            @for (p of puntos(); track p.i) {
              <li><span class="dv__n">{{ p.i + 1 }}</span> {{ p.etiqueta }} <strong>{{ formatear(p.valor) }}</strong></li>
            }
          </ol>
        }
      }
    </section>
  `,
  styles: [
    `
      .dv { border: 1px solid var(--border); border-radius: var(--r); background: var(--surface); padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); border-left: 3px solid var(--ok); }
      .dv--exploratoria { border-left-color: var(--warn); }
      .dv__cab { display: flex; justify-content: space-between; gap: var(--sp-3); align-items: flex-start; flex-wrap: wrap; }
      .dv__titulos { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .dv__meta { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--muted); }
      .dv__acciones { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
      .dv__vistas { display: inline-flex; border: 1px solid var(--border-2); border-radius: var(--r-sm); overflow: hidden; }
      .dv__vista { background: none; border: none; padding: 4px 10px; font-size: var(--fs-xs); color: var(--muted); cursor: pointer; }
      .dv__vista--activa { background: var(--surface-2); color: var(--text); font-weight: 600; }
      .dv__csv { display: inline-flex; align-items: center; gap: 4px; }
      .dv__tabla { overflow: auto; max-height: 360px; }
      table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
      th, td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
      th { position: sticky; top: 0; background: var(--surface-2); font-weight: 600; font-size: var(--fs-xs); color: var(--muted); }
      td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
      tfoot td { font-weight: 600; background: var(--surface-2); }
      .dv__vacio { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
      .dv__svg { width: 100%; height: 220px; display: block; }
      .dv__grilla { stroke: var(--border); stroke-width: 1; }
      .dv__base { stroke: var(--border-2); stroke-width: 1; }
      .dv__eje { font-size: 10px; fill: var(--muted); font-family: var(--mono); }
      .dv__cat { font-size: 10px; fill: var(--muted); }
      .dv__barra { fill: var(--brand-600); }
      .dv__barra--neg { fill: var(--danger); }
      .dv__linea { fill: none; stroke: var(--brand-600); stroke-width: 2; }
      .dv__punto { fill: var(--brand-600); }
      .dv__leyenda { margin: 0; padding: 0 0 0 var(--sp-2); font-size: var(--fs-xs); color: var(--muted); columns: 2; column-gap: var(--sp-4); list-style: none; }
      .dv__leyenda li { display: flex; gap: 6px; align-items: baseline; break-inside: avoid; padding: 2px 0; }
      .dv__leyenda strong { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }
      .dv__n { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--faint); min-width: 16px; }
      @media (max-width: 640px) { .dv__leyenda { columns: 1; } }
    `,
  ],
})
export class DatosVisualComponent {
  readonly ANCHO = 640;
  readonly ALTO = 220;
  readonly MARGEN_IZQ = 64;
  readonly MARGEN_SUP = 12;
  readonly MARGEN_INF = 24;

  @Input({ required: true }) set conjunto(c: ConjuntoDatos) {
    this._conjunto.set(c);
  }
  get conjunto(): ConjuntoDatos {
    return this._conjunto();
  }
  @Input() set vistaInicial(v: VistaConsulta | undefined) {
    if (v) this.vista.set(v);
  }

  private readonly _conjunto = signal<ConjuntoDatos>({ tipo: 'serie', titulo: '', metricaClave: '', metricaNombre: '', estado: 'certificada', periodo: '', columnas: [], filas: [] });
  readonly vista = signal<VistaConsulta>('tabla');
  /** El contenedor (p. ej. Mi tablero) puede persistir la vista que la persona prefiere. */
  @Output() readonly vistaCambiada = new EventEmitter<VistaConsulta>();

  cambiar(v: VistaConsulta): void {
    this.vista.set(v);
    this.vistaCambiada.emit(v);
  }

  /** La columna numérica principal: la última de tipo número (valor / saldo). */
  readonly columnaValor = computed(() => {
    const nums = this._conjunto().columnas.filter((c) => c.tipo === 'numero');
    return nums.length ? nums[0] : null;
  });
  readonly columnaEtiqueta = computed(() => this._conjunto().columnas.find((c) => c.tipo !== 'numero') ?? null);

  readonly valores = computed(() => {
    const cv = this.columnaValor();
    if (!cv) return [] as number[];
    return this._conjunto().filas.map((f) => Number(f[cv.clave] ?? 0));
  });
  readonly total = computed(() => this.valores().reduce((a, b) => a + b, 0));

  private readonly escala = computed(() => {
    const vals = this.valores();
    const max = Math.max(0, ...vals);
    const min = Math.min(0, ...vals);
    const rango = max - min || 1;
    const altoUtil = this.ALTO - this.MARGEN_SUP - this.MARGEN_INF;
    return { max, min, rango, altoUtil };
  });

  yDe(v: number): number {
    const e = this.escala();
    return this.MARGEN_SUP + ((e.max - v) / e.rango) * e.altoUtil;
  }
  yCero(): number {
    return this.yDe(0);
  }
  abs(n: number): number {
    return Math.abs(n);
  }

  readonly puntos = computed(() => {
    const filas = this._conjunto().filas;
    const ce = this.columnaEtiqueta();
    const vals = this.valores();
    const n = Math.max(1, filas.length);
    const anchoUtil = this.ANCHO - this.MARGEN_IZQ - 8;
    const paso = anchoUtil / n;
    const cadaCuantas = Math.ceil(n / 12);
    const tieneEmpresa = this._conjunto().columnas.some((c) => c.clave === 'empresa');
    return filas.map((f, i) => {
      let etiqueta = ce ? String(f[ce.clave] ?? '') : String(i + 1);
      if (tieneEmpresa && ce && ce.clave !== 'empresa') etiqueta = `${etiqueta} · ${String(f['empresa'] ?? '')}`;
      const esSerie = this._conjunto().tipo === 'serie';
      return {
        i,
        x: this.MARGEN_IZQ + paso * (i + 0.5),
        y: this.yDe(vals[i]),
        valor: vals[i],
        etiqueta,
        etiquetaCorta: esSerie ? etiqueta.slice(0, 7) : String(i + 1),
        mostrarEtiqueta: i % cadaCuantas === 0,
      };
    });
  });
  anchoBarra(): number {
    const n = Math.max(1, this._conjunto().filas.length);
    return Math.max(4, ((this.ANCHO - this.MARGEN_IZQ - 8) / n) * 0.62);
  }
  poli(): string {
    return this.puntos().map((p) => `${p.x},${p.y}`).join(' ');
  }
  readonly grilla = computed(() => {
    const e = this.escala();
    const pasos = 4;
    const out: { y: number; etiqueta: string }[] = [];
    for (let k = 0; k <= pasos; k += 1) {
      const v = e.min + (e.rango * k) / pasos;
      out.push({ y: this.yDe(v), etiqueta: this.abreviar(v) });
    }
    return out;
  });

  celda(f: Record<string, string | number | null>, c: { clave: string; tipo: string }): string {
    const v = f[c.clave];
    if (v === null || v === undefined) return '';
    return c.tipo === 'numero' ? this.formatear(Number(v)) : String(v);
  }

  formatear(valor: number): string {
    const abs = Math.abs(valor);
    const decimales = abs >= 1000 || Number.isInteger(valor) ? 0 : 2;
    return new Intl.NumberFormat('es-GT', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
  }

  abreviar(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${Math.round(v / 1_000)}K`;
    return `${Math.round(v)}`;
  }

  descargarCsv(): void {
    const c = this._conjunto();
    // Una celda de texto que empieza con = + - @ (o tab/CR) la evalúa Excel como fórmula:
    // los nombres vienen del ERP y cualquiera puede editarlos allá. Se neutraliza con un
    // apóstrofo inicial (CSV injection).
    const esc = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    const cab = c.columnas.map((col) => esc(col.nombre)).join(';');
    const filas = c.filas.map((f) =>
      c.columnas.map((col) => {
        const v = f[col.clave];
        if (v === null || v === undefined) return '';
        return col.tipo === 'numero' ? String(v) : esc(String(v));
      }).join(';'),
    );
    const pie = `${esc('Métrica')};${esc(`${c.metricaNombre} (${c.estado}) · ${c.periodo}`)}`;
    // BOM para que Excel en español abra el UTF-8 y respete el separador ';'.
    const contenido = '﻿' + [cab, ...filas, '', pie].join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.titulo.replace(/[^\w\dáéíóúñ ]+/gi, ' ').trim().replace(/\s+/g, '_').toLowerCase() || 'consulta'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
