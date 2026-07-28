import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiService } from './api.service';
import { Organizacion } from './modelos';
import { ThemeService } from './theme.service';

/**
 * Organización activa del portal (el tenant que se está configurando).
 *
 * Por qué existe: la configuración del plano de datos (políticas de ingesta, campos de
 * origen, sociedades) es propia de cada organización porque cada una tiene su ERP —
 * el objeto `productos` sale de OITM en SAP B1 y de product_product en Odoo. Sin una
 * organización activa, las pantallas mezclarían dos ERPs en la misma lista.
 *
 * La elección se persiste en localStorage para que el portal abra donde se dejó, y
 * arrastra el color de marca del tenant (white-label).
 */
@Injectable({ providedIn: 'root' })
export class OrganizacionService {
  private readonly api = inject(ApiService);
  private readonly tema = inject(ThemeService);
  private readonly clave = 'organizacion-activa';

  readonly organizaciones = signal<Organizacion[]>([]);
  readonly activaId = signal<number | null>(this.leerAlmacen());

  readonly activa = computed(
    () => this.organizaciones().find((o) => o.id === this.activaId()) ?? null,
  );

  /** Carga el listado y garantiza que haya una activa válida (la persistida, o la primera). */
  cargar(): Observable<Organizacion[]> {
    return this.api.get<Organizacion[]>('/organizaciones').pipe(
      tap((orgs) => {
        this.organizaciones.set(orgs);
        const persistida = this.activaId();
        const sigueExistiendo = persistida !== null && orgs.some((o) => o.id === persistida);
        this.seleccionar(sigueExistiendo ? persistida : (orgs[0]?.id ?? null));
      }),
    );
  }

  seleccionar(id: number | null): void {
    this.activaId.set(id);
    if (id === null) localStorage.removeItem(this.clave);
    else localStorage.setItem(this.clave, String(id));
    this.tema.aplicar(this.organizaciones().find((o) => o.id === id)?.colorMarca ?? null);
  }

  /**
   * Id de la organización activa para usar en llamadas a la API.
   * @throws Error si no hay ninguna activa — llamar solo cuando `activaId()` no es null.
   */
  exigirId(): number {
    const id = this.activaId();
    if (id === null) throw new Error('No hay organización activa seleccionada');
    return id;
  }

  private leerAlmacen(): number | null {
    const guardado = localStorage.getItem(this.clave);
    if (!guardado) return null;
    const id = Number(guardado);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
}
