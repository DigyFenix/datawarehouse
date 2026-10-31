/**
 * Ejecución gobernada de una tool: validar (Zod) → autorizar (alcance) → ejecutar
 * (SQL constante parametrizado) → construir tarjetas.
 *
 * Aquí convergen las cuatro guardas:
 *   1. Sin SQL libre  — solo constantes de `consultas.ts` con placeholders.
 *   2. Solo certificadas/exploratorias — el alcance ya viene intersectado con el catálogo.
 *   3. Alcance siempre — `empresa_id = any($n)` en toda consulta del warehouse; sin
 *      empresas autorizadas se deniega antes de ir a la base (y el RLS de Postgres es
 *      el piso que aguantaría un bug de este archivo).
 *   5. Dato + métrica + período + estado — las TarjetaDato se arman del catálogo y del
 *      resultado SQL, nunca del texto del modelo.
 */
import { z } from 'zod';

import { empresasParaConsulta } from '../alcances';
import { combinar, descripcionOperacion, type MetricaDerivada } from '../derivadas';
import { fichaDeMetrica } from '../catalogo';
import {
  SQL_AGING_CORTE,
  SQL_AGING_POR_RANGO,
  SQL_AGING_POR_SOCIO,
  SQL_METRICA_DIMENSION,
  SQL_METRICA_VALOR,
} from './consultas';
import {
  esquemaConsultarAging,
  esquemaConsultarMetrica,
  esquemaConsultarPorDimension,
  esquemaExplicarMetrica,
  esquemaListarMetricas,
} from './esquemas';
import type {
  AlcanceEfectivo,
  ConjuntoDatos,
  EjecutorSql,
  EventoAuditoria,
  TarjetaDato,
} from '../tipos';

export interface ContextoTool {
  ejecutor: EjecutorSql;
  alcance: AlcanceEfectivo;
  /** empresa_id → nombre visible; también define el universo cuando el alcance es '*'. */
  empresas: Map<string, string>;
}

export interface ResultadoTool {
  /** Texto que se devuelve al modelo como tool_result (JSON legible, sin adornos). */
  contenido: string;
  /** true = el modelo debe tratarlo como error (no autorizado / sin datos). */
  esError: boolean;
  tarjetas: TarjetaDato[];
  auditoria: EventoAuditoria;
  /** Datos tabulares de la respuesta (tabla/gráfica/CSV en la UI). Solo en consultas con dato. */
  conjunto?: ConjuntoDatos;
  /** Parámetros YA validados con los que se ejecutó (lo que se guarda para reejecutar). */
  params?: Record<string, unknown>;
}

/** Dominios de negocio válidos para los mensajes de orientación. */
function metricasDelAlcance(alcance: AlcanceEfectivo, dominio?: string): string[] {
  return [...alcance.metricas.values()]
    .filter((m) => !dominio || m.dominio === dominio)
    .map((m) => m.clave);
}

function denegado(
  mensaje: string,
  alcance: AlcanceEfectivo,
  detalle: Record<string, unknown>,
): ResultadoTool {
  const disponibles = metricasDelAlcance(alcance);
  return {
    contenido: JSON.stringify({
      error: mensaje,
      puede_consultar: disponibles.slice(0, 40),
    }),
    esError: true,
    tarjetas: [],
    auditoria: { accion: 'consulta_agente_denegada', detalle: { ...detalle, motivo: mensaje } },
  };
}

export async function ejecutarTool(
  nombre: string,
  entrada: unknown,
  ctx: ContextoTool,
): Promise<ResultadoTool> {
  switch (nombre) {
    case 'listar_metricas_disponibles':
      return listarMetricas(entrada, ctx);
    case 'consultar_metrica':
      return consultarMetrica(entrada, ctx);
    case 'consultar_aging':
      return consultarAging(entrada, ctx);
    case 'consultar_metrica_por_dimension':
      return consultarPorDimension(entrada, ctx);
    case 'explicar_metrica':
      return explicarMetrica(entrada, ctx);
    default:
      return denegado(`Herramienta desconocida: ${nombre}`, ctx.alcance, { tool: nombre });
  }
}

/** Zod → o error legible para el modelo (que puede corregir y reintentar).
 *  Genérico sobre el esquema (no sobre T) para que los `.default()` infieran bien. */
function validar<S extends z.ZodTypeAny>(
  esquema: S,
  entrada: unknown,
): { ok: true; datos: z.infer<S> } | { ok: false; error: string } {
  const r = esquema.safeParse(entrada);
  if (r.success) return { ok: true, datos: r.data as z.infer<S> };
  const detalle = r.error.issues
    .map((i: z.ZodIssue) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `Parámetros inválidos — ${detalle}` };
}

// ---------------------------------------------------------------- tools

async function listarMetricas(entrada: unknown, ctx: ContextoTool): Promise<ResultadoTool> {
  const v = validar(esquemaListarMetricas, entrada);
  if (!v.ok) return denegado(v.error, ctx.alcance, { tool: 'listar_metricas_disponibles' });

  const lista = [...ctx.alcance.metricas.values()]
    .filter((m) => !v.datos.dominio || m.dominio === v.datos.dominio)
    .map((m) => ({
      clave: m.clave,
      nombre: m.nombreOficial,
      definicion: m.definicionNegocio,
      dominio: m.dominio,
      estado: m.estado,
      periodos: m.periodoDesde && m.periodoHasta ? `${m.periodoDesde} a ${m.periodoHasta}` : 'sin datos',
    }));

  return {
    contenido: JSON.stringify({ metricas: lista, total: lista.length }),
    esError: false,
    tarjetas: [],
    auditoria: {
      accion: 'consulta_agente',
      detalle: { tool: 'listar_metricas_disponibles', dominio: v.datos.dominio ?? null, filas: lista.length },
    },
  };
}

/**
 * Valores de un indicador compuesto: se piden los dos operandos por separado y se
 * combinan por (empresa, período).
 *
 * Un período sólo aparece si AMBOS operandos lo tienen. Si un mes tiene ventas y no
 * tiene costo, el margen de ese mes no es cero: es desconocido, y en una plataforma
 * que vende certeza en el número inventarlo es el peor error posible.
 */
async function filasDeDerivada(
  derivada: MetricaDerivada,
  p: { periodo_desde?: string; periodo_hasta?: string; agrupar_por_empresa?: boolean },
  empresas: string[],
  ctx: ContextoTool,
): Promise<Record<string, unknown>[]> {
  const leerOperando = (clave: string) =>
    ctx.ejecutor.consultarTenant(SQL_METRICA_VALOR, [
      clave,
      p.periodo_desde ?? null,
      p.periodo_hasta ?? null,
      empresas,
    ]);
  const [filasA, filasB] = await Promise.all([
    leerOperando(derivada.operandoA),
    leerOperando(derivada.operandoB),
  ]);

  // Los operandos se SUMAN hasta la granularidad de salida ANTES de combinarlos.
  // Es la única forma correcta de agregar una razón: el margen del grupo es
  // (suma de márgenes / suma de ventas), NO la suma de los porcentajes de cada
  // empresa — eso daba cifras como «351 % de margen».
  const porEmpresa = p.agrupar_por_empresa === true;
  const acumular = (filas: Record<string, unknown>[]): Map<string, number> => {
    const mapa = new Map<string, number>();
    for (const f of filas) {
      const periodo = String(f['periodo']);
      const llave = porEmpresa ? `${String(f['empresa_id'] ?? '')}|${periodo}` : `|${periodo}`;
      mapa.set(llave, (mapa.get(llave) ?? 0) + Number(f['valor'] ?? 0));
    }
    return mapa;
  };

  const combinadas = combinar(derivada.operacion, acumular(filasA), acumular(filasB));
  return [...combinadas.entries()].map(([llave, valor]) => {
    const [empresaId, periodo] = llave.split('|');
    return { empresa_id: empresaId, periodo, valor };
  });
}

async function consultarMetrica(entrada: unknown, ctx: ContextoTool): Promise<ResultadoTool> {
  const v = validar(esquemaConsultarMetrica, entrada);
  if (!v.ok) return denegado(v.error, ctx.alcance, { tool: 'consultar_metrica' });
  const p = v.datos;

  // GUARDA 2 + 3: la clave debe estar en el alcance efectivo (que ya excluye estados no
  // consumibles). Si no está, se orienta sin revelar qué existe fuera del alcance.
  const metrica = ctx.alcance.metricas.get(p.metrica_clave);
  if (!metrica) {
    return denegado(
      `La métrica '${p.metrica_clave}' no está disponible para este usuario (no existe, no está certificada o está fuera de su autorización).`,
      ctx.alcance,
      { tool: 'consultar_metrica', metrica_clave: p.metrica_clave },
    );
  }

  const universo = [...ctx.empresas.keys()];
  const empresas = empresasParaConsulta(ctx.alcance, p.empresa_id, universo);
  if (empresas === null) {
    return denegado(
      p.empresa_id === undefined
        ? 'Este usuario no tiene ninguna empresa autorizada: no puede consultar datos.'
        : `La empresa ${p.empresa_id} está fuera del alcance de este usuario.`,
      ctx.alcance,
      { tool: 'consultar_metrica', metrica_clave: p.metrica_clave, empresa_id: p.empresa_id ?? null },
    );
  }

  // Si es un indicador compuesto por la organización, se leen sus dos operandos con
  // la MISMA plantilla constante y se combinan en código: una derivada no introduce
  // SQL nuevo ni escapa del filtro de empresas.
  const derivada = ctx.alcance.derivadas.get(p.metrica_clave);
  const filas = derivada
    ? await filasDeDerivada(derivada, p, empresas, ctx)
    : await ctx.ejecutor.consultarTenant(SQL_METRICA_VALOR, [
        p.metrica_clave,
        p.periodo_desde ?? null,
        p.periodo_hasta ?? null,
        empresas,
      ]);

  // Agregación de presentación: por período (default) o por período y empresa.
  const tarjetas: TarjetaDato[] = [];
  const porPeriodo = new Map<string, number>();
  const porPeriodoEmpresa: { periodo: string; empresaId: string; valor: number }[] = [];
  for (const f of filas) {
    const periodo = String(f['periodo']);
    const valor = Number(f['valor'] ?? 0);
    const empresaId = String(f['empresa_id'] ?? '');
    porPeriodo.set(periodo, (porPeriodo.get(periodo) ?? 0) + valor);
    porPeriodoEmpresa.push({ periodo, empresaId, valor });
  }

  if (p.agrupar_por_empresa) {
    for (const r of porPeriodoEmpresa) {
      tarjetas.push({
        metricaClave: metrica.clave,
        metricaNombre: metrica.nombreOficial,
        periodo: r.periodo,
        valor: r.valor,
        estado: metrica.estado,
        empresa: ctx.empresas.get(r.empresaId) ?? String(r.empresaId),
      });
    }
  } else {
    for (const [periodo, valor] of porPeriodo) {
      tarjetas.push({
        metricaClave: metrica.clave,
        metricaNombre: metrica.nombreOficial,
        periodo,
        valor,
        estado: metrica.estado,
      });
    }
  }

  const contenido = JSON.stringify({
    metrica: metrica.nombreOficial,
    clave: metrica.clave,
    estado: metrica.estado,
    definicion: metrica.definicionNegocio,
    empresas_incluidas: empresas.map((e) => ctx.empresas.get(e) ?? String(e)),
    valores: tarjetas.map((t) => ({
      periodo: t.periodo,
      valor: t.valor,
      ...(t.empresa ? { empresa: t.empresa } : {}),
    })),
    total_periodos: porPeriodo.size,
  });

  const periodos = [...porPeriodo.keys()].sort();
  const conjunto: ConjuntoDatos = {
    tipo: 'serie',
    titulo: `${metrica.nombreOficial} por mes`,
    metricaClave: metrica.clave,
    metricaNombre: metrica.nombreOficial,
    estado: metrica.estado,
    periodo: periodos.length ? `${periodos[0]} a ${periodos[periodos.length - 1]}` : 'sin datos',
    columnas: [
      { clave: 'periodo', nombre: 'Período', tipo: 'periodo' },
      ...(p.agrupar_por_empresa ? [{ clave: 'empresa', nombre: 'Empresa', tipo: 'texto' as const }] : []),
      { clave: 'valor', nombre: metrica.nombreOficial, tipo: 'numero' },
    ],
    filas: tarjetas.map((t) => ({ periodo: t.periodo, ...(p.agrupar_por_empresa ? { empresa: t.empresa ?? '' } : {}), valor: t.valor })),
  };

  return {
    contenido,
    esError: false,
    tarjetas,
    conjunto,
    params: p,
    auditoria: {
      accion: 'consulta_agente',
      detalle: {
        tool: 'consultar_metrica',
        metrica_clave: p.metrica_clave,
        periodo_desde: p.periodo_desde ?? null,
        periodo_hasta: p.periodo_hasta ?? null,
        empresas,
        filas: filas.length,
      },
    },
  };
}

async function consultarAging(entrada: unknown, ctx: ContextoTool): Promise<ResultadoTool> {
  const v = validar(esquemaConsultarAging, entrada);
  if (!v.ok) return denegado(v.error, ctx.alcance, { tool: 'consultar_aging' });
  const p = v.datos;

  // El aging es tesorería: exige alcance sobre el saldo correspondiente.
  const claveExigida = p.tipo_cartera === 'cobrar' ? 'saldo_cxc' : 'saldo_cxp';
  const metrica = ctx.alcance.metricas.get(claveExigida);
  if (!metrica) {
    return denegado(
      `La cartera por ${p.tipo_cartera} no está autorizada para este usuario.`,
      ctx.alcance,
      { tool: 'consultar_aging', tipo_cartera: p.tipo_cartera },
    );
  }

  const universo = [...ctx.empresas.keys()];
  const empresas = empresasParaConsulta(ctx.alcance, p.empresa_id, universo);
  if (empresas === null) {
    return denegado(
      'Este usuario no tiene empresas autorizadas para consultar cartera.',
      ctx.alcance,
      { tool: 'consultar_aging', empresa_id: p.empresa_id ?? null },
    );
  }

  const corteFilas = await ctx.ejecutor.consultarTenant(SQL_AGING_CORTE, [p.tipo_cartera, empresas]);
  const corte = corteFilas[0]?.['fecha_corte'];
  // pg entrega `date` como Date (hora local): se formatea como ISO sin pasar por toISOString,
  // que correría el día en zonas al oeste de UTC.
  const fechaCorte =
    corte == null
      ? null
      : corte instanceof Date
        ? `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, '0')}-${String(corte.getDate()).padStart(2, '0')}`
        : String(corte).slice(0, 10);

  const filas =
    p.detalle === 'por_socio'
      ? await ctx.ejecutor.consultarTenant(SQL_AGING_POR_SOCIO, [
          p.tipo_cartera,
          empresas,
          p.limite_socios,
        ])
      : await ctx.ejecutor.consultarTenant(SQL_AGING_POR_RANGO, [p.tipo_cartera, empresas]);

  const detalle =
    p.detalle === 'por_socio'
      ? filas.map((f) => ({
          socio: String(f['socio_nombre'] ?? 'Sin nombre'),
          saldo: Number(f['saldo'] ?? 0),
          partidas: Number(f['partidas'] ?? 0),
        }))
      : filas.map((f) => ({
          rango: String(f['rango_nombre'] ?? f['rango_aging']),
          codigo: String(f['rango_aging']),
          saldo: Number(f['saldo'] ?? 0),
          partidas: Number(f['partidas'] ?? 0),
        }));

  const total = detalle.reduce((acc, d) => acc + d.saldo, 0);
  // La cartera es un STOCK: el período de la tarjeta es el mes del corte, no un rango.
  const periodo = fechaCorte ? fechaCorte.slice(0, 7) : 'sin corte';
  const tarjetas: TarjetaDato[] = [
    {
      metricaClave: metrica.clave,
      metricaNombre: metrica.nombreOficial,
      periodo,
      valor: total,
      estado: metrica.estado,
    },
  ];

  const porSocio = p.detalle === 'por_socio';
  const conjunto: ConjuntoDatos = {
    tipo: 'aging',
    titulo: `${metrica.nombreOficial} · ${porSocio ? 'mayores socios' : 'antigüedad'}`,
    metricaClave: metrica.clave,
    metricaNombre: metrica.nombreOficial,
    estado: metrica.estado,
    periodo: fechaCorte ? `corte ${fechaCorte}` : 'sin corte',
    columnas: [
      porSocio ? { clave: 'socio', nombre: 'Socio', tipo: 'texto' } : { clave: 'rango', nombre: 'Rango de antigüedad', tipo: 'texto' },
      { clave: 'saldo', nombre: 'Saldo', tipo: 'numero' },
      { clave: 'partidas', nombre: 'Partidas', tipo: 'numero' },
    ],
    filas: detalle.map((d) => {
      const fila: Record<string, string | number | null> = { saldo: d.saldo, partidas: d.partidas };
      if ('socio' in d) fila['socio'] = d.socio;
      else fila['rango'] = d.rango;
      return fila;
    }),
  };

  return {
    contenido: JSON.stringify({
      tipo_cartera: p.tipo_cartera,
      metrica: metrica.nombreOficial,
      estado: metrica.estado,
      fecha_corte: fechaCorte,
      nota: 'La cartera es un saldo a la fecha de corte (foto), no un flujo del período.',
      total,
      detalle,
    }),
    esError: false,
    tarjetas,
    conjunto,
    params: p,
    auditoria: {
      accion: 'consulta_agente',
      detalle: {
        tool: 'consultar_aging',
        tipo_cartera: p.tipo_cartera,
        detalle: p.detalle,
        empresas,
        fecha_corte: fechaCorte,
        filas: filas.length,
      },
    },
  };
}

const NOMBRE_DIMENSION: Record<string, string> = {
  cliente: 'Cliente', producto: 'Producto', linea: 'Línea', vendedor: 'Vendedor',
  canal: 'Canal', sector: 'Sector', proveedor: 'Proveedor',
};

/**
 * Desglose de una métrica por dimensión (ranking). Mismas guardas que consultar_metrica,
 * más una: la métrica tiene que estar en `alcance.desglosables` para esa dimensión. Las
 * derivadas no se desglosan (una razón no se suma por miembro).
 */
async function consultarPorDimension(entrada: unknown, ctx: ContextoTool): Promise<ResultadoTool> {
  const v = validar(esquemaConsultarPorDimension, entrada);
  if (!v.ok) return denegado(v.error, ctx.alcance, { tool: 'consultar_metrica_por_dimension' });
  const p = v.datos;

  const metrica = ctx.alcance.metricas.get(p.metrica_clave);
  if (!metrica) {
    return denegado(
      `La métrica '${p.metrica_clave}' no está disponible para este usuario (no existe, no está certificada o está fuera de su autorización).`,
      ctx.alcance,
      { tool: 'consultar_metrica_por_dimension', metrica_clave: p.metrica_clave },
    );
  }
  const dimensiones = ctx.alcance.desglosables.get(p.metrica_clave) ?? [];
  if (!dimensiones.includes(p.dimension)) {
    return {
      contenido: JSON.stringify({
        error: dimensiones.length
          ? `La métrica '${p.metrica_clave}' no se desglosa por ${p.dimension}. Dimensiones disponibles: ${dimensiones.join(', ')}.`
          : `La métrica '${p.metrica_clave}' no admite desglose por dimensión (es un saldo, una razón o un indicador compuesto). Consúltala por período con consultar_metrica.`,
      }),
      esError: true,
      tarjetas: [],
      auditoria: {
        accion: 'consulta_agente_denegada',
        detalle: { tool: 'consultar_metrica_por_dimension', metrica_clave: p.metrica_clave, dimension: p.dimension, motivo: 'dimension_no_disponible' },
      },
    };
  }

  const universo = [...ctx.empresas.keys()];
  const empresas = empresasParaConsulta(ctx.alcance, p.empresa_id, universo);
  if (empresas === null) {
    return denegado(
      p.empresa_id === undefined
        ? 'Este usuario no tiene ninguna empresa autorizada: no puede consultar datos.'
        : `La empresa ${p.empresa_id} está fuera del alcance de este usuario.`,
      ctx.alcance,
      { tool: 'consultar_metrica_por_dimension', metrica_clave: p.metrica_clave, empresa_id: p.empresa_id ?? null },
    );
  }

  const filas = await ctx.ejecutor.consultarTenant(SQL_METRICA_DIMENSION, [
    p.metrica_clave,
    p.dimension,
    p.periodo_desde ?? null,
    p.periodo_hasta ?? null,
    empresas,
    p.orden,
    p.limite,
  ]);
  const detalle = filas.map((f) => ({
    miembro: String(f['miembro_nombre'] ?? 'Sin nombre'),
    codigo: String(f['miembro_codigo'] ?? ''),
    empresa: ctx.empresas.get(String(f['empresa_id'] ?? '')) ?? String(f['empresa_id'] ?? ''),
    valor: Number(f['valor'] ?? 0),
  }));
  // Con varias sociedades en el alcance, el mismo código puede existir en dos maestros: el
  // miembro se muestra calificado por empresa para no fusionarlos.
  const multiempresa = new Set(detalle.map((d) => d.empresa)).size > 1;
  const total = detalle.reduce((acc, d) => acc + d.valor, 0);
  const rango = p.periodo_desde || p.periodo_hasta
    ? `${p.periodo_desde ?? 'inicio'} a ${p.periodo_hasta ?? 'último dato'}`
    : 'todos los períodos con datos';
  const etiqueta = NOMBRE_DIMENSION[p.dimension] ?? p.dimension;

  const conjunto: ConjuntoDatos = {
    tipo: 'ranking',
    titulo: `${metrica.nombreOficial} por ${etiqueta.toLowerCase()} · ${p.orden === 'menor' ? 'menores' : 'mayores'} ${p.limite}`,
    metricaClave: metrica.clave,
    metricaNombre: metrica.nombreOficial,
    estado: metrica.estado,
    periodo: rango,
    columnas: [
      { clave: 'miembro', nombre: etiqueta, tipo: 'texto' },
      ...(multiempresa ? [{ clave: 'empresa', nombre: 'Empresa', tipo: 'texto' as const }] : []),
      { clave: 'valor', nombre: metrica.nombreOficial, tipo: 'numero' },
    ],
    filas: detalle.map((d) => ({ miembro: d.miembro, ...(multiempresa ? { empresa: d.empresa } : {}), valor: d.valor })),
  };

  return {
    contenido: JSON.stringify({
      metrica: metrica.nombreOficial,
      clave: metrica.clave,
      estado: metrica.estado,
      dimension: p.dimension,
      periodos: rango,
      empresas_incluidas: empresas.map((e) => ctx.empresas.get(e) ?? String(e)),
      orden: p.orden,
      total_de_los_listados: total,
      nota: 'La suma de TODOS los miembros de un período coincide con el valor mensual de la métrica; aquí solo van los listados.',
      detalle,
    }),
    esError: false,
    tarjetas: [],
    conjunto,
    params: p,
    auditoria: {
      accion: 'consulta_agente',
      detalle: {
        tool: 'consultar_metrica_por_dimension',
        metrica_clave: p.metrica_clave,
        dimension: p.dimension,
        periodo_desde: p.periodo_desde ?? null,
        periodo_hasta: p.periodo_hasta ?? null,
        empresas,
        limite: p.limite,
        orden: p.orden,
        filas: filas.length,
      },
    },
  };
}

async function explicarMetrica(entrada: unknown, ctx: ContextoTool): Promise<ResultadoTool> {
  const v = validar(esquemaExplicarMetrica, entrada);
  if (!v.ok) return denegado(v.error, ctx.alcance, { tool: 'explicar_metrica' });
  const p = v.datos;

  const autorizada = ctx.alcance.metricas.get(p.metrica_clave);
  if (!autorizada) {
    return denegado(
      `La métrica '${p.metrica_clave}' no está disponible para este usuario.`,
      ctx.alcance,
      { tool: 'explicar_metrica', metrica_clave: p.metrica_clave },
    );
  }

  // Un indicador propio de la organización no está en el catálogo del producto: su
  // ficha se arma con su composición, que es exactamente lo que hay que explicar.
  const derivada = ctx.alcance.derivadas.get(p.metrica_clave);
  if (derivada) {
    const nombreDe = (clave: string) => ctx.alcance.metricas.get(clave)?.nombreOficial ?? clave;
    return {
      contenido: JSON.stringify({
        metrica: autorizada.nombreOficial,
        clave: derivada.clave,
        estado: autorizada.estado,
        definicion: derivada.definicion,
        origen: 'Indicador definido por la organización',
        se_calcula_como: descripcionOperacion(
          derivada.operacion,
          nombreDe(derivada.operandoA),
          nombreDe(derivada.operandoB),
        ),
        periodos:
          autorizada.periodoDesde && autorizada.periodoHasta
            ? `${autorizada.periodoDesde} a ${autorizada.periodoHasta}`
            : 'sin datos',
      }),
      esError: false,
      tarjetas: [],
      auditoria: {
        accion: 'consulta_agente',
        detalle: { tool: 'explicar_metrica', metrica_clave: p.metrica_clave, derivada: true },
      },
    };
  }

  const ficha = await fichaDeMetrica(ctx.ejecutor, p.metrica_clave);
  if (!ficha) {
    return denegado(
      `La métrica '${p.metrica_clave}' no tiene ficha en el catálogo de gobierno.`,
      ctx.alcance,
      { tool: 'explicar_metrica', metrica_clave: p.metrica_clave },
    );
  }

  return {
    contenido: JSON.stringify({
      clave: ficha.clave,
      nombre_oficial: ficha.nombreOficial,
      definicion: ficha.definicionNegocio,
      formula: ficha.formula,
      periodicidad: ficha.periodicidad,
      estado: ficha.estado,
      version: ficha.versionDefinicion,
      origen: ficha.hechoNombre ? `${ficha.hechoNombre} (grano: ${ficha.grano ?? 'n/d'})` : null,
    }),
    esError: false,
    tarjetas: [],
    auditoria: {
      accion: 'consulta_agente',
      detalle: { tool: 'explicar_metrica', metrica_clave: p.metrica_clave },
    },
  };
}
