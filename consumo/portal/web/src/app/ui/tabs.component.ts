import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface PestanaTab {
  etiqueta: string;
  /** Último segmento de la ruta (se concatena a `baseRuta`). */
  segmento: string;
}

/**
 * Barra de pestañas por rutas hermanas. Antes vivía triplicada, literal, en
 * usuarios/perfiles/auditoria; ahora la pestaña activa la detecta el propio
 * router (routerLinkActive), no cada página a mano.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" role="tablist">
      @for (t of items; track t.segmento) {
        <a
          class="tab"
          role="tab"
          [routerLink]="baseRuta.concat(t.segmento)"
          routerLinkActive="activo"
        >{{ t.etiqueta }}</a>
      }
    </nav>
  `,
  styles: [`
    .tabs { display: inline-flex; gap: 2px; margin: 0 0 var(--sp-5); padding: 3px; border-radius: 10px; background: var(--surface-2); overflow-x: auto; max-width: 100%; }
    .tab { height: 32px; display: inline-flex; align-items: center; padding: 0 14px; border-radius: 8px; text-decoration: none; color: var(--muted); font-size: var(--fs-sm); font-weight: 500; white-space: nowrap; transition: background .12s, color .12s; }
    .tab:hover { color: var(--text); text-decoration: none; }
    .tab.activo { color: var(--text); background: var(--surface); box-shadow: var(--sh-1); font-weight: 600; }
  `],
})
export class TabsComponent {
  @Input({ required: true }) items: PestanaTab[] = [];
  @Input({ required: true }) baseRuta: (string | number | null)[] = [];
}
