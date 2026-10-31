/**
 * Loop del agente: NL → (clarificar) → tool tipada → dato gobernado → respuesta.
 *
 * El LLM elige QUÉ tool usar y con qué parámetros; este código VALIDA y EJECUTA
 * (CLAUDE.md §11). Loop manual y no el tool-runner del SDK porque cada paso
 * necesita interponer las guardas, auditar y construir las tarjetas de dato.
 */
import Anthropic from '@anthropic-ai/sdk';

import { resolverAlcance } from './alcances';
import { clasificarIntencion, esIntencionBloqueada, RESPUESTAS_FIJAS, usoDeRespuesta } from './compuerta';
import { construirBloquesSystem } from './prompt';
import { ejecutarTool } from './tools/ejecutar';
import { TOOLS_ANTHROPIC } from './tools/esquemas';
import type {
  ConfigAgente,
  ConjuntoDatos,
  ConsultaEjecutada,
  EjecutorSql,
  EventoAuditoria,
  MensajeHistorial,
  ResultadoAgente,
  SolicitudNoAtendida,
  TarjetaDato,
  UsoModelo,
} from './tipos';

/** Tope de caracteres de la respuesta en texto (la UI ya muestra tablas y tarjetas aparte). */
export const LARGO_MAXIMO_RESPUESTA = 1200;

/** Recorta en el último fin de frase que cabe en `maximo`; si no hay ninguno, corta en seco con «…». */
export function acotarTexto(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo);
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('.' + String.fromCharCode(10)), corte.lastIndexOf('?'), corte.lastIndexOf('!'));
  return fin > maximo * 0.4 ? corte.slice(0, fin + 1).trim() : `${corte.trim()}…`;
}

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

  const alcance = await resolverAlcance(ejecutor, usuarioId, { soloCertificadas: config.soloCertificadas });
  const { estatico, dinamico } = construirBloquesSystem(config, alcance);

  const cliente = new Anthropic({ apiKey: config.apiKey });
  // Tokens de cada llamada al modelo en este turno: el host los costea por usuario.
  const uso: UsoModelo[] = [];
  const usaFallback = MODELOS_CON_FALLBACK.has(config.modelo);

  // RESTRICCIÓN REAL 1 — compuerta de intención: un clasificador con salida estructurada decide si
  // el mensaje es una consulta de métricas. Lo que no lo es se contesta con texto fijo del código
  // y el agente principal no corre (cero tokens del modelo grande, cero margen de convencimiento).
  if (config.modeloCompuerta) {
    const ultimaRespuesta = [...historial].reverse().find((m) => m.rol === 'asistente')?.contenido ?? null;
    const dominios = [...new Set([...alcance.metricas.values()].map((m) => m.dominio).filter(Boolean))];
    const intencion = await clasificarIntencion({ cliente, modelo: config.modeloCompuerta, mensaje, ultimaRespuesta, dominios, registrarUso: (u) => uso.push(u) });
    if (esIntencionBloqueada(intencion)) {
      await auditar({ accion: 'consulta_agente_denegada', detalle: { motivo: 'compuerta', intencion } });
      return { texto: RESPUESTAS_FIJAS[intencion], uso, tarjetas: [], conjuntos: [], consultas: [], solicitudes: [] };
    }
  }

  // RESTRICCIÓN REAL 2 — caché del bloque estable del system prompt (reglas por organización): el
  // API cobra ~10 % por esos tokens en cada turno y el catálogo del usuario va aparte, sin cachear.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: estatico, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dinamico },
  ];

  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    // Al asistente se le recuerda qué herramientas sustentaron cada respuesta previa: el historial
    // guarda solo texto, y sin esa marca el modelo tomaba sus cifras anteriores por inventadas.
    ...historial.map((m) => ({
      role: (m.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
      content:
        m.rol === 'asistente' && m.herramientas
          ? `${m.contenido}

[Sustento: herramientas ejecutadas en este turno → ${m.herramientas}]`
          : m.contenido,
    })),
    { role: 'user', content: mensaje },
  ];

  const tarjetas: TarjetaDato[] = [];
  const conjuntos: ConjuntoDatos[] = [];
  const consultas: ConsultaEjecutada[] = [];
  const solicitudes: SolicitudNoAtendida[] = [];
  let texto = '';

  for (let iteracion = 0; iteracion < config.maxIteraciones; iteracion += 1) {
    const respuesta = await cliente.beta.messages.create({
      model: config.modelo,
      max_tokens: config.maxTokens,
      system,
      messages: mensajes,
      // RESTRICCIÓN REAL 3 — tools estrictas: el API garantiza argumentos válidos contra el esquema
      // (additionalProperties: false), antes aún de que Zod los vuelva a validar en el código.
      tools: TOOLS_ANTHROPIC.map((t) => ({ ...t, strict: true })),
      tool_choice: { type: 'auto' },
      // Chat interactivo: el esfuerzo bajo responde rápido y sobra para elegir
      // una tool y redactar. La inteligencia dura ya vive en el warehouse.
      output_config: { effort: 'low' },
      // Rescate del proveedor si un clasificador de seguridad declina la petición.
      ...(usaFallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    });

    uso.push(usoDeRespuesta(config.modelo, respuesta.usage));

    // Un rechazo se comunica, no se disfraza de respuesta vacía.
    if (respuesta.stop_reason === 'refusal') {
      return {
        uso,
        texto:
          'No puedo procesar esa solicitud. Reformúlala en términos de las métricas ' +
          'de negocio disponibles y con gusto la consulto.',
        tarjetas: [],
        conjuntos: [],
        consultas: [],
        solicitudes: [],
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
      // Demanda no atendida: la registra el modelo (tool) o la deduce el código de una
      // denegación. Se deduplica por (tipo, métrica) para que un reintento no la repita.
      if (resultado.solicitud) {
        const s = resultado.solicitud;
        const repetida = solicitudes.some((x) => x.tipo === s.tipo && (x.metricaClave ?? '') === (s.metricaClave ?? '') && x.resumen === s.resumen);
        if (!repetida) solicitudes.push(s);
      }
      // Toda consulta con dato queda descrita por (tool, params validados): es lo que el
      // usuario puede guardar para reejecutar otro día bajo sus propias guardas.
      if (!resultado.esError && resultado.conjunto && resultado.params) {
        conjuntos.push(resultado.conjunto);
        consultas.push({
          tool: llamada.name,
          params: resultado.params,
          conjunto: conjuntos.length - 1,
          tituloSugerido: resultado.conjunto.titulo,
        });
      }
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
  // El prompt pide respuestas de pocas frases; este corte es el cinturón: si el modelo se
  // extiende, se conservan solo las frases completas que caben en el tope.
  texto = acotarTexto(texto, LARGO_MAXIMO_RESPUESTA);

  // Las tarjetas se deduplican por (métrica, período, empresa): una misma consulta
  // repetida en dos iteraciones no debe mostrar el dato dos veces.
  const vistas = new Set<string>();
  const unicas = tarjetas.filter((t) => {
    const clave = `${t.metricaClave}|${t.periodo}|${t.empresa ?? ''}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });

  return { texto, uso, tarjetas: unicas, conjuntos, consultas, solicitudes };
}
