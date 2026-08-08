/**
 * GUARDA 3 (RLS/alcances): resuelve el alcance EFECTIVO del usuario por request.
 *
 *   metricasPermitidas = (alcances de tipo metrica ∪ métricas de los dominios con
 *                         alcance ∪ todo si '*') ∩ (certificada ∪ exploratoria)
 *   empresasPermitidas = alcances de tipo empresa ('*' o lista). FAIL-CLOSED:
 *                        sin filas de tipo empresa ⇒ lista vacía ⇒ el agente no
 *                        devuelve ni una fila (igual que el RLS de Postgres).
 *
 * El alcance se usa DOS veces (defensa en profundidad): al construir el system
 * prompt (el LLM ni ve lo no autorizado) y al re-validar cada tool ejecutada.
 */
import {
  SQL_ALCANCES_USUARIO,
  SQL_DOMINIOS_METRICA,
  SQL_METRICAS_CONSUMIBLES,
  SQL_PERIODOS_METRICA,
} from './tools/consultas';
import type { AlcanceEfectivo, EjecutorSql, MetricaAutorizada } from './tipos';

export async function resolverAlcance(
  ejecutor: EjecutorSql,
  usuarioId: number,
): Promise<AlcanceEfectivo> {
  const alcances = await ejecutor.consultarTenant(SQL_ALCANCES_USUARIO, [usuarioId]);

  // Eje empresa — fail-closed: sin alcance explícito no hay filas.
  // `empresa_id` es texto (clave de sociedad del ERP), así que la clave del alcance
  // se conserva tal cual: convertirla a número la volvía NaN y dejaba al agente sin
  // una sola fila en cualquier tenant.
  const filasEmpresa = alcances.filter((a) => a['recurso_tipo'] === 'empresa');
  const empresas: '*' | string[] = filasEmpresa.some((a) => a['recurso_clave'] === '*')
    ? '*'
    : filasEmpresa.map((a) => String(a['recurso_clave'] ?? '')).filter((c) => c !== '');

  // Qué puede consultar: claves directas y dominios (con '*' en cualquiera de los dos).
  const clavesDirectas = new Set<string>();
  const dominiosPermitidos = new Set<string>();
  let todoElCatalogo = false;
  for (const a of alcances) {
    const tipo = a['recurso_tipo'];
    const clave = String(a['recurso_clave'] ?? '');
    if (clave === '') continue;
    if (clave === '*' && (tipo === 'metrica' || tipo === 'dominio')) {
      todoElCatalogo = true;
    } else if (tipo === 'metrica') {
      clavesDirectas.add(clave);
    } else if (tipo === 'dominio') {
      dominiosPermitidos.add(clave);
    }
  }

  // GUARDA 2: solo métricas en estado consumible (certificada / exploratoria).
  const consumibles = await ejecutor.consultarControl(SQL_METRICAS_CONSUMIBLES, []);
  const dominios = await ejecutor.consultarTenant(SQL_DOMINIOS_METRICA, []);
  const dominioPorClave = new Map(
    dominios.map((d) => [String(d['metrica_clave']), String(d['dominio'])]),
  );

  // Períodos disponibles bajo el alcance de empresas del usuario (RLS ya aplicado
  // por el ejecutor, y el parámetro refuerza).
  const arregloEmpresas = empresas === '*' ? null : empresas;
  const periodos =
    empresas === '*' || empresas.length > 0
      ? await ejecutor.consultarTenant(SQL_PERIODOS_METRICA, [
          arregloEmpresas ?? (await todasLasEmpresas(ejecutor)),
        ])
      : [];
  const periodoPorClave = new Map(
    periodos.map((p) => [
      String(p['metrica_clave']),
      { desde: String(p['periodo_desde'] ?? ''), hasta: String(p['periodo_hasta'] ?? '') },
    ]),
  );

  const metricas = new Map<string, MetricaAutorizada>();
  for (const m of consumibles) {
    const clave = String(m['clave']);
    const dominio = dominioPorClave.get(clave) ?? '';
    const autorizada =
      todoElCatalogo || clavesDirectas.has(clave) || (dominio !== '' && dominiosPermitidos.has(dominio));
    if (!autorizada) continue;
    const rango = periodoPorClave.get(clave);
    metricas.set(clave, {
      clave,
      nombreOficial: String(m['nombre_oficial']),
      definicionNegocio: String(m['definicion_negocio'] ?? ''),
      dominio,
      estado: m['estado'] === 'exploratoria' ? 'exploratoria' : 'certificada',
      periodoDesde: rango?.desde || null,
      periodoHasta: rango?.hasta || null,
    });
  }

  return { metricas, empresas };
}

/** empresa_id existentes en el warehouse (solo para el rango de períodos con alcance '*'). */
async function todasLasEmpresas(ejecutor: EjecutorSql): Promise<string[]> {
  const filas = await ejecutor.consultarTenant(
    'select distinct empresa_id from oro.metrica_valor',
    [],
  );
  return filas.map((f) => String(f['empresa_id'] ?? '')).filter((c) => c !== '');
}

/** Intersección {empresa solicitada} ∩ {empresas autorizadas} → arreglo para `= any($n)`.
 *  null = denegado (solicitó una empresa fuera de su alcance). */
export function empresasParaConsulta(
  alcance: AlcanceEfectivo,
  empresaSolicitada: string | undefined,
  todas: string[],
): string[] | null {
  const autorizadas = alcance.empresas === '*' ? todas : alcance.empresas;
  if (autorizadas.length === 0) return null; // fail-closed
  if (empresaSolicitada === undefined) return autorizadas;
  return autorizadas.includes(empresaSolicitada) ? [empresaSolicitada] : null;
}
