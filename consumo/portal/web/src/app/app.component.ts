import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {
  constructor() {
    // Aplica color de marca y preferencia de tema persistidos al instante (evita parpadeo).
    const tema = inject(ThemeService);
    tema.aplicarDesdeAlmacen();
    tema.aplicarTemaDesdeAlmacen();
  }
}
