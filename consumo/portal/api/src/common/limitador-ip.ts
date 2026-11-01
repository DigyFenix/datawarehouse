/**
 * Límite de peticiones por IP en ventana fija, en memoria (un proceso de API por servidor de
 * cliente). Para endpoints públicos que no pasan por el login: el canje del pase de soporte
 * (`/auth/impersonar`) y el destino del iframe del visor (`/tableros/:clave/visor`). Sin tope,
 * se podría probar pases a ritmo de red (auditoría B7).
 *
 * Responde 429 sin más detalle.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

/** Tope de memoria: si se llena, se descartan los registros más viejos. */
const MAX_REGISTROS = 10_000;

interface Ventana {
  cuenta: number;
  desde: number;
}

export class LimitadorPorIp {
  private readonly ventanas = new Map<string, Ventana>();

  /**
   * @param max       peticiones admitidas por IP dentro de la ventana
   * @param ventanaMs duración de la ventana en milisegundos
   */
  constructor(
    private readonly max: number,
    private readonly ventanaMs: number,
  ) {}

  /** Cuenta una petición de la IP. @throws 429 si la IP ya agotó su cupo en la ventana. */
  consumir(ip: string | null): void {
    const ahora = Date.now();
    const clave = ip ?? 'sin-ip';
    const v = this.ventanas.get(clave);
    if (!v || ahora - v.desde >= this.ventanaMs) {
      this.purgar(ahora);
      this.ventanas.set(clave, { cuenta: 1, desde: ahora });
      return;
    }
    if (v.cuenta >= this.max) {
      throw new HttpException('Demasiadas solicitudes. Espera unos minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
    v.cuenta += 1;
  }

  private purgar(ahora: number): void {
    for (const [clave, v] of this.ventanas) if (ahora - v.desde >= this.ventanaMs) this.ventanas.delete(clave);
    while (this.ventanas.size > MAX_REGISTROS) {
      const masViejo = this.ventanas.keys().next().value;
      if (masViejo === undefined) break;
      this.ventanas.delete(masViejo);
    }
  }
}
