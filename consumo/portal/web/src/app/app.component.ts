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
    // Aplica el color de marca persistido al instante (evita parpadeo antes del branding).
    inject(ThemeService).aplicarDesdeAlmacen();
  }
}
