import { Component, Input } from '@angular/core';

/** Encabezado de página: eyebrow + título + acciones (proyectadas con el atributo `acciones`). */
@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <div class="page-header">
      <div class="titulo-grupo">
        @if (eyebrow) { <span class="eyebrow">{{ eyebrow }}</span> }
        <h2>{{ titulo }}</h2>
      </div>
      <div class="acciones">
        <ng-content select="[acciones]"></ng-content>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  @Input() eyebrow = '';
  @Input({ required: true }) titulo = '';
}
