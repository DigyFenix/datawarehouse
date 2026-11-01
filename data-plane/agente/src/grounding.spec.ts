/**
 * Anclaje de cifras: todo número del texto tiene que salir de lo que devolvieron las tools.
 */
import { construirEvidencia, extraerCifras, plantillaRespuesta, reemplazarClaves, verificarTexto } from './grounding';
import type { ConjuntoDatos, TarjetaDato } from './tipos';

const tarjeta = (periodo: string, valor: number, extra: Partial<TarjetaDato> = {}): TarjetaDato => ({
  metricaClave: 'ventas_netas_sin_iva',
  metricaNombre: 'Ventas netas sin IVA',
  periodo,
  valor,
  estado: 'certificada',
  empresas: ['Empresa Uno'],
  unidad: 'moneda',
  corte: '2026-10-30',
  ...extra,
});

const serie: ConjuntoDatos = {
  tipo: 'serie',
  titulo: 'Ventas netas sin IVA por mes',
  metricaClave: 'ventas_netas_sin_iva',
  metricaNombre: 'Ventas netas sin IVA',
  dominio: 'ventas',
  estado: 'certificada',
  periodo: '2026-08 a 2026-10',
  unidad: 'moneda',
  empresas: ['Empresa Uno'],
  corte: '2026-10-30',
  columnas: [
    { clave: 'periodo', nombre: 'Período', tipo: 'periodo' },
    { clave: 'valor', nombre: 'Ventas', tipo: 'numero' },
  ],
  filas: [
    { periodo: '2026-08', valor: 1_000_000 },
    { periodo: '2026-09', valor: 1_250_000 },
    { periodo: '2026-10', valor: 800_000 },
  ],
};

const aging: ConjuntoDatos = {
  tipo: 'aging',
  titulo: 'Saldo por cobrar · antigüedad',
  metricaClave: 'saldo_cxc',
  metricaNombre: 'Saldo por cobrar',
  dominio: 'tesoreria',
  estado: 'certificada',
  periodo: 'corte 2026-10-30',
  unidad: 'moneda',
  empresas: ['Empresa Uno'],
  corte: '2026-10-30',
  columnas: [
    { clave: 'rango', nombre: 'Rango', tipo: 'texto' },
    { clave: 'saldo', nombre: 'Saldo', tipo: 'numero' },
    { clave: 'partidas', nombre: 'Partidas', tipo: 'numero' },
  ],
  filas: [
    { rango: 'Corriente', saldo: 500_000, partidas: 120 },
    { rango: '61-90 días', saldo: 75_000, partidas: 9 },
  ],
};

const ev = (conjuntos: ConjuntoDatos[] = [serie], tarjetas: TarjetaDato[] = []) =>
  construirEvidencia({ tarjetas, conjuntos, fechaActual: '2026-10-31', periodos: ['2026-01', '2026-10'] });

describe('Anclaje de cifras', () => {
  it('extrae cifras es-GT, porcentajes, multiplicadores, períodos y fechas', () => {
    const r = extraerCifras('Q 1,250,000 en 2026-09, 35.2 %, 1.2 millones y corte 30/10/2026');
    expect(r.periodos).toEqual(['2026-09']);
    expect(r.fechas).toEqual(['2026-10-30']);
    expect(r.cifras.map((c) => c.valor)).toEqual([1_250_000, 35.2, 1_200_000]);
    expect(r.cifras[1]?.porcentaje).toBe(true);
  });

  it('acepta valores devueltos, su total, años, meses y enteros pequeños', () => {
    const t = 'Ventas netas sin IVA de septiembre 2026: Q 1,250,000; agosto a octubre suman Q 3,050,000 (top 3, corte 2026-10-30).';
    expect(verificarTexto(t, ev())).toEqual({ ok: true, sinRespaldo: [] });
  });

  it('acepta diferencias, razones y variaciones porcentuales de dos valores', () => {
    // 1,250,000 − 800,000 = 450,000 ; 800,000 / 1,250,000 = 64 % ; caída (1,250,000−800,000)/1,250,000 = 36.0 %
    expect(verificarTexto('Cayó Q 450,000, un 36.0 %; octubre fue el 64.0 % de septiembre.', ev()).ok).toBe(true);
  });

  it('tolera el redondeo según los decimales escritos', () => {
    expect(verificarTexto('Septiembre: 1.25 millones; octubre: Q 0.8 millones.', ev()).ok).toBe(true);
  });

  it('rechaza una cifra inventada', () => {
    const r = verificarTexto('Las ventas de octubre fueron Q 2,345,678.', ev());
    expect(r.ok).toBe(false);
    expect(r.sinRespaldo).toEqual(['2,345,678']);
  });

  it('rechaza un porcentaje sin respaldo aunque sea menor que 50', () => {
    expect(verificarTexto('El margen fue 42.7 %.', ev()).ok).toBe(false);
  });

  it('rechaza un período con un año que no aparece en ningún dato', () => {
    expect(verificarTexto('En 2019-05 vendieron más.', ev()).ok).toBe(false);
  });

  it('acepta números de los textos devueltos (rango 61-90 días)', () => {
    expect(verificarTexto('Hay Q 75,000 en el rango 61-90 días, en 9 partidas.', ev([aging])).ok).toBe(true);
  });

  it('sin datos devueltos, cualquier monto grande se rechaza', () => {
    expect(verificarTexto('Vendiste Q 1,000,000 el mes pasado.', ev([])).ok).toBe(false);
    expect(verificarTexto('¿Ventas netas o brutas de 2026?', ev([])).ok).toBe(true);
  });

  it('acepta el valor de una tarjeta suelta', () => {
    expect(verificarTexto('Saldo: Q 575,000.', ev([], [tarjeta('2026-10', 575_000)])).ok).toBe(true);
  });

  it('reemplaza claves técnicas por el nombre oficial', () => {
    const nombres = new Map([['saldo_cxc', 'Saldo por cobrar'], ['ventas_netas_sin_iva', 'Ventas netas sin IVA']]);
    expect(reemplazarClaves('El `saldo_cxc` subió y ventas_netas_sin_iva bajó.', nombres)).toBe('El Saldo por cobrar subió y Ventas netas sin IVA bajó.');
  });

  it('la plantilla solo usa cifras con respaldo y formatea moneda y meses', () => {
    const texto = plantillaRespuesta([], [serie, aging]);
    expect(texto).toContain('agosto a octubre 2026');
    expect(texto).toContain('Q 3,050,000');
    expect(texto).toContain('Dato al 30/10/2026');
    expect(verificarTexto(texto, ev([serie, aging])).ok).toBe(true);
  });

  it('la plantilla no suma meses de un saldo', () => {
    const saldo: ConjuntoDatos = { ...serie, metricaClave: 'saldo_cxc', metricaNombre: 'Saldo por cobrar' };
    expect(plantillaRespuesta([], [saldo])).toContain('Saldo por cobrar en octubre 2026: Q 800,000');
  });

  it('porcentajes con 1 decimal en la plantilla', () => {
    const pct: ConjuntoDatos = { ...serie, unidad: 'porcentaje', filas: [{ periodo: '2026-10', valor: 35.04 }] };
    expect(plantillaRespuesta([], [pct])).toContain('35.0 %');
  });
});
