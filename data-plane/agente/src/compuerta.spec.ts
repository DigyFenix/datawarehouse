/**
 * Compuerta de intención: las respuestas bloqueadas las escribe el código y el clasificador
 * nunca puede devolver algo fuera del enum (salida estructurada). Sin red: cliente falso.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { clasificarIntencion, esIntencionBloqueada, INTENCIONES, RESPUESTAS_FIJAS } from './compuerta';

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
});
