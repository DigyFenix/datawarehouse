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
    .tabs { display: flex; gap: 4px; margin: 0 0 var(--sp-4); border-bottom: 1px solid var(--border); overflow-x: auto; }
    .tab { padding: 8px 14px; text-decoration: none; color: var(--muted); font-size: var(--fs-base); border-bottom: 2px solid transparent; white-space: nowrap; }
    .tab:hover { color: var(--text); }
    .tab.activo { color: var(--text); border-bottom-color: var(--brand-600); font-weight: 600; }
  `],
})
export class TabsComponent {
  @Input({ required: true }) items: PestanaTab[] = [];
  @Input({ required: true }) baseRuta: (string | number | null)[] = [];
}
