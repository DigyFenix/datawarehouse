/**
 * Loop del agente: NL → (clarificar) → tool tipada → dato gobernado → respuesta.
 *
 * El LLM elige QUÉ tool usar y con qué parámetros; este código VALIDA y EJECUTA
 * (CLAUDE.md §11). Loop manual y no el tool-runner del SDK porque cada paso
 * necesita interponer las guardas, auditar y construir las tarjetas de dato.
 */
import Anthropic from '@anthropic-ai/sdk';

import { resolverAlcance } from './alcances';
import { construirSystemPrompt } from './prompt';
import { ejecutarTool } from './tools/ejecutar';
import { TOOLS_ANTHROPIC } from './tools/esquemas';
import type {
  ConfigAgente,
  EjecutorSql,
  EventoAuditoria,
  MensajeHistorial,
  ResultadoAgente,
  TarjetaDato,
} from './tipos';

/** Modelos donde el fallback por rechazo de clasificador está disponible (Claude API). */
const MODELOS_CON_FALLBACK = new Set(['claude-opus-5', 'claude-fable-5']);

export interface EntradaAgente {
  ejecutor: EjecutorSql;
  config: ConfigAgente;
  /** Id del usuario del portal (resuelve sus alcances). */
  usuarioId: number;
  /** Turnos previos de la conversación (solo texto). */
  historial: MensajeHistorial[];
  mensaje: string;
  /** El host persiste estos eventos en portal.auditoria. */
  auditar: (evento: EventoAuditoria) => Promise<void>;
}

export async function responder(entrada: EntradaAgente): Promise<ResultadoAgente> {
  const { ejecutor, config, usuarioId, historial, mensaje, auditar } = entrada;

  const alcance = await resolverAlcance(ejecutor, usuarioId);
  const system = construirSystemPrompt(config, alcance);

  const cliente = new Anthropic({ apiKey: config.apiKey });
  const usaFallback = MODELOS_CON_FALLBACK.has(config.modelo);

  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    ...historial.map((m) => ({
      role: (m.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.contenido,
    })),
    { role: 'user', content: mensaje },
  ];

  const tarjetas: TarjetaDato[] = [];
  let texto = '';

  for (let iteracion = 0; iteracion < config.maxIteraciones; iteracion += 1) {
    const respuesta = await cliente.beta.messages.create({
      model: config.modelo,
      max_tokens: config.maxTokens,
      system,
      messages: mensajes,
      tools: TOOLS_ANTHROPIC,
      // Chat interactivo: el esfuerzo bajo responde rápido y sobra para elegir
      // una tool y redactar. La inteligencia dura ya vive en el warehouse.
      output_config: { effort: 'low' },
      // Rescate del proveedor si un clasificador de seguridad declina la petición.
      ...(usaFallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    });

    // Un rechazo se comunica, no se disfraza de respuesta vacía.
    if (respuesta.stop_reason === 'refusal') {
      return {
        texto:
          'No puedo procesar esa solicitud. Reformúlala en términos de las métricas ' +
          'de negocio disponibles y con gusto la consulto.',
        tarjetas: [],
      };
    }

    const textoTurno = respuesta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (textoTurno) texto = textoTurno;

    const llamadas = respuesta.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );
    if (llamadas.length === 0) break;

    mensajes.push({ role: 'assistant', content: respuesta.content });

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const llamada of llamadas) {
      const resultado = await ejecutarTool(llamada.name, llamada.input, {
        ejecutor,
        alcance,
        empresas: config.empresas,
      });
      await auditar(resultado.auditoria);
      tarjetas.push(...resultado.tarjetas);
      resultados.push({
        type: 'tool_result',
        tool_use_id: llamada.id,
        content: resultado.contenido,
        ...(resultado.esError ? { is_error: true } : {}),
      });
    }
    mensajes.push({ role: 'user', content: resultados });
  }

  if (!texto) {
    texto =
      'No pude completar la consulta en los pasos disponibles. Intenta acotar la ' +
      'pregunta a una métrica y un período concretos.';
  }

  // Las tarjetas se deduplican por (métrica, período, empresa): una misma consulta
  // repetida en dos iteraciones no debe mostrar el dato dos veces.
  const vistas = new Set<string>();
  const unicas = tarjetas.filter((t) => {
    const clave = `${t.metricaClave}|${t.periodo}|${t.empresa ?? ''}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });

  return { texto, tarjetas: unicas };
}
