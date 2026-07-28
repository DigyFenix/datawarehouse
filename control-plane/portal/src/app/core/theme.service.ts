import { Injectable } from '@angular/core';

/**
 * Tema white-label: aplica el color de marca de la organización sobre la variable CSS `--marca`.
 * Todos los tonos derivan de ella (color-mix en styles.css), así que basta un color.
 * Se persiste en localStorage para aplicarlo al instante en el arranque (sin parpadeo).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly clave = 'marca-color';

  /** Aplica el color (o restablece al default si es null/undefined). */
  aplicar(color?: string | null): void {
    const root = document.documentElement;
    if (color) {
      root.style.setProperty('--marca', color);
      localStorage.setItem(this.clave, color);
    } else {
      root.style.removeProperty('--marca');
      localStorage.removeItem(this.clave);
    }
  }

  /** Aplica lo persistido (llamar en el arranque para evitar parpadeo). */
  aplicarDesdeAlmacen(): void {
    const c = localStorage.getItem(this.clave);
    if (c) document.documentElement.style.setProperty('--marca', c);
  }
}
