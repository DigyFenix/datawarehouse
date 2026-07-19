import { Component, inject } from '@angular/core';

import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="toast-host" role="status" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast toast--{{ t.tipo }}" (click)="toast.cerrar(t.id)">
          <strong>{{ t.titulo }}</strong>
          @if (t.mensaje) { <span>{{ t.mensaje }}</span> }
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);
}
