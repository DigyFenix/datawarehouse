/**
 * DESCARGA AUTOSERVICIO de datos tabulados (Excel) — misma capa semántica, mismas guardas.
 *
 * El usuario elige un módulo (dominio), una o varias métricas, el nivel de detalle y el
 * rango de períodos; el código valida (Zod), autoriza (alcance efectivo) y ejecuta SQL
 * constante bajo el RLS de quien descarga. Lo que sale es `oro.metrica_valor`,
 * `oro.metrica_valor_dimension` u `oro.metrica_aging`: nunca un hecho crudo, nunca Bronce
 * ni Plata (CLAUDE.md §11 y §14). El archivo lleva una hoja de ficha con métrica,
 * definición, estado de certificación, período, empresas y frescura: el dato sale del
 * portal con su gobierno pegado.
 */
import { z } from 'zod';

import { empresasParaConsulta, resolverAlcance } from './alcances';
import {
  SQL_AGING_CORTE,
  SQL_AGING_POR_RANGO,
  SQL_DESCARGA_AGING_SOCIO,
  SQL_DESCARGA_DIMENSION_MENSUAL,
  SQL_METRICA_DIMENSION,
  SQL_METRICA_VALOR,
} from './tools/consultas';
import { DIMENSIONES } from './tools/esquemas';
import type { EjecutorSql, EventoAuditoria, MetricaAutorizada } from './tipos';

/** Tope de filas por hoja: protege al servidor y al Excel de quien descarga. */
export const TOPE_FILAS_DESCARGA = 50_000;

export const NIVELES_DESCARGA = [
  'mensual', // período → valor (sumando empresas)
  'mensual_empresa', // período × empresa → valor
  'mensual_dimension', // período × miembro de la dimensión → valor
  'dimension_total', // miembro → suma del rango (todos los miembros, sin tope de ranking)
  'aging_rango', // cartera: rango de antigüedad → saldo (último corte)
  'aging_socio', // cartera: socio × rango → saldo (último corte)
] as const;
export type NivelDescarga = (typeof NIVELES_DESCARGA)[number];

const periodo = z.string().regex(/^\d{4}-\d{2}$/, "período inválido (formato 'YYYY-MM')");
const clave = z.string().regex(/^[a-z0-9_]+$/);

export const esquemaDescarga = z
  .object({
    metricas: z.array(clave).min(1).max(10),
    nivel: z.enum(NIVELES_DESCARGA),
    periodo_desde: periodo.optional(),
    periodo_hasta: periodo.optional(),
    empresa_id: clave.optional(),
    dimension: z.enum(DIMENSIONES).optional(),
  })
  .strict()
  .refine((o) => !o.nivel.includes('dimension') || o.dimension !== undefined, {
    message: 'El nivel por dimensión exige indicar la dimensión',
    path: ['dimension'],
  });
export type ParamsDescarga = z.infer<typeof esquemaDescarga>;

export interface ColumnaDescarga {
  clave: string;
  nombre: string;
  tipo: 'texto' | 'numero' | 'periodo';
}

export interface HojaDescarga {
  /** Nombre de la hoja (≤ 31 caracteres, sin caracteres prohibidos por Excel). */
  nombre: string;
  metricaClave: string;
  metricaNombre: string;
  estado: 'certificada' | 'exploratoria';
  definicion: string;
  nivel: NivelDescarga;
  periodo: string;
  columnas: ColumnaDescarga[];
  filas: Record<string, string | number | null>[];
  /** true si se alcanzó el tope de filas (el usuario debe acotar el rango). */
  truncada: boolean;
}

export interface ResultadoDescarga {
  ok: boolean;
  motivo?: string;
  hojas: HojaDescarga[];
  /** Empresas incluidas (nombre visible). */
  empresas: string[];
  auditoria: EventoAuditoria;
}

export interface EntradaDescarga {
  ejecutor: EjecutorSql;
  usuarioId: number;
  empresas: Map<string, string>;
  params: unknown;
  /** Misma configuración que el chat: solo certificadas. */
  soloCertificadas?: boolean;
}

const NOMBRE_DIMENSION: Record<string, string> = {
  cliente: 'Cliente',
  producto: 'Producto',
  linea: 'Línea',
  vendedor: 'Vendedor',
  canal: 'Canal',
  sector: 'Sector',
  proveedor: 'Proveedor',
};

/** Nombre de hoja válido para Excel: sin []:*?/\ y máximo 31 caracteres, único. */
function nombreHoja(base: string, usados: Set<string>): string {
  const limpioBase = base.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Datos';
  let limpio = limpioBase.slice(0, 31);
  let n = 2;
  while (usados.has(limpio.toLowerCase())) {
    const sufijo = ` (${n})`;
    limpio = `${limpioBase.slice(0, 31 - sufijo.length)}${sufijo}`;
    n += 1;
  }
  usados.add(limpio.toLowerCase());
  return limpio;
}

function fechaIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

/**
 * Prepara las hojas de una descarga. No escribe el archivo (eso es del host, que elige
 * la librería): devuelve datos tabulares ya gobernados o el motivo del rechazo.
 */
export async function prepararDescarga(entrada: EntradaDescarga): Promise<ResultadoDescarga> {
  const { ejecutor, usuarioId, empresas: universoNombres } = entrada;
  const v = esquemaDescarga.safeParse(entrada.params);
  const rechazo = (motivo: string, detalle: Record<string, unknown> = {}): ResultadoDescarga => ({
    ok: false,
    motivo,
    hojas: [],
    empresas: [],
    auditoria: { accion: 'consulta_agente_denegada', detalle: { origen: 'descarga', motivo, ...detalle } },
  });
  if (!v.success) {
    return rechazo(
      `Parámetros inválidos — ${v.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ')}`,
    );
  }
  const p = v.data;

  const alcance = await resolverAlcance(ejecutor, usuarioId, { soloCertificadas: entrada.soloCertificadas });
  const universo = [...universoNombres.keys()];
  const empresas = empresasParaConsulta(alcance, p.empresa_id, universo);
  if (empresas === null) {
    return rechazo(
      p.empresa_id === undefined
        ? 'Este usuario no tiene ninguna empresa autorizada: no puede descargar datos.'
        : `La empresa ${p.empresa_id} está fuera del alcance de este usuario.`,
      { empresa_id: p.empresa_id ?? null },
    );
  }

  // Cada métrica pedida debe estar en el alcance efectivo (certificada/exploratoria y autorizada).
  const metricas: MetricaAutorizada[] = [];
  for (const c of p.metricas) {
    const m = alcance.metricas.get(c);
    if (!m) return rechazo(`La métrica '${c}' no está disponible para este usuario.`, { metrica_clave: c });
    if (alcance.derivadas.has(c) && p.nivel !== 'mensual') {
      return rechazo(`El indicador '${m.nombreOficial}' es compuesto: solo se descarga por mes.`, { metrica_clave: c });
    }
    metricas.push(m);
  }

  const esAging = p.nivel === 'aging_rango' || p.nivel === 'aging_socio';
  if (esAging) {
    for (const m of metricas) {
      if (m.clave !== 'saldo_cxc' && m.clave !== 'saldo_cxp') {
        return rechazo(
          `La antigüedad de cartera solo aplica a los saldos por cobrar o por pagar (no a '${m.nombreOficial}').`,
          { metrica_clave: m.clave },
        );
      }
    }
  }
  if (p.dimension) {
    for (const m of metricas) {
      const dims = alcance.desglosables.get(m.clave) ?? [];
      if (!dims.includes(p.dimension)) {
        return rechazo(
          dims.length
            ? `'${m.nombreOficial}' no se desglosa por ${p.dimension}. Dimensiones disponibles: ${dims.join(', ')}.`
            : `'${m.nombreOficial}' no admite desglose por dimensión.`,
          { metrica_clave: m.clave, dimension: p.dimension },
        );
      }
    }
  }

  const nombreEmpresa = (id: unknown): string => universoNombres.get(String(id ?? '')) ?? String(id ?? '');
  const rango =
    p.periodo_desde || p.periodo_hasta
      ? `${p.periodo_desde ?? 'inicio'} a ${p.periodo_hasta ?? 'último dato'}`
      : 'todos los períodos con datos';
  const usados = new Set<string>();
  const hojas: HojaDescarga[] = [];

  for (const m of metricas) {
    const base = {
      metricaClave: m.clave,
      metricaNombre: m.nombreOficial,
      estado: m.estado,
      definicion: m.definicionNegocio,
      nivel: p.nivel,
    };

    if (p.nivel === 'mensual' || p.nivel === 'mensual_empresa') {
      // Una derivada por mes se calcula como en el chat: aquí solo se admiten métricas del
      // catálogo; la composición se resuelve en el host si hiciera falta (hoy no se descarga).
      const filas = await ejecutor.consultarTenant(SQL_METRICA_VALOR, [
        m.clave,
        p.periodo_desde ?? null,
        p.periodo_hasta ?? null,
        empresas,
      ]);
      if (p.nivel === 'mensual_empresa') {
        hojas.push({
          ...base,
          nombre: nombreHoja(m.nombreOficial, usados),
          periodo: rango,
          truncada: false,
          columnas: [
            { clave: 'periodo', nombre: 'Período', tipo: 'periodo' },
            { clave: 'empresa', nombre: 'Empresa', tipo: 'texto' },
            { clave: 'valor', nombre: m.nombreOficial, tipo: 'numero' },
          ],
          filas: filas.map((f) => ({
            periodo: String(f['periodo']),
            empresa: nombreEmpresa(f['empresa_id']),
            valor: Number(f['valor'] ?? 0),
          })),
        });
      } else {
        const porPeriodo = new Map<string, number>();
        for (const f of filas) {
          const per = String(f['periodo']);
          porPeriodo.set(per, (porPeriodo.get(per) ?? 0) + Number(f['valor'] ?? 0));
        }
        hojas.push({
          ...base,
          nombre: nombreHoja(m.nombreOficial, usados),
          periodo: rango,
          truncada: false,
          columnas: [
            { clave: 'periodo', nombre: 'Período', tipo: 'periodo' },
            { clave: 'valor', nombre: m.nombreOficial, tipo: 'numero' },
          ],
          filas: [...porPeriodo.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([per, valor]) => ({ periodo: per, valor })),
        });
      }
      continue;
    }

    if (p.nivel === 'mensual_dimension' && p.dimension) {
      const filas = await ejecutor.consultarTenant(SQL_DESCARGA_DIMENSION_MENSUAL, [
        m.clave,
        p.dimension,
        p.periodo_desde ?? null,
        p.periodo_hasta ?? null,
        empresas,
        TOPE_FILAS_DESCARGA,
      ]);
      const etiqueta = NOMBRE_DIMENSION[p.dimension] ?? p.dimension;
      hojas.push({
        ...base,
        nombre: nombreHoja(`${m.nombreOficial} x ${etiqueta}`, usados),
        periodo: rango,
        truncada: filas.length >= TOPE_FILAS_DESCARGA,
        columnas: [
          { clave: 'periodo', nombre: 'Período', tipo: 'periodo' },
          { clave: 'empresa', nombre: 'Empresa', tipo: 'texto' },
          { clave: 'codigo', nombre: `Código ${etiqueta.toLowerCase()}`, tipo: 'texto' },
          { clave: 'miembro', nombre: etiqueta, tipo: 'texto' },
          { clave: 'valor', nombre: m.nombreOficial, tipo: 'numero' },
        ],
        filas: filas.map((f) => ({
          periodo: String(f['periodo']),
          empresa: nombreEmpresa(f['empresa_id']),
          codigo: String(f['miembro_codigo'] ?? ''),
          miembro: String(f['miembro_nombre'] ?? 'Sin nombre'),
          valor: Number(f['valor'] ?? 0),
        })),
      });
      continue;
    }

    if (p.nivel === 'dimension_total' && p.dimension) {
      const filas = await ejecutor.consultarTenant(SQL_METRICA_DIMENSION, [
        m.clave,
        p.dimension,
        p.periodo_desde ?? null,
        p.periodo_hasta ?? null,
        empresas,
        'mayor',
        TOPE_FILAS_DESCARGA,
      ]);
      const etiqueta = NOMBRE_DIMENSION[p.dimension] ?? p.dimension;
      hojas.push({
        ...base,
        nombre: nombreHoja(`${m.nombreOficial} por ${etiqueta}`, usados),
        periodo: rango,
        truncada: filas.length >= TOPE_FILAS_DESCARGA,
        columnas: [
          { clave: 'empresa', nombre: 'Empresa', tipo: 'texto' },
          { clave: 'codigo', nombre: `Código ${etiqueta.toLowerCase()}`, tipo: 'texto' },
          { clave: 'miembro', nombre: etiqueta, tipo: 'texto' },
          { clave: 'valor', nombre: m.nombreOficial, tipo: 'numero' },
          { clave: 'periodos', nombre: 'Meses con dato', tipo: 'numero' },
        ],
        filas: filas.map((f) => ({
          empresa: nombreEmpresa(f['empresa_id']),
          codigo: String(f['miembro_codigo'] ?? ''),
          miembro: String(f['miembro_nombre'] ?? 'Sin nombre'),
          valor: Number(f['valor'] ?? 0),
          periodos: Number(f['periodos'] ?? 0),
        })),
      });
      continue;
    }

    if (esAging) {
      const tipoCartera = m.clave === 'saldo_cxp' ? 'pagar' : 'cobrar';
      const corteFilas = await ejecutor.consultarTenant(SQL_AGING_CORTE, [tipoCartera, empresas]);
      const corte = fechaIso(corteFilas[0]?.['fecha_corte']);
      const periodoTxt = corte ? `corte ${corte}` : 'sin corte';
      if (p.nivel === 'aging_rango') {
        const filas = await ejecutor.consultarTenant(SQL_AGING_POR_RANGO, [tipoCartera, empresas]);
        hojas.push({
          ...base,
          nombre: nombreHoja(`${m.nombreOficial} por antigüedad`, usados),
          periodo: periodoTxt,
          truncada: false,
          columnas: [
            { clave: 'rango', nombre: 'Rango de antigüedad', tipo: 'texto' },
            { clave: 'saldo', nombre: 'Saldo', tipo: 'numero' },
            { clave: 'partidas', nombre: 'Partidas', tipo: 'numero' },
          ],
          filas: filas.map((f) => ({
            rango: String(f['rango_nombre'] ?? f['rango_aging'] ?? ''),
            saldo: Number(f['saldo'] ?? 0),
            partidas: Number(f['partidas'] ?? 0),
          })),
        });
      } else {
        const filas = await ejecutor.consultarTenant(SQL_DESCARGA_AGING_SOCIO, [tipoCartera, empresas, TOPE_FILAS_DESCARGA]);
        hojas.push({
          ...base,
          nombre: nombreHoja(`${m.nombreOficial} por socio`, usados),
          periodo: periodoTxt,
          truncada: filas.length >= TOPE_FILAS_DESCARGA,
          columnas: [
            { clave: 'empresa', nombre: 'Empresa', tipo: 'texto' },
            { clave: 'codigo', nombre: 'Código socio', tipo: 'texto' },
            { clave: 'socio', nombre: 'Socio de negocio', tipo: 'texto' },
            { clave: 'rango', nombre: 'Rango de antigüedad', tipo: 'texto' },
            { clave: 'saldo', nombre: 'Saldo', tipo: 'numero' },
            { clave: 'partidas', nombre: 'Partidas', tipo: 'numero' },
          ],
          filas: filas.map((f) => ({
            empresa: nombreEmpresa(f['empresa_id']),
            codigo: String(f['socio_codigo'] ?? ''),
            socio: String(f['socio_nombre'] ?? 'Sin nombre'),
            rango: String(f['rango_nombre'] ?? f['rango_aging'] ?? ''),
            saldo: Number(f['saldo'] ?? 0),
            partidas: Number(f['partidas'] ?? 0),
          })),
        });
      }
    }
  }

  return {
    ok: true,
    hojas,
    empresas: empresas.map(nombreEmpresa),
    auditoria: {
      accion: 'descarga_datos',
      detalle: {
        metricas: p.metricas,
        nivel: p.nivel,
        dimension: p.dimension ?? null,
        periodo_desde: p.periodo_desde ?? null,
        periodo_hasta: p.periodo_hasta ?? null,
        empresas,
        filas: hojas.reduce((acc, h) => acc + h.filas.length, 0),
      },
    },
  };
}
