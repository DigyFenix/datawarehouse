import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/** Panel lateral para crear/editar sin perder de vista la lista. Cierra con Escape o clic fuera. */
@Component({
  selector: 'app-drawer',
  standalone: true,
  template: `
    <div class="overlay" (click)="cerrar.emit()"></div>
    <aside class="drawer" [class.drawer--ancho]="ancho" role="dialog" aria-modal="true">
      <header class="drawer__head">
        <div>
          @if (eyebrow) { <span class="eyebrow">{{ eyebrow }}</span> }
          <h3>{{ titulo }}</h3>
        </div>
        <button class="icono" (click)="cerrar.emit()" aria-label="Cerrar">✕</button>
      </header>
      <div class="drawer__body">
        <ng-content></ng-content>
      </div>
    </aside>
  `,
})
export class DrawerComponent {
  @Input() titulo = '';
  @Input() eyebrow = '';
  @Input() ancho = false;
  @Output() cerrar = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cerrar.emit();
  }
}
