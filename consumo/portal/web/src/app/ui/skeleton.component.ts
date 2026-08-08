import { Component, Input } from '@angular/core';

/**
 * Marcador de carga (shimmer). Variantes:
 * - 'linea': un renglón de texto.
 * - 'tarjeta': bloque rectangular (grid de tableros).
 * - 'fila-tabla': una <tr> completa con N <td> — se usa dentro de un <tbody>.
 * Respeta prefers-reduced-motion vía la regla global de styles.css.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `
    @switch (variante) {
      @case ('tarjeta') {
        <div class="sk sk--tarjeta" [style.height.px]="alto"></div>
      }
      @case ('fila-tabla') {
        <tr class="sk-fila">
          @for (c of indices(columnas); track c) {
            <td><div class="sk sk--linea"></div></td>
          }
        </tr>
      }
      @default {
        <div class="sk sk--linea" [style.width]="ancho"></div>
      }
    }
  `,
  styles: [`
    /* display:contents: cuando la variante es 'fila-tabla', el <tr> real debe quedar
       como hijo directo del <tbody> para el algoritmo de layout de tablas (si no,
       el navegador crea una mini-tabla anónima anidada y las columnas no alinean). */
    :host { display: contents; }
    .sk {
      background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 37%, var(--surface-2) 63%);
      background-size: 400% 100%;
      animation: sk-shimmer 1.4s ease-in-out infinite;
      border-radius: var(--r-sm);
    }
    .sk--linea { height: 13px; width: 100%; }
    .sk--tarjeta { width: 100%; border-radius: var(--r); }
    @keyframes sk-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
  `],
})
export class SkeletonComponent {
  @Input() variante: 'linea' | 'tarjeta' | 'fila-tabla' = 'linea';
  @Input() ancho = '100%';
  @Input() alto = 160;
  @Input() columnas = 4;

  indices(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
