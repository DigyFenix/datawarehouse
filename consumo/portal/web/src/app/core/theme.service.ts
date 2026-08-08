import { Injectable, signal } from '@angular/core';

export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema';

/**
 * Tema white-label + modo claro/oscuro.
 * - Marca: aplica el color de la organización sobre `--marca` (todos los tonos derivan por color-mix).
 * - Modo: tres estados (claro/oscuro/sistema) persistidos POR TENANT (mismo patrón que
 *   `portal_token_<hash>`), reflejados en `data-theme` sobre <html>. "sistema" = sin atributo
 *   (el CSS decide por `prefers-color-scheme`); "claro"/"oscuro" fuerzan el atributo y ganan
 *   siempre sobre la preferencia del sistema operativo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly claveMarca = 'marca-color';
  private readonly prefijoTema = 'portal_tema_';

  readonly tema = signal<PreferenciaTema>('sistema');

  /** Aplica el color (o restablece al default si es null/undefined). */
  aplicar(color?: string | null): void {
    const root = document.documentElement;
    if (color) {
      root.style.setProperty('--marca', color);
      localStorage.setItem(this.claveMarca, color);
    } else {
      root.style.removeProperty('--marca');
      localStorage.removeItem(this.claveMarca);
    }
  }

  /** Aplica lo persistido (llamar en el arranque para evitar parpadeo). */
  aplicarDesdeAlmacen(): void {
    const c = localStorage.getItem(this.claveMarca);
    if (c) document.documentElement.style.setProperty('--marca', c);
  }

  /**
   * Aplica la preferencia de tema del tenant sin esperar a que Angular resuelva la
   * ruta (evita FOUC): si no se pasa `hash`, lo intenta leer directo de la URL
   * (primer segmento de `location.pathname`, que es siempre el hash del tenant).
   */
  aplicarTemaDesdeAlmacen(hash?: string | null): void {
    const h = hash ?? this.hashDeUrl();
    const guardado = h ? (localStorage.getItem(this.prefijoTema + h) as PreferenciaTema | null) : null;
    this.aplicarTema(guardado ?? 'sistema');
  }

  /** Fija y persiste la preferencia de tema para el tenant activo. */
  establecerTema(tema: PreferenciaTema, hash: string): void {
    localStorage.setItem(this.prefijoTema + hash, tema);
    this.aplicarTema(tema);
  }

  private aplicarTema(tema: PreferenciaTema): void {
    this.tema.set(tema);
    const root = document.documentElement;
    if (tema === 'sistema') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', tema);
  }

  private hashDeUrl(): string | null {
    const segmento = location.pathname.split('/').filter(Boolean)[0];
    return segmento || null;
  }
}
