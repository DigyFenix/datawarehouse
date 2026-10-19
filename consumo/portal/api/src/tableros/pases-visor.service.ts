/**
 * Pases de un solo uso para abrir un tablero sin que la URL de Publish to Web
 * llegue al código del portal. El API autenticado emite el pase; el iframe pide
 * nuestra ruta /visor con él y recibe un 302 hacia Power BI. Así la URL no vive
 * en el DOM ni en las respuestas JSON.
 *
 * Límite honesto: el destino del 302 sigue siendo visible en las herramientas
 * de desarrollador. Es mitigación, no secreto: el control real es rotar el
 * código en Power BI si un vínculo se filtra.
 *
 * En memoria a propósito: un servidor por cliente, un solo proceso de API. Si
 * algún día corre más de una réplica, mover a la base del tenant.
 */
import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

/** Vida del pase: lo justo para que el iframe lo canjee. */
const VIDA_MS = 60 * 1000;

interface Pase {
  hash: string;
  clave: string;
  urlPublica: string;
  expira: number;
}

@Injectable()
export class PasesVisorService {
  private readonly pases = new Map<string, Pase>();

  private static huella(pase: string): string {
    return createHash('sha256').update(pase).digest('hex');
  }

  /** Emite un pase para (tenant, tablero). Se guarda la huella, no el pase. */
  emitir(hash: string, clave: string, urlPublica: string): string {
    this.purgar();
    const pase = randomBytes(32).toString('base64url');
    this.pases.set(PasesVisorService.huella(pase), {
      hash,
      clave,
      urlPublica,
      expira: Date.now() + VIDA_MS,
    });
    return pase;
  }

  /**
   * Canjea el pase: devuelve la URL una sola vez si coincide tenant y tablero y
   * no venció. Cualquier otro caso devuelve null (sin distinguir el motivo).
   */
  canjear(hash: string, clave: string, pase: string): string | null {
    const huella = PasesVisorService.huella(pase);
    const registro = this.pases.get(huella);
    this.pases.delete(huella);
    if (!registro || registro.expira < Date.now()) return null;
    if (registro.hash !== hash || registro.clave !== clave) return null;
    return registro.urlPublica;
  }

  private purgar(): void {
    const ahora = Date.now();
    for (const [huella, p] of this.pases) if (p.expira < ahora) this.pases.delete(huella);
  }
}
