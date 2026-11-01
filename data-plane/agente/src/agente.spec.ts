/**
 * Integración del loop con cliente guionado y warehouse falso (sin red ni base):
 * anclaje de cifras, botones de desambiguación, repetición sin modelo, caché y prompt.
 */
import { clienteGuionado, configLab, ejecutorLab, type RegistroLlamada } from '../eval/laboratorio';
import { ejecutarAccion, sugerenciasIniciales } from './acciones';
import { resolverAlcance } from './alcances';
import { completarParametros, responder } from './agente';
import { construirBloquesSystem } from './prompt';
import { prepararDescarga } from './descargas';
import type { EventoAuditoria } from './tipos';

function entrada(guion: Parameters<typeof clienteGuionado>[0], extra: Record<string, unknown> = {}) {
  const auditoria: EventoAuditoria[] = [];
  const registro: RegistroLlamada[] = [];
  return {
    auditoria,
    registro,
    params: {
      ejecutor: ejecutorLab(),
      config: configLab(),
      usuarioId: 1,
      historial: [],
      mensaje: '¿Cuánto vendí en septiembre 2026, netas sin IVA?',
      auditar: async (e: EventoAuditoria) => {
        auditoria.push(e);
      },
      cliente: clienteGuionado(guion, registro),
      ...extra,
    },
  };
}

const consultaSeptiembre = { name: 'consultar_metrica', input: { metrica_clave: 'ventas_netas_sin_iva', periodo_desde: '2026-09', periodo_hasta: '2026-09' } };

describe('Loop del agente', () => {
  it('texto con cifras respaldadas: se conserva, con tarjetas que traen empresas, unidad y corte', async () => {
    // 2026-09: 1,000,000×1.27 = 1,270,000 (proavisa) + 508,000 (loreto) = 1,778,000
    const e = entrada({ pasos: [{ tools: [consultaSeptiembre] }, { texto: 'Ventas netas sin IVA de septiembre 2026: Q 1,778,000 (certificada).' }] });
    const r = await responder(e.params);
    expect(r.textoRegenerado).toBe(false);
    expect(r.texto).toContain('Q 1,778,000');
    expect(r.tarjetas[0]).toMatchObject({ unidad: 'moneda', corte: '2026-10-30', empresas: ['Empresa Uno', 'Empresa Dos'] });
    expect(r.conjuntos[0]).toMatchObject({ unidad: 'moneda', corte: '2026-10-30' });
    expect(r.sugerencias.length).toBeGreaterThanOrEqual(2);
    expect(r.contexto.periodo).toEqual({ desde: '2026-09', hasta: '2026-09' });
  });

  it('cifra inventada: se reemplaza por la plantilla y se audita respuesta_regenerada con el original', async () => {
    const e = entrada({ pasos: [{ tools: [consultaSeptiembre] }, { texto: 'Vendiste Q 9,999,999 en septiembre.' }] });
    const r = await responder(e.params);
    expect(r.textoRegenerado).toBe(true);
    expect(r.texto).not.toContain('9,999,999');
    expect(r.texto).toContain('Q 1,778,000');
    const ev = e.auditoria.find((a) => a.accion === 'respuesta_regenerada');
    expect(ev?.detalle['original']).toBe('Vendiste Q 9,999,999 en septiembre.');
  });

  it('claves técnicas en el texto se cambian por el nombre oficial', async () => {
    const e = entrada({ pasos: [{ tools: [consultaSeptiembre] }, { texto: 'El dato de ventas_netas_sin_iva es Q 1,778,000.' }] });
    const r = await responder(e.params);
    expect(r.texto).toBe('El dato de Ventas netas sin IVA es Q 1,778,000.');
  });

  it('pregunta ambigua: el código responde con botones y el modelo principal no corre', async () => {
    const e = entrada(
      {
        compuerta: { intencion: 'consulta', metricas_candidatas: ['ventas_netas_sin_iva', 'ventas_brutas_sin_iva', 'inventada'], periodo_detectado: { desde: '', hasta: '' }, empresa_detectada: '', es_ambigua: true },
        pasos: [],
      },
      { mensaje: '¿Cómo van las ventas?' },
    );
    const r = await responder(e.params);
    expect(e.registro.filter((x) => x.tipo === 'principal')).toHaveLength(0);
    expect(r.opciones).toHaveLength(2);
    expect(r.opciones[0]?.accion).toEqual({ tool: 'consultar_metrica', params: { metrica_clave: 'ventas_netas_sin_iva', periodo_desde: '2026-01', periodo_hasta: '2026-10' } });
    expect(r.opciones[0]?.etiqueta).toContain('enero a octubre 2026');
  });

  it('la compuerta bloquea un tema ajeno con texto fijo', async () => {
    const e = entrada({ compuerta: { intencion: 'fuera_alcance', metricas_candidatas: [], periodo_detectado: { desde: '', hasta: '' }, empresa_detectada: '', es_ambigua: false }, pasos: [] }, { mensaje: 'Cuéntame un chiste' });
    const r = await responder(e.params);
    expect(r.consultas).toHaveLength(0);
    expect(e.registro.filter((x) => x.tipo === 'principal')).toHaveLength(0);
  });

  it('repetición: la misma pregunta se reejecuta sin llamar a ningún modelo', async () => {
    const e = entrada(
      { pasos: [] },
      {
        mensaje: '¿Cuánto vendí en septiembre 2026, netas sin IVA?',
        turnosPrevios: [{ pregunta: '¿Cuánto vendí en Septiembre 2026, netas sin IVA', consultas: [{ tool: 'consultar_metrica', params: consultaSeptiembre.input, conjunto: 0, tituloSugerido: 'x' }] }],
      },
    );
    const r = await responder(e.params);
    expect(e.registro).toHaveLength(0);
    expect(r.uso).toHaveLength(0);
    expect(r.conjuntos).toHaveLength(1);
    expect(r.texto).toContain('Q 1,778,000');
  });

  it('dos bloques de system con cache_control, fecha en el mensaje y sin temperature', async () => {
    const e = entrada({ pasos: [{ texto: '¿Netas o brutas?' }] });
    await responder(e.params);
    const p = e.registro.find((x) => x.tipo === 'principal')?.params as Record<string, unknown>;
    const system = p['system'] as { text: string; cache_control?: unknown }[];
    expect(system.map((b) => b.cache_control)).toEqual([{ type: 'ephemeral' }, { type: 'ephemeral' }]);
    expect(system.map((b) => b.text).join('')).not.toContain('2026-10-31');
    const mensajes = p['messages'] as { role: string; content: string }[];
    expect(mensajes[mensajes.length - 1]?.content).toContain('2026-10-31');
    expect(p).not.toHaveProperty('temperature');
  });

  it('el enum de dominios de listar_metricas es el del alcance', async () => {
    const e = entrada({ pasos: [{ texto: 'Listo.' }] });
    await responder(e.params);
    const tools = (e.registro.find((x) => x.tipo === 'principal')?.params['tools'] ?? []) as { name: string; input_schema: { properties: Record<string, { enum?: string[] }> } }[];
    const listar = tools.find((t) => t.name === 'listar_metricas_disponibles');
    expect(listar?.input_schema.properties['dominio']?.enum).toEqual(['rentabilidad', 'tesoreria', 'ventas']);
  });

  it('ranking: el modelo recibe solo 5 miembros y el total; la UI el conjunto completo', async () => {
    const e = entrada({ pasos: [{ tools: [{ name: 'consultar_metrica_por_dimension', input: { metrica_clave: 'ventas_netas_sin_iva', dimension: 'cliente', limite: 7 } }] }, { texto: 'Listo.' }] });
    const r = await responder(e.params);
    const segunda = e.registro.filter((x) => x.tipo === 'principal')[1]?.params['messages'] as { content: unknown }[];
    const resultado = (segunda[segunda.length - 1]?.content as { content: string }[])[0]?.content ?? '';
    const cuerpo = JSON.parse(resultado) as { detalle: unknown[]; miembros_listados: number };
    expect(cuerpo.detalle).toHaveLength(5);
    expect(cuerpo.miembros_listados).toBe(7);
    expect(r.conjuntos[0]?.filas).toHaveLength(7);
    expect(resultado).toContain('<dato>');
  });
});

describe('Prompt', () => {
  it('omite equivaleA de métricas fuera del alcance, delimita datos externos e inyecta contexto', async () => {
    const ejecutor = ejecutorLab();
    const alcance = await resolverAlcance(ejecutor, 1);
    const cfg = configLab({ contexto: { empresa_id: 'loreto', periodo: { desde: '2026-03', hasta: '2026-03' } } });
    const { estatico, dinamico } = construirBloquesSystem(cfg, alcance);
    expect(dinamico).toContain('→ ventas_netas_sin_iva');
    expect(dinamico).not.toContain('→ valor_inventario');
    expect(dinamico).toContain('<dato>Empresa Dos</dato>');
    expect(dinamico).toContain('CONTEXTO DE ESTA CONVERSACIÓN: empresa loreto');
    expect(estatico).toContain('«Q»');
    expect(estatico).toContain('Eso no está en el catálogo.');
  });
});

describe('Acciones sin modelo', () => {
  it('un clic ejecuta la tool validada y devuelve texto de plantilla y sugerencias', async () => {
    const r = await ejecutarAccion({
      ejecutor: ejecutorLab(),
      usuarioId: 1,
      empresas: configLab().empresas,
      accion: { tool: 'consultar_aging', params: { tipo_cartera: 'cobrar' } },
      auditar: async () => undefined,
      fechaActual: '2026-10-31',
    });
    expect(r.ok).toBe(true);
    expect(r.texto).toContain('Q 2,000,000');
    expect(r.sugerencias.length).toBeGreaterThan(0);
    expect(r.uso).toHaveLength(0);
  });

  it('una acción con parámetros fuera de contrato o empresa ajena se rechaza', async () => {
    const base = { usuarioId: 1, empresas: configLab().empresas, auditar: async () => undefined, fechaActual: '2026-10-31' };
    const r1 = await ejecutarAccion({ ...base, ejecutor: ejecutorLab(), accion: { tool: 'consultar_metrica', params: { metrica_clave: 'x', tabla: 'bronce' } } });
    expect(r1.ok).toBe(false);
    const r2 = await ejecutarAccion({ ...base, ejecutor: ejecutorLab({ empresas: ['proavisa'] }), accion: { tool: 'consultar_metrica', params: { metrica_clave: 'ventas_netas_sin_iva', empresa_id: 'loreto' } } });
    expect(r2.ok).toBe(false);
    expect(r2.conjuntos).toHaveLength(0);
  });

  it('sugerencias iniciales solo nombran métricas del alcance', async () => {
    const alcance = await resolverAlcance(ejecutorLab(), 1, { soloCertificadas: true });
    const s = sugerenciasIniciales(alcance, '2026-10-31');
    expect(s.length).toBeGreaterThanOrEqual(3);
    for (const o of s) {
      const clave = o.accion.params['metrica_clave'];
      if (typeof clave === 'string') expect(alcance.metricas.has(clave)).toBe(true);
    }
  });
});

describe('Descargas de derivadas', () => {
  it('una derivada por mes se calcula con sus operandos (no hoja vacía); por dimensión, rechazo claro', async () => {
    const ejecutor = ejecutorLab();
    const original = ejecutor.consultarTenant;
    ejecutor.consultarTenant = async (sql, params) => {
      if (sql.includes('portal.metricas_derivadas')) {
        return [{ clave: 'margen_pct', nombre: 'Margen %', definicion: 'Margen sobre ventas', operacion: 'porcentaje', operando_a: 'margen_bruto', operando_b: 'ventas_netas_sin_iva', unidad: 'porcentaje' }];
      }
      return original(sql, params);
    };
    const ok = await prepararDescarga({ ejecutor, usuarioId: 1, empresas: configLab().empresas, params: { metricas: ['margen_pct'], nivel: 'mensual', periodo_desde: '2026-09', periodo_hasta: '2026-10' } });
    expect(ok.ok).toBe(true);
    expect(ok.hojas[0]?.filas).toHaveLength(2);
    expect(Number(ok.hojas[0]?.filas[0]?.['valor'])).toBeCloseTo(30, 5);
    const no = await prepararDescarga({ ejecutor, usuarioId: 1, empresas: configLab().empresas, params: { metricas: ['margen_pct'], nivel: 'dimension_total', dimension: 'cliente' } });
    expect(no.ok).toBe(false);
    expect(no.motivo).toContain('solo se descarga por mes');
  });
});

describe('completarParametros', () => {
  it('repone el «los N» explícito y el período detectado', () => {
    const p = completarParametros(
      'consultar_metrica_por_dimension',
      { metrica_clave: 'ventas_netas_sin_iva', dimension: 'vendedor', limite: 10, orden: 'menor' },
      'Los 5 vendedores con menos ventas netas sin IVA en septiembre 2026',
      { intencion: 'consulta', metricas_candidatas: [], periodo_detectado: { desde: '2026-09', hasta: '2026-09' }, empresa_detectada: null, es_ambigua: false },
    ) as Record<string, unknown>;
    expect(p['limite']).toBe(5);
    expect(p['periodo_desde']).toBe('2026-09');
  });
});
