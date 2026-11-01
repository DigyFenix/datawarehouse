/**
 * Límite de peticiones del asistente por usuario (ventana deslizante en memoria).
 *
 * Cada mensaje dispara hasta AGENTE_MAX_ITERACIONES llamadas al modelo y cada consulta
 * guardada una lectura del warehouse: sin tope, un usuario autenticado podía agotar el
 * presupuesto de la API o las conexiones del pool del tenant (POSTGRES_POOL_MAX). Los topes son por usuario y
 * por proceso (suficiente con una réplica del API, que es el despliegue actual).
 */
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

import type { RequestPortal } from '../auth/jwt-auth.guard';

interface Ventana {
  marcas: number[];
}

const VENTANA_MS = 60_000;
/** Handlers que cuentan en el cubo caro (modelo o exportaciones). */
const HANDLERS_CAROS = new Set(['enviarMensaje', 'excel']);
/** Mensajes al modelo por minuto y usuario. */
const MAX_MENSAJES = 12;
/** Reejecuciones de consultas guardadas (y demás lecturas) por minuto y usuario. */
const MAX_LECTURAS = 90;

@Injectable()
export class LimiteAgenteGuard implements CanActivate {
  private readonly ventanas = new Map<string, Ventana>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestPortal>();
    const usuario = req.usuarioPortal;
    if (!usuario) return true; // el guard global de JWT ya rechazó o es ruta pública
    // El cubo se decide por el HANDLER resuelto por Nest, no por el texto de la ruta: un path con
    // mayúsculas o barra final distinta no puede colarse al cubo barato.
    // `excel` (descargas) entra al cubo caro: cada archivo son varias lecturas del warehouse.
    const esMensaje = HANDLERS_CAROS.has(ctx.getHandler().name);
    const clave = `${usuario.hash}:${usuario.id}:${esMensaje ? 'mensaje' : 'lectura'}`;
    const tope = esMensaje ? MAX_MENSAJES : MAX_LECTURAS;
    const ahora = Date.now();
    const ventana = this.ventanas.get(clave) ?? { marcas: [] };
    ventana.marcas = ventana.marcas.filter((t) => ahora - t < VENTANA_MS);
    if (ventana.marcas.length >= tope) {
      throw new HttpException(
        esMensaje
          ? 'Demasiados mensajes seguidos. Espera un momento antes de volver a preguntar.'
          : 'Demasiadas peticiones seguidas. Espera un momento.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    ventana.marcas.push(ahora);
    this.ventanas.set(clave, ventana);
    // Limpieza perezosa: sin esto el mapa crecería con usuarios que ya no vuelven.
    if (this.ventanas.size > 5_000) {
      for (const [k, v] of this.ventanas) if (v.marcas.every((t) => ahora - t >= VENTANA_MS)) this.ventanas.delete(k);
    }
    return true;
  }
}
