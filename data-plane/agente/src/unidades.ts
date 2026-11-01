/**
 * Unidad y corte de cada métrica, para que tarjetas y conjuntos lleven SIEMPRE con qué leer
 * la cifra (moneda / porcentaje / número) y hasta qué fecha llega el dato.
 *
 * El catálogo de producto no tiene columna de unidad: hoy todas sus métricas son montos. Las
 * derivadas sí la declaran (portal.metricas_derivadas.unidad). Para el resto se deriva de la
 * clave con reglas conservadoras; ante duda, moneda (el caso de todo el catálogo actual).
 */
import type { FrescuraDominio, MetricaAutorizada, UnidadMetrica } from './tipos';

const PATRON_PORCENTAJE = /(^|_)(pct|porcentaje|porc|tasa|ratio|razon|participacion)(_|$)/;
const PATRON_NUMERO = /(^|_)(cantidad|unidades|dias|conteo|numero|documentos|clientes_activos)(_|$)/;

export function unidadDe(metrica: Pick<MetricaAutorizada, 'clave' | 'unidad'>): UnidadMetrica {
  if (metrica.unidad) return metrica.unidad;
  if (PATRON_PORCENTAJE.test(metrica.clave)) return 'porcentaje';
  if (PATRON_NUMERO.test(metrica.clave)) return 'numero';
  return 'moneda';
}

/**
 * Dominios de carga (oro.estado_carga) que alimentan cada métrica, en orden de preferencia.
 * Los dominios del catálogo (ventas, tesoreria…) no coinciden 1:1 con los de la carga
 * (ventas, cartera_cobrar, pagos, contabilidad…).
 */
function dominiosDeCarga(metrica: Pick<MetricaAutorizada, 'clave' | 'dominio'>): string[] {
  const c = metrica.clave;
  if (c === 'saldo_cxc') return ['cartera_cobrar'];
  if (c === 'saldo_cxp') return ['cartera_pagar'];
  if (c.startsWith('cobros')) return ['pagos', 'cartera_cobrar'];
  if (c.startsWith('pagos')) return ['pagos', 'cartera_pagar'];
  if (/contable|gasto_operativo/.test(c)) return ['contabilidad'];
  switch (metrica.dominio) {
    case 'tesoreria':
      return ['cartera_cobrar', 'pagos'];
    case 'rentabilidad':
      return ['ventas', 'contabilidad'];
    default:
      return [metrica.dominio];
  }
}

/** Fecha del dato más reciente que respalda la métrica ('YYYY-MM-DD'), o null si no se conoce. */
export function corteDe(
  metrica: Pick<MetricaAutorizada, 'clave' | 'dominio'>,
  frescura: FrescuraDominio[] | undefined,
): string | null {
  if (!frescura || frescura.length === 0) return null;
  for (const d of dominiosDeCarga(metrica)) {
    const f = frescura.find((x) => x.dominio === d && x.fechaDatoMasReciente);
    if (f?.fechaDatoMasReciente) return f.fechaDatoMasReciente.slice(0, 10);
  }
  return null;
}
