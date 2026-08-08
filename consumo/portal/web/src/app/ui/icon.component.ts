import { Component, Input } from '@angular/core';

/**
 * Mapa central de iconos (paths SVG 24x24, stroke=currentColor). Antes de este
 * componente el icono de gráfico (tableros) estaba duplicado literalmente en
 * layout, inicio y tableros — de aquí en adelante se define una sola vez.
 * NOTA: `features/inicio` no se toca (lo trabaja Edwin en paralelo), así que
 * conserva su propio SVG inline aunque coincida con 'grafico'.
 */
const ICONOS: Record<string, string> = {
  inicio: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  grafico: 'M3 3v18h18M7 15l3-4 3 3 5-7',
  chatbot: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  admin: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  usuarios: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  editar: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  candado: 'M5 11V7a7 7 0 0 1 14 0v4M5 11h14v10H5z',
  papelera: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6',
  sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  luna: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sistema: 'M3 4h18v12H3zM8 20h8M12 16v4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  cerrar: 'M18 6L6 18M6 6l12 12',
  chevronAbajo: 'M6 9l6 6 6-6',
  advertencia: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  externo: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
};

/** `<app-icon name="grafico" />` — un solo lugar para los paths SVG del portal. */
@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size"
      [attr.height]="size"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="grosor"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="ruta"></path>
    </svg>
  `,
  styles: [`:host { display: inline-flex; line-height: 0; }`],
})
export class IconComponent {
  @Input() name = '';
  @Input() size = 18;
  @Input() grosor = 1.8;

  get ruta(): string {
    return ICONOS[this.name] ?? '';
  }
}
