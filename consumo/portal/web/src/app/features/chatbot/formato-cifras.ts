/**
 * Formato de cifras del chat y de los widgets: montos sin decimales, porcentajes con 1 decimal,
 * separadores es-GT. La unidad viene del agente (catálogo o derivada); sin unidad se conserva el
 * criterio anterior (0 decimales desde mil, 2 por debajo).
 */
import { UnidadMetrica } from './chat.service';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatearValor(valor: number, unidad?: UnidadMetrica): string {
  if (unidad === 'porcentaje') {
    return `${new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valor)} %`;
  }
  const decimales = unidad === 'moneda' || Math.abs(valor) >= 1000 || Number.isInteger(valor) ? 0 : 2;
  return new Intl.NumberFormat('es-GT', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}

/** 'YYYY-MM-DD' → '30 oct 2026'. */
export function fechaCorte(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : fecha;
}

/** Empresas en una línea: hasta 2 por nombre, después «N empresas». */
export function textoEmpresas(empresas: string[] | undefined): string | null {
  if (!empresas || empresas.length === 0) return null;
  return empresas.length <= 2 ? empresas.join(', ') : `${empresas.length} empresas`;
}
