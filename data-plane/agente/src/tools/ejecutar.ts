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
import { fichaDeMetrica } from '../catalogo';
import {
  SQL_AGING_CORTE,
  SQL_AGING_POR_RANGO,
  SQL_AGING_POR_SOCIO,
  SQL_METRICA_VALOR,
} from './consultas';
import {
  esquemaConsultarAging,
  esquemaConsultarMetrica,
  esquemaExplicarMetrica,
  esquemaListarMetricas,
} from './esquemas';
import type {
  AlcanceEfectivo,
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

  const filas = await ctx.ejecutor.consultarTenant(SQL_METRICA_VALOR, [
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

  return {
    contenido,
    esError: false,
    tarjetas,
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
  const fechaCorte = corte == null ? null : String(corte).slice(0, 10);

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
          rango: String(f['rango_aging']),
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
