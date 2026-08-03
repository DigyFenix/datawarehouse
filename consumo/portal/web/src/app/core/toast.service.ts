/** Notificaciones efímeras de feedback (éxito/error/info). */
import { Injectable, signal } from '@angular/core';

export type TipoToast = 'exito' | 'error' | 'info';

export interface Toast {
  id: number;
  tipo: TipoToast;
  titulo: string;
  mensaje?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private secuencia = 0;
  readonly toasts = signal<Toast[]>([]);

  exito(titulo: string, mensaje?: string): void {
    this.mostrar('exito', titulo, mensaje);
  }
  error(titulo: string, mensaje?: string): void {
    this.mostrar('error', titulo, mensaje);
  }
  info(titulo: string, mensaje?: string): void {
    this.mostrar('info', titulo, mensaje);
  }

  private mostrar(tipo: TipoToast, titulo: string, mensaje?: string): void {
    const id = ++this.secuencia;
    this.toasts.update((t) => [...t, { id, tipo, titulo, mensaje }]);
    setTimeout(() => this.cerrar(id), tipo === 'error' ? 5000 : 3200);
  }

  cerrar(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
