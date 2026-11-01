/**
 * Formato de cifras y períodos que el CÓDIGO escribe (plantillas, opciones, sugerencias).
 * Misma convención que se le pide al modelo en el prompt: montos con la moneda del tenant y
 * 0 decimales, porcentajes con 1 decimal, períodos como «marzo 2026». Separadores es-GT
 * (miles con coma, decimales con punto).
 */
import type { UnidadMetrica } from './tipos';

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** 'YYYY-MM' → «marzo 2026». Cualquier otra cosa se devuelve tal cual. */
export function nombrePeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${mes} ${m[1]}` : periodo;
}

/** Rango legible: «enero a octubre 2026», «noviembre 2025 a marzo 2026» o un solo mes. */
export function nombreRango(desde: string | null | undefined, hasta: string | null | undefined): string {
  if (desde && hasta) {
    if (desde === hasta) return nombrePeriodo(desde);
    if (desde.slice(0, 4) === hasta.slice(0, 4)) {
      return `${nombrePeriodo(desde).split(' ')[0]} a ${nombrePeriodo(hasta)}`;
    }
    return `${nombrePeriodo(desde)} a ${nombrePeriodo(hasta)}`;
  }
  if (desde) return `desde ${nombrePeriodo(desde)}`;
  if (hasta) return `hasta ${nombrePeriodo(hasta)}`;
  return 'todos los períodos con datos';
}

/** 'YYYY-MM-DD' → '30/10/2026'. */
export function fechaCorta(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha;
}

const fmt0 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Cifra lista para leer. Se usa en-US a propósito: produce exactamente la convención es-GT
 * (1,234,567.8) sin depender de que el runtime traiga los datos ICU del español.
 */
export function formatearCifra(valor: number, unidad: UnidadMetrica | undefined, simboloMoneda = 'Q'): string {
  if (unidad === 'porcentaje') return `${fmt1.format(valor)} %`;
  if (unidad === 'moneda') return `${valor < 0 ? '-' : ''}${simboloMoneda} ${fmt0.format(Math.abs(valor))}`;
  return Number.isInteger(valor) || Math.abs(valor) >= 1000 ? fmt0.format(valor) : fmt1.format(valor);
}

/** Datos externos (glosario, nombres del ERP) delimitados para el modelo: una línea, máximo 80 caracteres. */
export function dato(texto: string | null | undefined, maximo = 80): string {
  const limpio = String(texto ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/<\/?dato>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const corto = limpio.length > maximo ? `${limpio.slice(0, maximo - 1)}…` : limpio;
  return `<dato>${corto}</dato>`;
}

/** Quita los delimitadores <dato> si el modelo los copió a su respuesta. */
export function quitarDelimitadores(texto: string): string {
  return texto.replace(/<\/?dato>/gi, '');
}

/** Año y mes de 'YYYY-MM-DD' → 'YYYY-MM'. */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/** 'YYYY-MM' desplazado n meses. */
export function sumarMeses(periodo: string, n: number): string {
  const [a, m] = periodo.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
