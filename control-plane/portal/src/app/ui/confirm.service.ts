import { Injectable, signal } from '@angular/core';

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Estilo de advertencia (acción destructiva: eliminar, etc.). */
  peligro?: boolean;
}

interface SolicitudConfirmacion extends OpcionesConfirmacion {
  resolver: (valor: boolean) => void;
}

/**
 * Reemplazo gobernado del `confirm()` nativo del navegador (rompía la estética
 * por completo). `confirmar()` devuelve una promesa que resuelve cuando el
 * usuario responde en el diálogo renderizado por <app-confirm> (ver
 * confirm.component.ts, montado una vez en el layout).
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly solicitud = signal<SolicitudConfirmacion | null>(null);

  confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
    return new Promise((resolve) => {
      this.solicitud.set({ ...opciones, resolver: resolve });
    });
  }

  responder(valor: boolean): void {
    this.solicitud()?.resolver(valor);
    this.solicitud.set(null);
  }
}
