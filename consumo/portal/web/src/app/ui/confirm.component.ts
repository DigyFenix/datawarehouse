import { Component, HostListener, inject } from '@angular/core';

import { IconComponent } from './icon.component';
import { ConfirmService } from './confirm.service';

/** Diálogo de confirmación con el design system. Montarlo una vez (en el layout). */
@Component({
  selector: 'app-confirm',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (confirm.solicitud(); as s) {
      <div class="overlay" (click)="confirm.responder(false)"></div>
      <div class="dialogo" role="alertdialog" aria-modal="true" [attr.aria-label]="s.titulo">
        <div class="dialogo__icono" [class.dialogo__icono--peligro]="s.peligro">
          <app-icon [name]="s.peligro ? 'advertencia' : 'info'" [size]="22"></app-icon>
        </div>
        <h3>{{ s.titulo }}</h3>
        <p>{{ s.mensaje }}</p>
        <div class="acciones-fila">
          <button type="button" class="secundario" (click)="confirm.responder(false)">
            {{ s.textoCancelar || 'Cancelar' }}
          </button>
          <button type="button" [class.peligro]="s.peligro" (click)="confirm.responder(true)">
            {{ s.textoConfirmar || 'Confirmar' }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .dialogo__icono {
      width: 40px; height: 40px; border-radius: 50%; margin-bottom: var(--sp-3);
      display: grid; place-items: center; background: var(--info-bg); color: var(--info);
    }
    .dialogo__icono--peligro { background: var(--danger-bg); color: var(--danger); }
    .dialogo h3 { margin-bottom: 6px; }
    .dialogo p { margin: 0; color: var(--muted); font-size: var(--fs-base); line-height: 1.5; }
  `],
})
export class ConfirmComponent {
  readonly confirm = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirm.solicitud()) this.confirm.responder(false);
  }
}
