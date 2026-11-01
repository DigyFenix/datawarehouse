/**
 * ACCIONES SIN MODELO: botones de desambiguación, sugerencias y repeticiones.
 *
 * Una acción es (tool, params) armada por el CÓDIGO desde el alcance. Al hacer clic, el host la
 * manda a `POST /agente/conversaciones/:id/accion` y aquí se valida con el mismo Zod estricto,
 * se ejecuta con las mismas guardas (catálogo, alcance, RLS) que cuando la pide el modelo, y la
 * respuesta se redacta con la plantilla del código. Igual que `guardada.ts`: cero tokens, cero
 * margen para que el modelo se desvíe.
 */
import { z } from 'zod';

import { resolverAlcance } from './alcances';
import { nombreRango } from './formato';
import { plantillaRespuesta } from './grounding';
import { validarEspecificacion } from './guardada';
import { ejecutarTool } from './tools/ejecutar';
import { esquemaExplicarMetrica } from './tools/esquemas';
import type {
  AccionTool,
  AlcanceEfectivo,
  ConjuntoDatos,
  ConsultaEjecutada,
  ContextoConversacion,
  EjecutorSql,
  EventoAuditoria,
  FrescuraDominio,
  MetricaAutorizada,
  OpcionAccion,
  ResultadoAgente,
  TarjetaDato,
  TurnoPrevio,
} from './tipos';

/** Tools que una acción puede ejecutar: las guardables más la ficha de una métrica. */
export const TOOLS_ACCION = ['consultar_metrica', 'consultar_aging', 'consultar_metrica_por_dimension', 'explicar_metrica'] as const;

/** Pregunta fija de desambiguación (la escribe el código, no el modelo). */
export const PREGUNTA_AMBIGUA = 'Tu pregunta admite varias lecturas. ¿Cuál necesitas?';

/** Valida forma y parámetros de una acción con el Zod estricto de la tool. */
export function validarAccion(
  tool: string,
  params: unknown,
): { ok: true; params: Record<string, unknown> } | { ok: false; motivo: string } {
  if (!(TOOLS_ACCION as readonly string[]).includes(tool)) return { ok: false, motivo: `Acción no permitida: ${tool}` };
  if (tool === 'explicar_metrica') {
    const r = esquemaExplicarMetrica.safeParse(params);
    return r.success ? { ok: true, params: r.data } : { ok: false, motivo: 'metrica_clave inválida' };
  }
  return validarEspecificacion(tool, params);
}

// ---------------------------------------------------------------- contexto de la conversación

const esquemaContexto = z.object({
  empresa_id: z.string().regex(/^[a-z0-9_]+$/).nullable().optional(),
  periodo: z
    .object({
      desde: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
      hasta: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const CONTEXTO_VACIO: ContextoConversacion = { empresa_id: null, periodo: null };

/** Lee el jsonb persistido; cualquier forma inesperada se descarta (contexto vacío). */
export function normalizarContexto(crudo: unknown): ContextoConversacion {
  const r = esquemaContexto.safeParse(crudo ?? {});
  if (!r.success) return { ...CONTEXTO_VACIO };
  const p = r.data.periodo;
  return {
    empresa_id: r.data.empresa_id ?? null,
    periodo: p && (p.desde || p.hasta) ? { desde: p.desde ?? null, hasta: p.hasta ?? null } : null,
  };
}

/**
 * Contexto tras el turno: manda la ÚLTIMA consulta ejecutada (sus params ya validados); si no
 * hubo, lo que detectó la compuerta; si nada, el previo.
 */
export function actualizarContexto(
  previo: ContextoConversacion | null | undefined,
  consultas: ConsultaEjecutada[],
  detectado?: { empresa: string | null; periodo: { desde: string | null; hasta: string | null } | null },
): ContextoConversacion {
  const base: ContextoConversacion = { ...(previo ?? CONTEXTO_VACIO) };
  if (detectado?.empresa) base.empresa_id = detectado.empresa;
  if (detectado?.periodo) base.periodo = detectado.periodo;
  const ultima = consultas[consultas.length - 1];
  if (ultima) {
    const p = ultima.params;
    if (typeof p['empresa_id'] === 'string') base.empresa_id = p['empresa_id'];
    const desde = typeof p['periodo_desde'] === 'string' ? p['periodo_desde'] : null;
    const hasta = typeof p['periodo_hasta'] === 'string' ? p['periodo_hasta'] : null;
    if (desde || hasta) base.periodo = { desde, hasta };
  }
  return base;
}

// ---------------------------------------------------------------- períodos por defecto

/** 'YYYY-MM' del mes en curso según la fecha de hoy. */
function mesActual(fechaActual: string): string {
  return fechaActual.slice(0, 7);
}

/** «Este año»: enero del año del último dato (o del año en curso) hasta el último dato. */
export function periodoEsteAnio(m: Pick<MetricaAutorizada, 'periodoHasta'>, fechaActual: string): { desde: string; hasta: string } {
  const actual = mesActual(fechaActual);
  const hasta = m.periodoHasta && m.periodoHasta < actual ? m.periodoHasta : actual;
  return { desde: `${hasta.slice(0, 4)}-01`, hasta };
}

// ---------------------------------------------------------------- construcción de acciones

/** La acción natural para una métrica: aging para las carteras, serie mensual para el resto. */
export function accionParaMetrica(
  m: MetricaAutorizada,
  periodo: { desde: string | null; hasta: string | null } | null,
  empresa: string | null,
): AccionTool {
  if (m.clave === 'saldo_cxc' || m.clave === 'saldo_cxp') {
    return {
      tool: 'consultar_aging',
      params: { tipo_cartera: m.clave === 'saldo_cxc' ? 'cobrar' : 'pagar', ...(empresa ? { empresa_id: empresa } : {}) },
    };
  }
  return {
    tool: 'consultar_metrica',
    params: {
      metrica_clave: m.clave,
      ...(periodo?.desde ? { periodo_desde: periodo.desde } : {}),
      ...(periodo?.hasta ? { periodo_hasta: periodo.hasta } : {}),
      ...(empresa ? { empresa_id: empresa } : {}),
    },
  };
}

function opcionValida(etiqueta: string, accion: AccionTool): OpcionAccion | null {
  const v = validarAccion(accion.tool, accion.params);
  return v.ok ? { etiqueta: etiqueta.slice(0, 120), accion: { tool: accion.tool, params: v.params } } : null;
}

/**
 * Botones de desambiguación desde lo que detectó la compuerta. Con 2+ candidatas: una opción por
 * métrica. Con una sola y sin período: opciones de período. Si no hay con qué armar 2 opciones
 * devuelve [] (el agente principal pregunta por su cuenta).
 */
export function opcionesDesambiguacion(
  entrada: {
    candidatas: string[];
    periodo: { desde: string | null; hasta: string | null } | null;
    empresa: string | null;
    contexto?: ContextoConversacion | null;
  },
  alcance: AlcanceEfectivo,
  fechaActual: string,
): OpcionAccion[] {
  const metricas = entrada.candidatas.map((c) => alcance.metricas.get(c)).filter((m): m is MetricaAutorizada => !!m);
  const empresa = entrada.empresa ?? entrada.contexto?.empresa_id ?? null;
  const periodoBase = entrada.periodo ?? entrada.contexto?.periodo ?? null;
  const opciones: OpcionAccion[] = [];

  if (metricas.length >= 2) {
    for (const m of metricas.slice(0, 4)) {
      const periodo = periodoBase ?? periodoEsteAnio(m, fechaActual);
      const esCartera = m.clave === 'saldo_cxc' || m.clave === 'saldo_cxp';
      const etiqueta = `${m.nombreOficial}${m.estado === 'exploratoria' ? ' (exploratoria)' : ''} · ${esCartera ? 'al último corte' : nombreRango(periodo.desde, periodo.hasta)}`;
      const o = opcionValida(etiqueta, accionParaMetrica(m, periodo, empresa));
      if (o) opciones.push(o);
    }
    return opciones.length >= 2 ? opciones : [];
  }

  const m = metricas[0];
  // Una sola cartera («¿cuánto me deben?»): total por antigüedad, mayores socios o evolución mensual.
  if (m && (m.clave === 'saldo_cxc' || m.clave === 'saldo_cxp')) {
    const tipo = m.clave === 'saldo_cxc' ? 'cobrar' : 'pagar';
    const emp = empresa ? { empresa_id: empresa } : {};
    const candidatos: [string, AccionTool][] = [
      [`${m.nombreOficial} total por antigüedad`, { tool: 'consultar_aging', params: { tipo_cartera: tipo, ...emp, detalle: 'por_rango' } }],
      [tipo === 'cobrar' ? 'Clientes con mayor saldo' : 'Proveedores con mayor saldo', { tool: 'consultar_aging', params: { tipo_cartera: tipo, ...emp, detalle: 'por_socio', limite_socios: 10 } }],
      [`${m.nombreOficial} por mes`, { tool: 'consultar_metrica', params: { metrica_clave: m.clave, ...emp } }],
    ];
    for (const [etiqueta, accion] of candidatos) {
      const o = opcionValida(etiqueta, accion);
      if (o) opciones.push(o);
    }
    return opciones;
  }
  if (m && !periodoBase) {
    const anio = periodoEsteAnio(m, fechaActual);
    const ultimo = anio.hasta;
    const [a, mes] = ultimo.split('-').map(Number) as [number, number];
    const total = a * 12 + (mes - 1) - 11;
    const doce = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    const candidatos: [string, { desde: string; hasta: string }][] = [
      [`${m.nombreOficial} · este año (${nombreRango(anio.desde, anio.hasta)})`, anio],
      [`${m.nombreOficial} · último mes con dato (${nombreRango(ultimo, ultimo)})`, { desde: ultimo, hasta: ultimo }],
      [`${m.nombreOficial} · últimos 12 meses`, { desde: m.periodoDesde && m.periodoDesde > doce ? m.periodoDesde : doce, hasta: ultimo }],
    ];
    for (const [etiqueta, periodo] of candidatos) {
      const o = opcionValida(etiqueta, accionParaMetrica(m, periodo, empresa));
      if (o) opciones.push(o);
    }
  }
  return opciones.length >= 2 ? opciones : [];
}

const NOMBRE_DIMENSION: Record<string, string> = {
  cliente: 'cliente', producto: 'producto', linea: 'línea', vendedor: 'vendedor',
  canal: 'canal', sector: 'sector', proveedor: 'proveedor',
};

/** Siguientes preguntas (2-3) a partir de la última consulta ejecutada, todas dentro del alcance. */
export function sugerenciasSiguientes(
  consulta: ConsultaEjecutada | undefined,
  alcance: AlcanceEfectivo,
  empresasVisibles: number,
): OpcionAccion[] {
  if (!consulta) return [];
  const p = consulta.params;
  const salida: OpcionAccion[] = [];
  const agregar = (etiqueta: string, accion: AccionTool) => {
    if (salida.length >= 3) return;
    const o = opcionValida(etiqueta, accion);
    if (o && !salida.some((x) => x.etiqueta === o.etiqueta)) salida.push(o);
  };
  const rango = { periodo_desde: p['periodo_desde'], periodo_hasta: p['periodo_hasta'] };
  const limpio = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
  const empresa = typeof p['empresa_id'] === 'string' ? { empresa_id: p['empresa_id'] } : {};

  if (consulta.tool === 'consultar_metrica') {
    const clave = String(p['metrica_clave']);
    const m = alcance.metricas.get(clave);
    if (!m) return [];
    for (const dim of (alcance.desglosables.get(clave) ?? []).filter((d) => d === 'cliente' || d === 'producto' || d === 'proveedor').slice(0, 2)) {
      agregar(`Los 10 mayores por ${NOMBRE_DIMENSION[dim] ?? dim} en ${m.nombreOficial}`, {
        tool: 'consultar_metrica_por_dimension',
        params: limpio({ metrica_clave: clave, dimension: dim, ...rango, ...empresa, limite: 10 }),
      });
    }
    if (empresasVisibles > 1 && p['agrupar_por_empresa'] !== true && !p['empresa_id']) {
      agregar(`${m.nombreOficial} por empresa`, { tool: 'consultar_metrica', params: limpio({ ...p, agrupar_por_empresa: true }) });
    }
    agregar(`¿Qué significa ${m.nombreOficial}?`, { tool: 'explicar_metrica', params: { metrica_clave: clave } });
  } else if (consulta.tool === 'consultar_metrica_por_dimension') {
    const clave = String(p['metrica_clave']);
    const m = alcance.metricas.get(clave);
    if (!m) return [];
    agregar(`${m.nombreOficial} por mes`, { tool: 'consultar_metrica', params: limpio({ metrica_clave: clave, ...rango, ...empresa }) });
    const otra = (alcance.desglosables.get(clave) ?? []).find((d) => d !== p['dimension']);
    if (otra) {
      agregar(`${m.nombreOficial} por ${NOMBRE_DIMENSION[otra] ?? otra}`, {
        tool: 'consultar_metrica_por_dimension',
        params: limpio({ metrica_clave: clave, dimension: otra, ...rango, ...empresa, limite: 10 }),
      });
    }
    if (p['orden'] !== 'menor') {
      agregar(`Los 10 menores por ${NOMBRE_DIMENSION[String(p['dimension'])] ?? String(p['dimension'])}`, {
        tool: 'consultar_metrica_por_dimension',
        params: limpio({ ...p, orden: 'menor', limite: 10 }),
      });
    }
  } else if (consulta.tool === 'consultar_aging') {
    const tipo = p['tipo_cartera'] === 'pagar' ? 'pagar' : 'cobrar';
    const clave = tipo === 'cobrar' ? 'saldo_cxc' : 'saldo_cxp';
    const m = alcance.metricas.get(clave);
    if (p['detalle'] === 'por_socio') {
      agregar('Cartera por rango de antigüedad', { tool: 'consultar_aging', params: limpio({ tipo_cartera: tipo, ...empresa, detalle: 'por_rango' }) });
    } else {
      agregar(tipo === 'cobrar' ? 'Clientes con mayor saldo' : 'Proveedores con mayor saldo', {
        tool: 'consultar_aging',
        params: limpio({ tipo_cartera: tipo, ...empresa, detalle: 'por_socio', limite_socios: 10 }),
      });
    }
    if (m) agregar(`${m.nombreOficial} por mes`, { tool: 'consultar_metrica', params: limpio({ metrica_clave: clave, ...empresa }) });
    const otra = alcance.metricas.get(tipo === 'cobrar' ? 'saldo_cxp' : 'saldo_cxc');
    if (otra) {
      agregar(`Antigüedad de la cartera por ${tipo === 'cobrar' ? 'pagar' : 'cobrar'}`, {
        tool: 'consultar_aging',
        params: limpio({ tipo_cartera: tipo === 'cobrar' ? 'pagar' : 'cobrar', ...empresa }),
      });
    }
  }
  return salida;
}

/** Sugerencias para el chat vacío, desde el alcance REAL (nunca nombra una métrica sin acceso). */
export function sugerenciasIniciales(alcance: AlcanceEfectivo, fechaActual: string): OpcionAccion[] {
  const conDatos = [...alcance.metricas.values()].filter((m) => m.periodoHasta);
  const orden = (m: MetricaAutorizada) =>
    (m.estado === 'certificada' ? 0 : 10) + (m.clave.startsWith('ventas_netas') ? 0 : m.dominio === 'ventas' ? 1 : 2);
  conDatos.sort((a, b) => orden(a) - orden(b) || a.clave.localeCompare(b.clave));
  const salida: OpcionAccion[] = [];
  const agregar = (etiqueta: string, accion: AccionTool) => {
    const o = opcionValida(etiqueta, accion);
    if (o && salida.length < 4 && !salida.some((x) => x.etiqueta === o.etiqueta)) salida.push(o);
  };

  const principal = conDatos.find((m) => m.clave !== 'saldo_cxc' && m.clave !== 'saldo_cxp');
  if (principal) {
    const anio = periodoEsteAnio(principal, fechaActual);
    agregar(`${principal.nombreOficial} por mes de este año`, accionParaMetrica(principal, anio, null));
    const desglosable = conDatos.find((m) => (alcance.desglosables.get(m.clave) ?? []).includes('cliente'));
    if (desglosable) {
      const p = periodoEsteAnio(desglosable, fechaActual);
      agregar(`Los 10 mayores clientes por ${desglosable.nombreOficial} este año`, {
        tool: 'consultar_metrica_por_dimension',
        params: { metrica_clave: desglosable.clave, dimension: 'cliente', periodo_desde: p.desde, periodo_hasta: p.hasta, limite: 10 },
      });
    }
  }
  if (alcance.metricas.has('saldo_cxc')) agregar('Cartera por cobrar por antigüedad', { tool: 'consultar_aging', params: { tipo_cartera: 'cobrar' } });
  else if (alcance.metricas.has('saldo_cxp')) agregar('Cartera por pagar por antigüedad', { tool: 'consultar_aging', params: { tipo_cartera: 'pagar' } });
  if (principal) agregar(`¿Qué significa ${principal.nombreOficial}?`, { tool: 'explicar_metrica', params: { metrica_clave: principal.clave } });
  return salida;
}

// ---------------------------------------------------------------- repetición

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RE_REPETIR = /^(repite(la|lo)?|repetir|otra vez|de nuevo|actualiza(la|lo|r)?( la consulta| eso)?|vuelve a consultar(la|lo)?)$/;

/**
 * Si el mensaje repite una pregunta ya respondida con datos (o pide «repite», «actualiza»), se
 * devuelven sus consultas para reejecutarlas SIN modelo, con datos frescos.
 */
export function buscarRepeticion(mensaje: string, turnos: TurnoPrevio[]): ConsultaEjecutada[] | null {
  const n = normalizar(mensaje);
  if (!n) return null;
  const conDatos = turnos.filter((t) => t.consultas.length > 0);
  if (RE_REPETIR.test(n)) return conDatos[conDatos.length - 1]?.consultas ?? null;
  const igual = [...conDatos].reverse().find((t) => normalizar(t.pregunta) === n);
  return igual ? igual.consultas : null;
}

// ---------------------------------------------------------------- ejecución

export interface ContextoAcciones {
  ejecutor: EjecutorSql;
  alcance: AlcanceEfectivo;
  empresas: Map<string, string>;
  frescura?: FrescuraDominio[];
  simboloMoneda?: string;
  auditar: (evento: EventoAuditoria) => Promise<void>;
  /** Marca en la auditoría de dónde vino la acción ('boton', 'sugerencia', 'repeticion'). */
  origen: string;
}

export interface ResultadoAcciones {
  ok: boolean;
  motivo?: string;
  texto: string;
  tarjetas: TarjetaDato[];
  conjuntos: ConjuntoDatos[];
  consultas: ConsultaEjecutada[];
}

/** Ejecuta acciones ya armadas (alcance resuelto) y redacta con la plantilla del código. */
export async function ejecutarAcciones(acciones: AccionTool[], ctx: ContextoAcciones): Promise<ResultadoAcciones> {
  const tarjetas: TarjetaDato[] = [];
  const conjuntos: ConjuntoDatos[] = [];
  const consultas: ConsultaEjecutada[] = [];
  const fichas: string[] = [];
  let motivo: string | undefined;
  for (const a of acciones.slice(0, 3)) {
    const v = validarAccion(a.tool, a.params);
    if (!v.ok) {
      motivo = v.motivo;
      continue;
    }
    const r = await ejecutarTool(a.tool, v.params, { ejecutor: ctx.ejecutor, alcance: ctx.alcance, empresas: ctx.empresas, frescura: ctx.frescura });
    await ctx.auditar({ ...r.auditoria, detalle: { ...r.auditoria.detalle, origen: ctx.origen } });
    if (r.esError) {
      try {
        motivo = (JSON.parse(r.contenido) as { error?: string }).error ?? 'La consulta no se pudo ejecutar.';
      } catch {
        motivo = 'La consulta no se pudo ejecutar.';
      }
      continue;
    }
    tarjetas.push(...r.tarjetas);
    if (a.tool === 'explicar_metrica') {
      fichas.push(textoFicha(r.contenido));
    } else if (r.conjunto && r.params) {
      conjuntos.push(r.conjunto);
      consultas.push({ tool: a.tool, params: r.params, conjunto: conjuntos.length - 1, tituloSugerido: r.conjunto.titulo });
    }
  }
  const partes = [...fichas];
  if (conjuntos.length || tarjetas.length) partes.push(plantillaRespuesta(tarjetas, conjuntos, ctx.simboloMoneda));
  const ok = partes.length > 0;
  return {
    ok,
    ...(ok ? {} : { motivo: motivo ?? 'La consulta no se pudo ejecutar.' }),
    texto: ok ? partes.join(' ') : `No pude ejecutar esa consulta: ${motivo ?? 'sin detalle'}`,
    tarjetas,
    conjuntos,
    consultas,
  };
}

/** Ficha de explicar_metrica → una frase (definición, fórmula si la hay, estado). */
function textoFicha(contenido: string): string {
  try {
    const f = JSON.parse(contenido) as Record<string, unknown>;
    const nombre = String(f['nombre_oficial'] ?? f['metrica'] ?? '');
    const definicion = String(f['definicion'] ?? '').replace(/\s+/g, ' ').trim();
    const calculo = f['se_calcula_como'] ? ` Se calcula como ${String(f['se_calcula_como'])}.` : f['formula'] ? ` Fórmula: ${String(f['formula'])}.` : '';
    const estado = f['estado'] === 'certificada' ? 'Certificada.' : 'Exploratoria: no certificada.';
    return `${nombre}: ${definicion}${definicion.endsWith('.') ? '' : '.'}${calculo} ${estado}`;
  } catch {
    return 'No pude leer la ficha de la métrica.';
  }
}

export interface EntradaAccion {
  ejecutor: EjecutorSql;
  usuarioId: number;
  empresas: Map<string, string>;
  frescura?: FrescuraDominio[];
  accion: AccionTool;
  auditar: (evento: EventoAuditoria) => Promise<void>;
  soloCertificadas?: boolean;
  simboloMoneda?: string;
  fechaActual: string;
  contexto?: ContextoConversacion | null;
}

/**
 * Punto de entrada del host para un clic (botón u opción sugerida): resuelve el alcance de QUIEN
 * hace clic, ejecuta y devuelve un turno completo con la misma forma que `responder`.
 */
export async function ejecutarAccion(entrada: EntradaAccion): Promise<ResultadoAgente & { ok: boolean; motivo?: string }> {
  const alcance = await resolverAlcance(entrada.ejecutor, entrada.usuarioId, { soloCertificadas: entrada.soloCertificadas });
  const r = await ejecutarAcciones([entrada.accion], {
    ejecutor: entrada.ejecutor,
    alcance,
    empresas: entrada.empresas,
    frescura: entrada.frescura,
    simboloMoneda: entrada.simboloMoneda,
    auditar: entrada.auditar,
    origen: 'boton',
  });
  const visibles = alcance.empresas === '*' ? entrada.empresas.size : alcance.empresas.length;
  return {
    ok: r.ok,
    ...(r.motivo ? { motivo: r.motivo } : {}),
    texto: r.texto,
    uso: [],
    tarjetas: r.tarjetas,
    conjuntos: r.conjuntos,
    consultas: r.consultas,
    solicitudes: [],
    textoRegenerado: false,
    opciones: [],
    sugerencias: sugerenciasSiguientes(r.consultas[r.consultas.length - 1], alcance, visibles),
    contexto: actualizarContexto(entrada.contexto, r.consultas),
  };
}

/**
 * Filas de `SQL_TURNOS_CON_CONSULTAS` → turnos previos (en orden cronológico). Las consultas que
 * no tengan forma de (tool, params) se descartan; igual se revalidan al reejecutarse.
 */
export function turnosDesdeFilas(filas: Record<string, unknown>[]): TurnoPrevio[] {
  return filas
    .map((f) => {
      const crudas = Array.isArray(f['consultas']) ? (f['consultas'] as unknown[]) : [];
      const consultas: ConsultaEjecutada[] = crudas
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .filter((c) => typeof c['tool'] === 'string' && typeof c['params'] === 'object' && c['params'] !== null)
        .map((c, i) => ({
          tool: String(c['tool']),
          params: c['params'] as Record<string, unknown>,
          conjunto: typeof c['conjunto'] === 'number' ? c['conjunto'] : i,
          tituloSugerido: String(c['tituloSugerido'] ?? ''),
        }));
      return { pregunta: String(f['pregunta'] ?? ''), consultas };
    })
    .reverse();
}
