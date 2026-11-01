/**
 * Laboratorio determinista del agente: un warehouse falso (EjecutorSql que responde a las
 * plantillas SQL constantes del paquete) y un cliente de Anthropic guionado. Lo usan la
 * evaluación (`eval.ts`) y las pruebas de integración del loop (`src/agente.spec.ts`).
 *
 * Los datos son inventados y fijos: misma entrada, mismo resultado, sin red ni base.
 */
import type Anthropic from '@anthropic-ai/sdk';

import * as SQL from '../src/tools/consultas';
import type { ConfigAgente, EjecutorSql } from '../src/tipos';

export const EMPRESAS = new Map([
  ['proavisa', 'Empresa Uno'],
  ['loreto', 'Empresa Dos'],
]);

export const PERIODOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];

interface MetricaLab {
  clave: string;
  nombre: string;
  dominio: string;
  estado: 'certificada' | 'exploratoria' | 'en_revision';
  base: number;
  desglose?: string[];
}

export const CATALOGO: MetricaLab[] = [
  { clave: 'ventas_netas_sin_iva', nombre: 'Ventas netas sin IVA', dominio: 'ventas', estado: 'certificada', base: 1_000_000, desglose: ['cliente', 'producto', 'vendedor'] },
  { clave: 'ventas_brutas_sin_iva', nombre: 'Ventas brutas sin IVA', dominio: 'ventas', estado: 'certificada', base: 1_100_000, desglose: ['cliente', 'producto'] },
  { clave: 'ventas_netas_con_iva', nombre: 'Ventas netas con IVA', dominio: 'ventas', estado: 'exploratoria', base: 1_120_000 },
  { clave: 'devoluciones_sin_iva', nombre: 'Devoluciones sin IVA', dominio: 'ventas', estado: 'certificada', base: 50_000 },
  { clave: 'margen_bruto', nombre: 'Margen bruto', dominio: 'rentabilidad', estado: 'certificada', base: 300_000 },
  { clave: 'saldo_cxc', nombre: 'Saldo por cobrar', dominio: 'tesoreria', estado: 'certificada', base: 2_000_000 },
  { clave: 'saldo_cxp', nombre: 'Saldo por pagar', dominio: 'tesoreria', estado: 'certificada', base: 900_000 },
  { clave: 'cobros_de_clientes', nombre: 'Cobros de clientes', dominio: 'tesoreria', estado: 'certificada', base: 950_000 },
  { clave: 'valor_inventario', nombre: 'Valor del inventario', dominio: 'inventario', estado: 'en_revision', base: 3_000_000 },
];

const FACTOR_EMPRESA: Record<string, number> = { proavisa: 1, loreto: 0.4 };

/** Valor fijo por (métrica, período, empresa): redondo para que las cifras se puedan leer. */
export function valorLab(clave: string, periodo: string, empresa: string): number {
  const m = CATALOGO.find((x) => x.clave === clave);
  if (!m) return 0;
  const mes = Number(periodo.slice(5, 7));
  return Math.round(m.base * (1 + mes * 0.03) * (FACTOR_EMPRESA[empresa] ?? 1));
}

const CLIENTES = ['Avícola Norte', 'Super Centro', 'Distribuidora Sur', 'Mercado Real', 'Tienda La Paz', 'Granja Vista', 'Hotel Sol'];

export interface OpcionesLab {
  /** Alcance de empresas del usuario: '*' o lista de empresa_id. */
  empresas?: '*' | string[];
}

/** Warehouse falso: despacha por la plantilla SQL constante recibida (identidad del texto). */
export function ejecutorLab(op: OpcionesLab = {}): EjecutorSql & { llamadas: string[] } {
  const llamadas: string[] = [];
  const alcanceEmpresas = op.empresas ?? '*';
  const consumibles = (soloCert: boolean) =>
    CATALOGO.filter((m) => (soloCert ? m.estado === 'certificada' : m.estado === 'certificada' || m.estado === 'exploratoria')).map((m) => ({
      clave: m.clave,
      nombre_oficial: m.nombre,
      definicion_negocio: `Definición de ${m.nombre.toLowerCase()}.`,
      estado: m.estado,
    }));

  const responder = async (sql: string, params: unknown[]): Promise<Record<string, unknown>[]> => {
    const nombre = Object.entries(SQL).find(([, v]) => v === sql)?.[0] ?? 'desconocida';
    llamadas.push(nombre);
    switch (sql) {
      case SQL.SQL_ALCANCES_USUARIO:
        return [
          ...(alcanceEmpresas === '*' ? [{ recurso_tipo: 'empresa', recurso_clave: '*' }] : alcanceEmpresas.map((e) => ({ recurso_tipo: 'empresa', recurso_clave: e }))),
          { recurso_tipo: 'metrica', recurso_clave: '*' },
        ];
      case SQL.SQL_METRICAS_CONSUMIBLES:
        return consumibles(false);
      case SQL.SQL_METRICAS_CERTIFICADAS:
        return consumibles(true);
      case SQL.SQL_DOMINIOS_METRICA:
        return CATALOGO.map((m) => ({ metrica_clave: m.clave, dominio: m.dominio }));
      case SQL.SQL_EMPRESAS_WAREHOUSE:
        return [...EMPRESAS.keys()].map((e) => ({ empresa_id: e }));
      case SQL.SQL_PERIODOS_METRICA:
        return CATALOGO.map((m) => ({ metrica_clave: m.clave, periodo_desde: PERIODOS[0], periodo_hasta: PERIODOS[PERIODOS.length - 1] }));
      case SQL.SQL_DERIVADAS:
        return [];
      case SQL.SQL_METRICAS_DESGLOSABLES:
        return CATALOGO.flatMap((m) => (m.desglose ?? []).map((d) => ({ metrica_clave: m.clave, dimension: d })));
      case SQL.SQL_METRICA_VALOR: {
        const [clave, desde, hasta, empresas] = params as [string, string | null, string | null, string[]];
        return PERIODOS.filter((p) => (!desde || p >= desde) && (!hasta || p <= hasta)).flatMap((p) =>
          empresas.filter((e) => EMPRESAS.has(e)).map((e) => ({ empresa_id: e, periodo: p, valor: valorLab(clave, p, e) })),
        );
      }
      case SQL.SQL_METRICA_DIMENSION: {
        const [clave, , desde, hasta, empresas, orden, limite] = params as [string, string, string | null, string | null, string[], string, number];
        const meses = PERIODOS.filter((p) => (!desde || p >= desde) && (!hasta || p <= hasta)).length;
        const filas = CLIENTES.map((c, i) => ({
          empresa_id: empresas[0] ?? 'proavisa',
          miembro_codigo: `C${i + 1}`,
          miembro_nombre: c,
          valor: Math.round(((CATALOGO.find((m) => m.clave === clave)?.base ?? 0) / (i + 2)) * meses),
          periodos: meses,
        }));
        filas.sort((a, b) => (orden === 'menor' ? a.valor - b.valor : b.valor - a.valor));
        return filas.slice(0, limite);
      }
      case SQL.SQL_AGING_CORTE:
        return [{ fecha_corte: '2026-10-30' }];
      case SQL.SQL_AGING_POR_RANGO: {
        const base = params[0] === 'cobrar' ? 2_000_000 : 900_000;
        return [
          { rango_aging: 'corriente', rango_nombre: 'Corriente', saldo: base * 0.5, partidas: 100 },
          { rango_aging: '1-30', rango_nombre: '1-30 días', saldo: base * 0.2, partidas: 40 },
          { rango_aging: '31-60', rango_nombre: '31-60 días', saldo: base * 0.15, partidas: 20 },
          { rango_aging: '61-90', rango_nombre: '61-90 días', saldo: base * 0.1, partidas: 10 },
          { rango_aging: '+90', rango_nombre: 'Más de 90 días', saldo: base * 0.05, partidas: 5 },
        ];
      }
      case SQL.SQL_AGING_POR_SOCIO:
        return CLIENTES.slice(0, Number(params[2] ?? 10)).map((c, i) => ({ socio_nombre: c, saldo: 400_000 / (i + 1), partidas: 10 - i }));
      case SQL.SQL_FICHA_METRICA: {
        const m = CATALOGO.find((x) => x.clave === params[0]);
        return m
          ? [{ clave: m.clave, nombre_oficial: m.nombre, definicion_negocio: `Definición de ${m.nombre.toLowerCase()}.`, formula: 'suma(...)', periodicidad: 'mensual', estado: m.estado, version_definicion: 1, hecho_nombre: 'Venta por línea', grano: 'línea' }]
          : [];
      }
      case SQL.SQL_GLOSARIO:
        return [
          { termino: 'ventas netas', definicion: 'Ventas menos devoluciones, sin IVA.', equivale_a: 'ventas_netas_sin_iva' },
          { termino: 'inventario', definicion: 'Valor del inventario al cierre.', equivale_a: 'valor_inventario' },
        ];
      case SQL.SQL_GLOSARIO_TENANT:
        return [];
      default:
        return [];
    }
  };
  return { llamadas, consultarTenant: responder, consultarControl: responder };
}

export function configLab(extra: Partial<ConfigAgente> = {}): ConfigAgente {
  return {
    apiKey: 'falsa',
    modelo: 'claude-opus-5-5',
    maxIteraciones: 4,
    maxTokens: 1200,
    nombreOrganizacion: 'Organización de laboratorio',
    empresas: EMPRESAS,
    glosario: [
      { termino: 'ventas netas', definicion: 'Ventas menos devoluciones, sin IVA.', equivaleA: 'ventas_netas_sin_iva' },
      { termino: 'inventario', definicion: 'Valor del inventario al cierre.', equivaleA: 'valor_inventario' },
    ],
    frescura: [
      { dominio: 'ventas', fechaDatoMasReciente: '2026-10-30' },
      { dominio: 'cartera_cobrar', fechaDatoMasReciente: '2026-10-30' },
      { dominio: 'cartera_pagar', fechaDatoMasReciente: '2026-10-29' },
      { dominio: 'pagos', fechaDatoMasReciente: '2026-10-29' },
    ],
    proximaCarga: 'hoy a las 18:00',
    fechaActual: '2026-10-31',
    soloCertificadas: false,
    modeloCompuerta: 'claude-haiku-5-5',
    moneda: 'GTQ',
    simboloMoneda: 'Q',
    contexto: null,
    ...extra,
  };
}

/** Paso guionado del modelo principal: texto y/o llamadas a tools. */
export interface PasoGuion {
  texto?: string;
  tools?: { name: string; input: Record<string, unknown> }[];
}

export interface Guion {
  /** Salida cruda de la compuerta (se serializa como JSON). */
  compuerta?: Record<string, unknown>;
  pasos: PasoGuion[];
}

/** Lo que el cliente guionado registró de cada llamada (para verificar parámetros enviados). */
export interface RegistroLlamada {
  tipo: 'compuerta' | 'principal';
  params: Record<string, unknown>;
}

/**
 * Cliente de Anthropic que responde según un guion. Distingue la compuerta (pide
 * `output_config.format`) del modelo principal (manda `tools`).
 */
export function clienteGuionado(guion: Guion, registro: RegistroLlamada[] = []): Anthropic {
  let paso = 0;
  const uso = { input_tokens: 1000, output_tokens: 80, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 };
  return {
    beta: {
      messages: {
        async create(params: Record<string, unknown>) {
          const cfg = params['output_config'] as { format?: unknown } | undefined;
          if (cfg?.format) {
            registro.push({ tipo: 'compuerta', params });
            return { content: [{ type: 'text', text: JSON.stringify(guion.compuerta ?? { intencion: 'consulta', metricas_candidatas: [], periodo_detectado: { desde: '', hasta: '' }, empresa_detectada: '', es_ambigua: false }) }], usage: { ...uso, input_tokens: 600, output_tokens: 40 }, stop_reason: 'end_turn' };
          }
          registro.push({ tipo: 'principal', params });
          const p = guion.pasos[paso] ?? { texto: 'Sin guion para este paso.' };
          paso += 1;
          const content: Record<string, unknown>[] = [];
          if (p.texto) content.push({ type: 'text', text: p.texto });
          (p.tools ?? []).forEach((t, i) => content.push({ type: 'tool_use', id: `tu_${paso}_${i}`, name: t.name, input: t.input }));
          return { content, usage: uso, stop_reason: p.tools?.length ? 'tool_use' : 'end_turn' };
        },
      },
    },
  } as unknown as Anthropic;
}
