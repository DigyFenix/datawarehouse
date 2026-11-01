/**
 * Loop del agente: NL → (compuerta / repetición) → tool tipada → dato gobernado → respuesta verificada.
 *
 * El LLM elige QUÉ tool usar y con qué parámetros; este código VALIDA y EJECUTA
 * (CLAUDE.md §11). Loop manual y no el tool-runner del SDK porque cada paso
 * necesita interponer las guardas, auditar y construir las tarjetas de dato.
 *
 * Orden de un turno:
 *   1. Repetición: si el mensaje repite una pregunta ya respondida, se reejecuta sin modelo.
 *   2. Compuerta (Haiku): bloquea lo que no es consulta y, si es ambigua, el CÓDIGO pregunta con botones.
 *   3. Loop del modelo principal con tools estrictas.
 *   4. Anclaje: cada cifra del texto debe existir en los resultados; si no, plantilla del código.
 *   5. Sugerencias y contexto de la conversación, armados en código.
 */
import Anthropic from '@anthropic-ai/sdk';

import {
  actualizarContexto,
  buscarRepeticion,
  ejecutarAcciones,
  opcionesDesambiguacion,
  PREGUNTA_AMBIGUA,
  sugerenciasSiguientes,
} from './acciones';
import { resolverAlcance } from './alcances';
import { clasificarMensaje, esIntencionBloqueada, RESPUESTAS_FIJAS, usoDeRespuesta, type ClasificacionCompuerta } from './compuerta';
import { quitarDelimitadores } from './formato';
import { construirEvidencia, plantillaRespuesta, reemplazarClaves, verificarTexto } from './grounding';
import { construirBloquesSystem, prefijoFecha } from './prompt';
import { ejecutarTool } from './tools/ejecutar';
import { construirTools } from './tools/esquemas';
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
  TurnoPrevio,
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
const MODELOS_CON_FALLBACK = new Set(['claude-opus-5', 'claude-opus-5-5', 'claude-fable-5', 'claude-fable-5-1']);

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
  /** Preguntas previas con sus consultas (detección de repetición). Opcional. */
  turnosPrevios?: TurnoPrevio[];
  /** Cliente del API inyectable (evaluación y pruebas). Por defecto se crea con `config.apiKey`. */
  cliente?: Anthropic;
}

/** Resultado vacío con los campos nuevos en su valor neutro. */
function resultadoBase(entrada: EntradaAgente, uso: UsoModelo[]): ResultadoAgente {
  return {
    texto: '',
    uso,
    tarjetas: [],
    conjuntos: [],
    consultas: [],
    solicitudes: [],
    textoRegenerado: false,
    opciones: [],
    sugerencias: [],
    contexto: actualizarContexto(entrada.config.contexto, []),
  };
}

const TOOLS_CON_PERIODO = new Set(['consultar_metrica', 'consultar_metrica_por_dimension']);
const RE_TOP = /\b(?:los|las|top)\s+(\d{1,2})\b/i;

/** Repone período detectado y «los N» explícitos del mensaje en los parámetros de la tool. */
export function completarParametros(
  tool: string,
  input: unknown,
  mensaje: string,
  clasificacion: ClasificacionCompuerta | null,
): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const p = { ...(input as Record<string, unknown>) };
  const periodo = clasificacion?.periodo_detectado;
  if (TOOLS_CON_PERIODO.has(tool) && periodo && !p['periodo_desde'] && !p['periodo_hasta']) {
    if (periodo.desde) p['periodo_desde'] = periodo.desde;
    if (periodo.hasta) p['periodo_hasta'] = periodo.hasta;
  }
  if (tool === 'consultar_metrica_por_dimension') {
    const top = RE_TOP.exec(mensaje);
    const n = top ? Number(top[1]) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 50) p['limite'] = n;
  }
  return p;
}

export async function responder(entrada: EntradaAgente): Promise<ResultadoAgente> {
  const { ejecutor, config, usuarioId, historial, mensaje, auditar } = entrada;
  const simbolo = config.simboloMoneda ?? 'Q';

  const alcance = await resolverAlcance(ejecutor, usuarioId, { soloCertificadas: config.soloCertificadas });
  const visibles = alcance.empresas === '*' ? config.empresas.size : alcance.empresas.length;
  // Tokens de cada llamada al modelo en este turno: el host los costea por usuario.
  const uso: UsoModelo[] = [];

  // 1 — REPETICIÓN: la misma pregunta (o «repite», «actualiza») se reejecuta sin modelo, con datos frescos.
  const repetidas = buscarRepeticion(mensaje, entrada.turnosPrevios ?? []);
  if (repetidas) {
    const r = await ejecutarAcciones(
      repetidas.map((c) => ({ tool: c.tool, params: c.params })),
      { ejecutor, alcance, empresas: config.empresas, frescura: config.frescura, simboloMoneda: simbolo, auditar, origen: 'repeticion' },
    );
    if (r.ok) {
      return {
        ...resultadoBase(entrada, uso),
        texto: r.texto,
        tarjetas: r.tarjetas,
        conjuntos: r.conjuntos,
        consultas: r.consultas,
        sugerencias: sugerenciasSiguientes(r.consultas[r.consultas.length - 1], alcance, visibles),
        contexto: actualizarContexto(config.contexto, r.consultas),
      };
    }
  }

  const cliente = entrada.cliente ?? new Anthropic({ apiKey: config.apiKey });
  const usaFallback = MODELOS_CON_FALLBACK.has(config.modelo);

  // 2 — COMPUERTA: clasificador con salida estructurada. Lo que no es consulta se contesta con texto
  // fijo; lo ambiguo se pregunta con botones armados por el código (el clic no pasa por el modelo).
  let clasificacion: ClasificacionCompuerta | null = null;
  if (config.modeloCompuerta) {
    const ultimaRespuesta = [...historial].reverse().find((m) => m.rol === 'asistente')?.contenido ?? null;
    const dominios = [...new Set([...alcance.metricas.values()].map((m) => m.dominio).filter(Boolean))];
    const empresasVisibles = new Map([...config.empresas].filter(([id]) => alcance.empresas === '*' || alcance.empresas.includes(id)));
    clasificacion = await clasificarMensaje({
      cliente,
      modelo: config.modeloCompuerta,
      mensaje,
      ultimaRespuesta,
      dominios,
      metricas: new Map([...alcance.metricas.values()].map((m) => [m.clave, m.nombreOficial])),
      empresas: empresasVisibles,
      fechaActual: config.fechaActual,
      registrarUso: (u) => uso.push(u),
    });
    if (esIntencionBloqueada(clasificacion.intencion)) {
      await auditar({ accion: 'consulta_agente_denegada', detalle: { motivo: 'compuerta', intencion: clasificacion.intencion } });
      return { ...resultadoBase(entrada, uso), texto: RESPUESTAS_FIJAS[clasificacion.intencion] };
    }
    if (clasificacion.es_ambigua) {
      const opciones = opcionesDesambiguacion(
        {
          candidatas: clasificacion.metricas_candidatas,
          periodo: clasificacion.periodo_detectado,
          empresa: clasificacion.empresa_detectada,
          contexto: config.contexto,
        },
        alcance,
        config.fechaActual,
      );
      if (opciones.length >= 2) {
        await auditar({ accion: 'consulta_agente', detalle: { motivo: 'aclaracion_con_opciones', candidatas: clasificacion.metricas_candidatas } });
        return {
          ...resultadoBase(entrada, uso),
          texto: PREGUNTA_AMBIGUA,
          opciones,
          contexto: actualizarContexto(config.contexto, [], { empresa: clasificacion.empresa_detectada, periodo: clasificacion.periodo_detectado }),
        };
      }
    }
  }

  // 3 — LOOP DEL MODELO PRINCIPAL.
  const { estatico, dinamico } = construirBloquesSystem(config, alcance);
  // Caché en DOS puntos: reglas (estables por organización) y contexto del usuario (estable entre
  // sus turnos). La fecha va en el mensaje del usuario para no invalidar el segundo bloque.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: estatico, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dinamico, cache_control: { type: 'ephemeral' } },
  ];

  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    // REGLA ÚNICA DE HISTORIAL: las cifras previas no valen en este turno salvo que se vuelva a
    // ejecutar la herramienta (el anclaje de cifras lo hace cumplir en código).
    ...historial.map((m) => ({
      role: (m.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
      content:
        m.rol === 'asistente' && m.herramientas
          ? `${m.contenido}\n\n[Herramientas de ese turno: ${m.herramientas}. Para repetir una cifra hay que volver a ejecutarla.]`
          : m.contenido,
    })),
    { role: 'user', content: `${prefijoFecha(config.fechaActual)}\n${mensaje}` },
  ];

  const dominiosAlcance = [...new Set([...alcance.metricas.values()].map((m) => m.dominio).filter(Boolean))];
  // RESTRICCIÓN REAL 3 — tools estrictas: el API garantiza argumentos válidos contra el esquema
  // (additionalProperties: false), antes aún de que Zod los vuelva a validar en el código.
  const tools = construirTools(dominiosAlcance).map((t) => ({ ...t, strict: true }));

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
      tools,
      tool_choice: { type: 'auto' },
      // Sin `temperature`: los modelos configurados (Opus 5/5.5, Haiku 5.5) responden 400 a
      // cualquier parámetro de muestreo. El determinismo lo dan las tools estrictas, el
      // esfuerzo bajo y el anclaje de cifras, no la temperatura.
      output_config: { effort: 'low' },
      // Rescate del proveedor si un clasificador de seguridad declina la petición.
      ...(usaFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });

    uso.push(usoDeRespuesta(config.modelo, respuesta.usage));

    // Un rechazo se comunica, no se disfraza de respuesta vacía.
    if (respuesta.stop_reason === 'refusal') {
      return {
        ...resultadoBase(entrada, uso),
        texto: 'No puedo procesar esa solicitud. Reformúlala en términos de las métricas de negocio disponibles y con gusto la consulto.',
      };
    }

    const textoTurno = respuesta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (textoTurno) texto = textoTurno;

    const llamadas = respuesta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (llamadas.length === 0) break;

    mensajes.push({ role: 'assistant', content: respuesta.content });

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const llamada of llamadas) {
      // Lo que el USUARIO dijo explícito (período, «los 5») no queda a criterio del modelo: si la tool
      // lo omitió o lo cambió, el código lo repone antes de ejecutar. Solo completa; nunca amplía alcance.
      const entradaTool = completarParametros(llamada.name, llamada.input, mensaje, clasificacion);
      const resultado = await ejecutarTool(llamada.name, entradaTool, {
        ejecutor,
        alcance,
        empresas: config.empresas,
        frescura: config.frescura,
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
    // Si el modelo ya respondió y solo dejó constancia de una solicitud, no hace falta otra vuelta.
    if (textoTurno && llamadas.every((l) => l.name === 'registrar_solicitud')) break;
    mensajes.push({ role: 'user', content: resultados });
  }

  if (!texto) {
    texto = conjuntos.length || tarjetas.length
      ? plantillaRespuesta(tarjetas, conjuntos, simbolo)
      : 'No pude completar la consulta en los pasos disponibles. Intenta acotar la pregunta a una métrica y un período concretos.';
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

  // 4 — ANCLAJE: nombres oficiales en lugar de claves técnicas, tope de largo y verificación de cifras.
  const nombres = new Map<string, string>([...alcance.metricas.values()].map((m) => [m.clave, m.nombreOficial]));
  for (const [id, nombre] of config.empresas) nombres.set(id, nombre);
  texto = acotarTexto(reemplazarClaves(quitarDelimitadores(texto), nombres), LARGO_MAXIMO_RESPUESTA);

  const evidencia = construirEvidencia({
    tarjetas: unicas,
    conjuntos,
    periodos: [...alcance.metricas.values()].flatMap((m) => [m.periodoDesde, m.periodoHasta]),
    fechas: config.frescura.map((f) => f.fechaDatoMasReciente),
    fechaActual: config.fechaActual,
    textos: [...alcance.metricas.values()].map((m) => m.nombreOficial),
  });
  const verificacion = verificarTexto(texto, evidencia);
  let textoRegenerado = false;
  if (!verificacion.ok) {
    await auditar({
      accion: 'respuesta_regenerada',
      detalle: { original: texto, sin_respaldo: verificacion.sinRespaldo.slice(0, 20), consultas: consultas.map((c) => c.tool) },
    });
    texto = plantillaRespuesta(unicas, conjuntos, simbolo);
    textoRegenerado = true;
  }

  // 5 — Sugerencias y contexto (código, no modelo).
  return {
    texto,
    uso,
    tarjetas: unicas,
    conjuntos,
    consultas,
    solicitudes,
    textoRegenerado,
    opciones: [],
    sugerencias: sugerenciasSiguientes(consultas[consultas.length - 1], alcance, visibles),
    contexto: actualizarContexto(
      config.contexto,
      consultas,
      clasificacion ? { empresa: clasificacion.empresa_detectada, periodo: clasificacion.periodo_detectado } : undefined,
    ),
  };
}
