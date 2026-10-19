/**
 * Freno de fuerza bruta para el login, en memoria (un proceso de API por
 * servidor de cliente). Dos controles:
 *
 *  1. Intentos FALLIDOS por ventana: 5 por (IP + email) y 20 por IP en 15 min.
 *     No se bloquea por email solo: eso dejaría a un atacante dejar sin acceso
 *     a cualquier usuario con solo conocer su correo.
 *  2. Verificaciones argon2 simultáneas: cada una usa ~64 MB de RAM; sin tope,
 *     unas decenas de peticiones en paralelo tumban un servidor de 2 GB.
 *
 * Responde 429 sin decir cuál de los límites se alcanzó.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

const VENTANA_MS = 15 * 60 * 1000;
const MAX_POR_IP_EMAIL = 5;
const MAX_POR_IP = 20;
const MAX_VERIFICACIONES_SIMULTANEAS = 3;
/** Tope de memoria del propio limitador: si se llena, se descartan los registros más viejos. */
const MAX_REGISTROS = 10_000;

interface Registro {
  fallos: number;
  desde: number;
}

export class LimitadorLogin {
  private readonly registros = new Map<string, Registro>();
  private enCurso = 0;

  private static claves(ip: string | null, email: string): Array<[string, number]> {
    const origen = ip ?? 'sin-ip';
    return [
      [`ie:${origen}:${email.toLowerCase()}`, MAX_POR_IP_EMAIL],
      [`i:${origen}`, MAX_POR_IP],
    ];
  }

  private static demasiados(): HttpException {
    return new HttpException('Demasiados intentos. Espera unos minutos.', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** @throws 429 si la IP o el par IP+email agotaron sus intentos en la ventana. */
  verificar(ip: string | null, email: string): void {
    const ahora = Date.now();
    for (const [clave, max] of LimitadorLogin.claves(ip, email)) {
      const r = this.registros.get(clave);
      if (r && ahora - r.desde < VENTANA_MS && r.fallos >= max) throw LimitadorLogin.demasiados();
    }
  }

  registrarFallo(ip: string | null, email: string): void {
    const ahora = Date.now();
    this.purgar(ahora);
    for (const [clave] of LimitadorLogin.claves(ip, email)) {
      const r = this.registros.get(clave);
      if (!r || ahora - r.desde >= VENTANA_MS) this.registros.set(clave, { fallos: 1, desde: ahora });
      else r.fallos += 1;
    }
  }

  /** Login correcto: limpia el contador del par (no el de la IP, que comparte oficina). */
  registrarExito(ip: string | null, email: string): void {
    this.registros.delete(LimitadorLogin.claves(ip, email)[0][0]);
  }

  /** Corre la verificación de contraseña con cupo. @throws 429 si el servidor ya está verificando el máximo. */
  async conCupo<T>(fn: () => Promise<T>): Promise<T> {
    if (this.enCurso >= MAX_VERIFICACIONES_SIMULTANEAS) throw LimitadorLogin.demasiados();
    this.enCurso += 1;
    try {
      return await fn();
    } finally {
      this.enCurso -= 1;
    }
  }

  private purgar(ahora: number): void {
    for (const [clave, r] of this.registros) if (ahora - r.desde >= VENTANA_MS) this.registros.delete(clave);
    while (this.registros.size > MAX_REGISTROS) {
      const masViejo = this.registros.keys().next().value;
      if (masViejo === undefined) break;
      this.registros.delete(masViejo);
    }
  }
}
