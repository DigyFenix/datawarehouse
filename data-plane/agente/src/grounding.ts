/**
 * ANCLAJE DEL TEXTO A LOS DATOS (anti-alucinación).
 *
 * Las tarjetas y conjuntos salen del SQL, pero el texto lo redacta el modelo. Este módulo
 * verifica, después del loop, que TODA cifra del texto tenga respaldo en lo que las tools
 * devolvieron en este turno:
 *
 *   - un valor de tarjeta o de cualquier celda numérica de un conjunto (o el total de su columna),
 *   - un período / año / fecha conocidos (rango del catálogo, cortes, fecha de hoy),
 *   - un número que aparece en un texto devuelto (p. ej. el rango «61-90 días»),
 *   - un entero ≤ 50 (conteos, «top 10», días del mes) que no sea porcentaje,
 *   - o la diferencia / suma / razón / variación porcentual de DOS valores devueltos,
 *
 * con tolerancia de redondeo según los decimales que escribió el modelo. Si una sola cifra no
 * tiene respaldo, el host no muestra ese texto: se reemplaza por una plantilla armada en código
 * desde las tarjetas y conjuntos, y se audita `respuesta_regenerada` con el original.
 */
import { fechaCorta, formatearCifra, nombrePeriodo, nombreRango } from './formato';
import type { ConjuntoDatos, TarjetaDato } from './tipos';

/** Respaldo numérico de un turno. */
export interface Evidencia {
  /** Valores absolutos devueltos por las tools (deduplicados). */
  valores: number[];
  /** Años válidos para citar (de los períodos conocidos y la fecha de hoy). */
  anios: Set<number>;
  /** Fechas 'YYYY-MM-DD' conocidas (cortes, hoy). */
  fechas: Set<string>;
  /** Números que aparecen dentro de textos devueltos (nombres de rango, miembros). */
  numerosEnTextos: Set<number>;
}

export interface EntradaEvidencia {
  tarjetas: TarjetaDato[];
  conjuntos: ConjuntoDatos[];
  /** Períodos 'YYYY-MM' adicionales conocidos (rangos del catálogo autorizado). */
  periodos?: (string | null | undefined)[];
  /** Fechas 'YYYY-MM-DD' adicionales (frescura). */
  fechas?: (string | null | undefined)[];
  fechaActual: string;
  /** Textos adicionales cuyos números son legítimos (nombres de métrica del catálogo). */
  textos?: string[];
}

/** Tope de valores para el cruce por pares (n² operaciones por cifra del texto). */
const TOPE_VALORES = 400;

function numerosDeTexto(texto: string): number[] {
  return (texto.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

export function construirEvidencia(e: EntradaEvidencia): Evidencia {
  const valores = new Set<number>();
  const anios = new Set<number>();
  const fechas = new Set<string>();
  const numerosEnTextos = new Set<number>();
  const agregarPeriodo = (p: string | null | undefined): void => {
    if (!p) return;
    for (const m of p.matchAll(/(\d{4})-(\d{2})(?:-(\d{2}))?/g)) {
      anios.add(Number(m[1]));
      if (m[3]) fechas.add(m[0]);
    }
  };
  const agregarTexto = (t: string | null | undefined): void => {
    if (!t) return;
    for (const n of numerosDeTexto(t)) numerosEnTextos.add(n);
  };

  for (const t of e.tarjetas) {
    if (Number.isFinite(t.valor)) valores.add(Math.abs(t.valor));
    agregarPeriodo(t.periodo);
    agregarPeriodo(t.corte);
    agregarTexto(t.metricaNombre);
  }
  for (const c of e.conjuntos) {
    agregarPeriodo(c.periodo);
    agregarPeriodo(c.corte);
    agregarTexto(c.titulo);
    agregarTexto(c.metricaNombre);
    for (const col of c.columnas) {
      if (col.tipo === 'numero') {
        let suma = 0;
        for (const f of c.filas) {
          const v = Number(f[col.clave] ?? 0);
          if (Number.isFinite(v)) {
            valores.add(Math.abs(v));
            suma += v;
          }
        }
        valores.add(Math.abs(suma));
        // Suma por período en series por empresa (la UI agrupa así al graficar).
      } else {
        for (const f of c.filas) {
          const v = f[col.clave];
          if (col.tipo === 'periodo') agregarPeriodo(String(v ?? ''));
          else agregarTexto(String(v ?? ''));
        }
      }
    }
    // Serie por empresa: el total de cada período (suma de empresas) también es un dato devuelto.
    if (c.tipo === 'serie' && c.columnas.some((x) => x.clave === 'empresa')) {
      const porPeriodo = new Map<string, number>();
      for (const f of c.filas) {
        const per = String(f['periodo'] ?? '');
        porPeriodo.set(per, (porPeriodo.get(per) ?? 0) + Number(f['valor'] ?? 0));
      }
      for (const v of porPeriodo.values()) valores.add(Math.abs(v));
    }
  }
  for (const p of e.periodos ?? []) agregarPeriodo(p);
  for (const f of e.fechas ?? []) agregarPeriodo(f);
  for (const t of e.textos ?? []) agregarTexto(t);
  agregarPeriodo(e.fechaActual);
  const anioActual = Number(e.fechaActual.slice(0, 4));
  if (Number.isFinite(anioActual)) {
    anios.add(anioActual);
    anios.add(anioActual - 1);
  }

  const lista = [...valores].filter((v) => v !== 0).sort((a, b) => b - a).slice(0, TOPE_VALORES);
  return { valores: lista, anios, fechas, numerosEnTextos };
}

/** Una cifra encontrada en el texto. */
export interface CifraTexto {
  texto: string;
  valor: number;
  /** Media unidad del último dígito escrito (× multiplicador): tolerancia de redondeo. */
  tolerancia: number;
  porcentaje: boolean;
  /** true si se escribió como entero sin separadores ni multiplicador (candidato a año / conteo). */
  enteroSimple: boolean;
}

const MULTIPLICADORES: Record<string, number> = {
  millones: 1e6, millón: 1e6, millon: 1e6, mm: 1e6, m: 1e6,
  mil: 1e3, k: 1e3,
};

const RE_FECHA = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const RE_PERIODO = /\b(\d{4})-(\d{2})\b/g;
const RE_NUMERO =
  /(?<![\w.,])(\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(millones|millón|millon|mil|MM|M|k|K)\b)?(\s*%)?/g;

/** Interpreta '1,234,567.89' (es-GT) y también '1.234.567,89' (es-ES) por si el modelo lo usa. */
function aNumero(crudo: string): { valor: number; decimales: number } {
  if (/^\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?$/.test(crudo)) {
    const [entero = '', dec = ''] = crudo.split(',');
    return { valor: Number(`${entero.replace(/\./g, '')}.${dec || '0'}`), decimales: dec.length };
  }
  const limpio = crudo.replace(/,/g, '');
  const dec = limpio.includes('.') ? (limpio.split('.')[1] ?? '').length : 0;
  return { valor: Number(limpio), decimales: dec };
}

/**
 * Extrae fechas, períodos y cifras del texto. Fechas y períodos se validan aparte y se quitan
 * antes de buscar cifras (para que «2026-03» no se lea como 2026 y 3).
 */
export function extraerCifras(texto: string): { fechas: string[]; periodos: string[]; cifras: CifraTexto[] } {
  const fechas: string[] = [];
  const periodos: string[] = [];
  let resto = texto.replace(RE_FECHA, (m, a, mes, d, d2, mes2, a2) => {
    fechas.push(a ? `${a}-${mes}-${d}` : `${a2}-${String(mes2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`);
    return ' ';
  });
  resto = resto.replace(RE_PERIODO, (m) => {
    periodos.push(m);
    return ' ';
  });
  const cifras: CifraTexto[] = [];
  for (const m of resto.matchAll(RE_NUMERO)) {
    const crudo = m[1] ?? '';
    const { valor, decimales } = aNumero(crudo);
    if (!Number.isFinite(valor)) continue;
    const mult = m[2] ? (MULTIPLICADORES[m[2].toLowerCase()] ?? 1) : 1;
    cifras.push({
      texto: m[0].trim(),
      valor: valor * mult,
      tolerancia: 0.5 * Math.pow(10, -decimales) * mult,
      porcentaje: Boolean(m[3]),
      enteroSimple: /^\d+$/.test(crudo) && mult === 1,
    });
  }
  return { fechas, periodos, cifras };
}

function cerca(x: number, objetivo: number, tol: number): boolean {
  return Math.abs(x - objetivo) <= tol + Math.abs(objetivo) * 1e-6;
}

/** ¿La cifra tiene respaldo directo o como combinación de dos valores devueltos? */
function cifraRespaldada(c: CifraTexto, ev: Evidencia): boolean {
  const x = Math.abs(c.valor);
  const tol = c.tolerancia;
  if (!c.porcentaje) {
    if (c.enteroSimple && x <= 50) return true;
    if (c.enteroSimple && ev.anios.has(x)) return true;
    if (ev.numerosEnTextos.has(x)) return true;
  }
  const v = ev.valores;
  // Directo (un porcentaje directo es una métrica en unidad porcentaje).
  if (v.some((a) => cerca(x, a, tol))) return true;
  for (let i = 0; i < v.length; i += 1) {
    const a = v[i] as number;
    for (let j = 0; j < v.length; j += 1) {
      if (i === j) continue;
      const b = v[j] as number;
      if (c.porcentaje) {
        // Participación (a/b) y variación ((a-b)/b), en porcentaje.
        if (cerca(x, (a / b) * 100, tol) || cerca(x, (Math.abs(a - b) / b) * 100, tol)) return true;
      } else {
        if (j > i && (cerca(x, Math.abs(a - b), tol) || cerca(x, a + b, tol))) return true;
        if (cerca(x, a / b, tol)) return true;
      }
    }
  }
  return false;
}

export interface Verificacion {
  ok: boolean;
  /** Cifras, períodos o fechas del texto sin respaldo. */
  sinRespaldo: string[];
}

export function verificarTexto(texto: string, ev: Evidencia): Verificacion {
  const { fechas, periodos, cifras } = extraerCifras(texto);
  const sinRespaldo: string[] = [];
  for (const f of fechas) {
    const anio = Number(f.slice(0, 4));
    if (!ev.fechas.has(f) && !ev.anios.has(anio)) sinRespaldo.push(f);
  }
  for (const p of periodos) {
    const anio = Number(p.slice(0, 4));
    const mes = Number(p.slice(5, 7));
    if (!ev.anios.has(anio) || mes < 1 || mes > 12) sinRespaldo.push(p);
  }
  for (const c of cifras) if (!cifraRespaldada(c, ev)) sinRespaldo.push(c.texto);
  return { ok: sinRespaldo.length === 0, sinRespaldo };
}

/**
 * Claves técnicas del catálogo (p. ej. `saldo_cxc`) o de empresa que el modelo dejó en el texto
 * se reemplazan por su nombre oficial. Primero las más largas para no partir una clave que
 * contiene a otra.
 */
export function reemplazarClaves(texto: string, nombres: Map<string, string>): string {
  const claves = [...nombres.keys()].filter((k) => /^[a-z0-9_]+$/.test(k) && k.includes('_')).sort((a, b) => b.length - a.length);
  let salida = texto;
  for (const clave of claves) {
    const nombre = nombres.get(clave);
    if (!nombre) continue;
    salida = salida.replace(new RegExp(`\`?\\b${clave}\\b\`?`, 'g'), nombre);
  }
  return salida;
}

// ---------------------------------------------------------------- plantilla

function estadoTexto(estado: 'certificada' | 'exploratoria'): string {
  return estado === 'certificada' ? 'Certificada.' : 'Exploratoria: no certificada, no la uses para decidir.';
}

function empresasTexto(empresas: string[] | undefined): string {
  if (!empresas || empresas.length === 0) return '';
  if (empresas.length <= 3) return ` Empresas: ${empresas.join(', ')}.`;
  return ` Incluye ${empresas.length} empresas.`;
}

const ES_SALDO = /^saldo_|_saldo$|inventario/;

function fraseConjunto(c: ConjuntoDatos, simbolo: string): string {
  const fmt = (n: number) => formatearCifra(n, c.unidad, simbolo);
  const corte = c.corte ? ` Dato al ${fechaCorta(c.corte)}.` : '';
  const cola = ` ${estadoTexto(c.estado)}${empresasTexto(c.empresas)}${corte}`;
  if (c.filas.length === 0) return `${c.metricaNombre}: sin datos para ${c.periodo}.${cola}`;

  if (c.tipo === 'serie') {
    const porPeriodo = new Map<string, number>();
    for (const f of c.filas) {
      const p = String(f['periodo'] ?? '');
      porPeriodo.set(p, (porPeriodo.get(p) ?? 0) + Number(f['valor'] ?? 0));
    }
    const periodos = [...porPeriodo.keys()].sort();
    const primero = periodos[0] ?? '';
    const ultimo = periodos[periodos.length - 1] ?? '';
    const valorUltimo = porPeriodo.get(ultimo) ?? 0;
    // Un saldo o una razón no se suman entre meses: se informa el último.
    const sumable = c.unidad !== 'porcentaje' && !ES_SALDO.test(c.metricaClave);
    if (periodos.length === 1 || !sumable) {
      return `${c.metricaNombre} en ${nombrePeriodo(ultimo)}: ${fmt(valorUltimo)}.${cola}`;
    }
    const total = [...porPeriodo.values()].reduce((a, b) => a + b, 0);
    return `${c.metricaNombre}, ${nombreRango(primero, ultimo)}: ${fmt(total)} en total; ${nombrePeriodo(ultimo)}: ${fmt(valorUltimo)}.${cola}`;
  }

  if (c.tipo === 'ranking') {
    const primera = c.filas[0] ?? {};
    const total = c.filas.reduce((a, f) => a + Number(f['valor'] ?? 0), 0);
    return `${c.titulo} (${c.periodo}): el primero es ${String(primera['miembro'] ?? '')} con ${fmt(Number(primera['valor'] ?? 0))}; los ${c.filas.length} listados suman ${fmt(total)}.${cola}`;
  }

  // aging
  const total = c.filas.reduce((a, f) => a + Number(f['saldo'] ?? 0), 0);
  const mayor = [...c.filas].sort((a, b) => Number(b['saldo'] ?? 0) - Number(a['saldo'] ?? 0))[0] ?? {};
  const etiqueta = String(mayor['rango'] ?? mayor['socio'] ?? '');
  return `${c.metricaNombre} (${c.periodo}): ${fmt(total)}; la mayor parte en ${etiqueta} con ${fmt(Number(mayor['saldo'] ?? 0))}.${cola}`;
}

/** Respuesta armada SOLO desde tarjetas y conjuntos (sin una palabra del modelo). */
export function plantillaRespuesta(tarjetas: TarjetaDato[], conjuntos: ConjuntoDatos[], simboloMoneda = 'Q'): string {
  if (conjuntos.length) return conjuntos.slice(0, 3).map((c) => fraseConjunto(c, simboloMoneda)).join(' ');
  if (tarjetas.length) {
    return tarjetas
      .slice(0, 3)
      .map((t) => `${t.metricaNombre}, ${nombrePeriodo(t.periodo)}${t.empresa ? ` (${t.empresa})` : ''}: ${formatearCifra(t.valor, t.unidad, simboloMoneda)}. ${estadoTexto(t.estado)}`)
      .join(' ');
  }
  return 'No tengo un dato consultado que respalde una cifra. Dime la métrica y el período y lo consulto.';
}
