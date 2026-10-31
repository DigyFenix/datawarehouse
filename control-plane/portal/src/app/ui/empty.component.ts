import { Component, Input } from '@angular/core';

/** Estado vacío unificado (antes coexistían `.vacio` global y `.vacio-caja` ad-hoc). */
@Component({
  selector: 'app-empty',
  standalone: true,
  template: `
    <div class="vacio">
      <strong>{{ titulo }}</strong>
      <ng-content></ng-content>
    </div>
  `,
})
export class EmptyComponent {
  @Input({ required: true }) titulo = '';
}
