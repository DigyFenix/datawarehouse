/**
 * Compuerta de intención: las respuestas bloqueadas las escribe el código y el clasificador
 * nunca puede devolver algo fuera del enum (salida estructurada). Sin red: cliente falso.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { clasificarIntencion, esIntencionBloqueada, INTENCIONES, normalizarClasificacion, RESPUESTAS_FIJAS } from './compuerta';

function clienteFalso(texto: string | Error): Anthropic {
  return {
    beta: {
      messages: {
        async create(params: Record<string, unknown>) {
          if (texto instanceof Error) throw texto;
          // El clasificador debe pedir salida estructurada con el enum cerrado.
          const cfg = params['output_config'] as { format: { type: string; schema: { properties: { intencion: { enum: string[] } } } } };
          expect(cfg.format.type).toBe('json_schema');
          expect(cfg.format.schema.properties.intencion.enum).toEqual([...INTENCIONES]);
          return { content: [{ type: 'text', text: texto }] };
        },
      },
    },
  } as unknown as Anthropic;
}

describe('Compuerta de intención', () => {
  const base = { modelo: 'clasificador', mensaje: 'hola', ultimaRespuesta: null, dominios: ['ventas'] };

  it('devuelve la intención del clasificador cuando está en el enum', async () => {
    expect(await clasificarIntencion({ ...base, cliente: clienteFalso('{"intencion":"fuera_alcance"}') })).toBe('fuera_alcance');
  });

  it('ante fallo o salida inesperada deja pasar (consulta): la guarda dura sigue en el agente', async () => {
    expect(await clasificarIntencion({ ...base, cliente: clienteFalso(new Error('timeout')) })).toBe('consulta');
    expect(await clasificarIntencion({ ...base, cliente: clienteFalso('{"intencion":"sql_libre"}') })).toBe('consulta');
    expect(await clasificarIntencion({ ...base, cliente: clienteFalso('no es json') })).toBe('consulta');
  });

  it('solo saludo, fuera de alcance y manipulación se bloquean, y tienen texto fijo', () => {
    expect(esIntencionBloqueada('consulta')).toBe(false);
    expect(esIntencionBloqueada('aclaracion')).toBe(false);
    for (const i of ['saludo', 'fuera_alcance', 'manipulacion'] as const) {
      expect(esIntencionBloqueada(i)).toBe(true);
      expect(RESPUESTAS_FIJAS[i].length).toBeGreaterThan(20);
      expect(RESPUESTAS_FIJAS[i].length).toBeLessThan(260);
    }
  });

  it('la salida ampliada se intersecta con el alcance: nada fuera del catálogo o de las empresas visibles sobrevive', () => {
    const metricas = new Map([['ventas_netas_sin_iva', 'Ventas netas'], ['ventas_brutas_sin_iva', 'Ventas brutas']]);
    const empresas = new Map([['proavisa', 'Empresa Uno']]);
    const c = normalizarClasificacion(
      { intencion: 'consulta', metricas_candidatas: ['ventas_netas_sin_iva', 'saldo_secreto', 'ventas_brutas_sin_iva'], periodo_detectado: { desde: '2026-10', hasta: '2026-01' }, empresa_detectada: 'loreto', es_ambigua: true },
      metricas,
      empresas,
    );
    expect(c.metricas_candidatas).toEqual(['ventas_netas_sin_iva', 'ventas_brutas_sin_iva']);
    expect(c.periodo_detectado).toEqual({ desde: '2026-01', hasta: '2026-10' });
    expect(c.empresa_detectada).toBeNull();
    expect(c.es_ambigua).toBe(true);
    // Una intención no-consulta nunca es ambigua; un período mal formado se descarta.
    expect(normalizarClasificacion({ intencion: 'saludo', es_ambigua: true, periodo_detectado: { desde: '2026-13', hasta: '' } }, metricas, empresas)).toMatchObject({ es_ambigua: false, periodo_detectado: null });
  });
});
