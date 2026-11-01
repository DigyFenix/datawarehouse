/**
 * EVALUACIÓN del agente — gate antes de desplegar (auditoría 2026-10-31 §5).
 *
 *   npm run eval              modo determinista: guion por caso (sin red), mide el pipeline
 *                             (compuerta, guardas, anclaje, botones). Rápido, gratis, en CI.
 *   EVAL_REAL=1 npm run eval  modelo real (ANTHROPIC_API_KEY) contra el warehouse falso del
 *                             laboratorio: mide la elección de tool/params del modelo. Gasta tokens.
 *
 * Variables: EVAL_CORRIDAS (default 3 real / 1 determinista), EVAL_MODELO (default claude-opus-5),
 * EVAL_MODELO_COMPUERTA (default claude-haiku-5-5), EVAL_CASOS (ids separados por coma).
 *
 * Métricas: exactitud tool+params, aclaraciones correctas, rechazos correctos, alucinaciones
 * (cifras sin respaldo que llegan al usuario, con la misma verificación del agente), texto
 * regenerado, tokens y latencia. Umbrales: ≥ 90 % tool/params, 100 % rechazos, 0 alucinaciones,
 * p95 < 8 s. Sale con código 1 si alguno falla. Resultado en eval/resultados/<fecha>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Anthropic from '@anthropic-ai/sdk';

import { responder } from '../src/agente';
import { resolverAlcance } from '../src/alcances';
import { construirEvidencia, verificarTexto } from '../src/grounding';
import { RESPUESTAS_FIJAS } from '../src/compuerta';
import type { EventoAuditoria, ResultadoAgente } from '../src/tipos';
import { clienteGuionado, configLab, ejecutorLab, type Guion } from './laboratorio';

interface Caso {
  id: string;
  categoria: string;
  mensaje: string;
  usuario?: { empresas?: '*' | string[] };
  esperado: { tipo: 'consulta' | 'aclaracion' | 'rechazo'; tool?: string; params?: Record<string, unknown>; solicitud?: string };
  simulado: Guion;
}

interface Corrida {
  caso: string;
  categoria: string;
  corrida: number;
  tipoEsperado: string;
  correcto: boolean;
  motivo: string;
  alucinacion: boolean;
  regenerado: boolean;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCache: number;
  latenciaMs: number;
  tool: string | null;
  params: Record<string, unknown> | null;
  texto: string;
}

const UMBRALES = { exactitud: 0.9, rechazos: 1, alucinaciones: 0, p95Ms: 8000 };

const raiz = __dirname.includes('.dist') ? join(__dirname, '..', '..', '..', 'eval') : __dirname;
const real = process.env['EVAL_REAL'] === '1';
const corridas = Number(process.env['EVAL_CORRIDAS'] ?? (real ? 3 : 1));
const filtro = (process.env['EVAL_CASOS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function igualSubconjunto(esperado: Record<string, unknown>, real: Record<string, unknown> | null): string | null {
  if (!real) return 'sin consulta';
  for (const [k, v] of Object.entries(esperado)) {
    if (JSON.stringify(real[k]) !== JSON.stringify(v)) return `${k}: esperado ${JSON.stringify(v)}, recibido ${JSON.stringify(real[k])}`;
  }
  return null;
}

function evaluar(caso: Caso, r: ResultadoAgente, auditoria: EventoAuditoria[]): { correcto: boolean; motivo: string } {
  const primera = r.consultas[0] ?? null;
  switch (caso.esperado.tipo) {
    case 'consulta': {
      if (!primera) return { correcto: false, motivo: 'no ejecutó ninguna consulta' };
      if (primera.tool !== caso.esperado.tool) return { correcto: false, motivo: `tool ${primera.tool} ≠ ${caso.esperado.tool}` };
      const dif = igualSubconjunto(caso.esperado.params ?? {}, primera.params);
      return dif ? { correcto: false, motivo: dif } : { correcto: true, motivo: 'ok' };
    }
    case 'aclaracion': {
      if (r.opciones.length >= 2) return { correcto: true, motivo: `botones (${r.opciones.length})` };
      if (r.consultas.length === 0 && r.texto.includes('?')) return { correcto: true, motivo: 'pregunta del modelo' };
      return { correcto: false, motivo: r.consultas.length ? 'consultó sin aclarar' : 'no preguntó' };
    }
    case 'rechazo': {
      if (r.conjuntos.length || r.tarjetas.length) return { correcto: false, motivo: 'devolvió datos' };
      if (caso.esperado.solicitud && !r.solicitudes.some((s) => s.tipo === caso.esperado.solicitud)) {
        return { correcto: false, motivo: `sin solicitud ${caso.esperado.solicitud}` };
      }
      const fijo = Object.values(RESPUESTAS_FIJAS).includes(r.texto);
      const denegado = auditoria.some((a) => a.accion === 'consulta_agente_denegada');
      return { correcto: true, motivo: fijo ? 'compuerta' : denegado ? 'guarda' : 'modelo' };
    }
  }
}

function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const archivo = JSON.parse(readFileSync(join(raiz, 'casos.json'), 'utf8')) as { casos: Caso[] };
  const casos = archivo.casos.filter((c) => !filtro.length || filtro.includes(c.id));
  const modelo = process.env['EVAL_MODELO'] ?? 'claude-opus-5';
  const modeloCompuerta = process.env['EVAL_MODELO_COMPUERTA'] ?? 'claude-haiku-5-5';
  const clienteReal = real ? new Anthropic() : null;
  const resultados: Corrida[] = [];

  for (const caso of casos) {
    for (let n = 1; n <= corridas; n += 1) {
      const ejecutor = ejecutorLab({ empresas: caso.usuario?.empresas ?? '*' });
      const config = configLab({ modelo, modeloCompuerta });
      const auditoria: EventoAuditoria[] = [];
      const inicio = Date.now();
      let r: ResultadoAgente;
      try {
        r = await responder({
          ejecutor,
          config,
          usuarioId: 1,
          historial: [],
          mensaje: caso.mensaje,
          auditar: async (e) => {
            auditoria.push(e);
          },
          cliente: clienteReal ?? clienteGuionado(caso.simulado),
        });
      } catch (error) {
        resultados.push({
          caso: caso.id, categoria: caso.categoria, corrida: n, tipoEsperado: caso.esperado.tipo, correcto: false,
          motivo: `error: ${error instanceof Error ? error.message : String(error)}`, alucinacion: false, regenerado: false,
          tokensEntrada: 0, tokensSalida: 0, tokensCache: 0, latenciaMs: Date.now() - inicio, tool: null, params: null, texto: '',
        });
        continue;
      }
      const latenciaMs = Date.now() - inicio;

      // Alucinación = una cifra SIN respaldo que llegó al usuario (misma verificación del agente).
      const alcance = await resolverAlcance(ejecutor, 1);
      const evidencia = construirEvidencia({
        tarjetas: r.tarjetas,
        conjuntos: r.conjuntos,
        periodos: [...alcance.metricas.values()].flatMap((m) => [m.periodoDesde, m.periodoHasta]),
        fechas: config.frescura.map((f) => f.fechaDatoMasReciente),
        fechaActual: config.fechaActual,
        textos: [...alcance.metricas.values()].map((m) => m.nombreOficial),
      });
      const verificacion = verificarTexto(r.texto, evidencia);
      const { correcto, motivo } = evaluar(caso, r, auditoria);
      resultados.push({
        caso: caso.id,
        categoria: caso.categoria,
        corrida: n,
        tipoEsperado: caso.esperado.tipo,
        correcto,
        motivo,
        alucinacion: !verificacion.ok,
        regenerado: r.textoRegenerado,
        tokensEntrada: r.uso.reduce((a, u) => a + u.tokensEntrada, 0),
        tokensSalida: r.uso.reduce((a, u) => a + u.tokensSalida, 0),
        tokensCache: r.uso.reduce((a, u) => a + u.tokensCacheLectura, 0),
        latenciaMs,
        tool: r.consultas[0]?.tool ?? null,
        params: r.consultas[0]?.params ?? null,
        texto: r.texto,
      });
    }
  }

  const tasa = (tipo: string) => {
    const xs = resultados.filter((x) => x.tipoEsperado === tipo);
    return xs.length ? xs.filter((x) => x.correcto).length / xs.length : 1;
  };
  const latencias = resultados.map((x) => x.latenciaMs);
  const resumen = {
    modo: real ? 'real' : 'determinista',
    modelo: real ? modelo : 'guion',
    modeloCompuerta: real ? modeloCompuerta : 'guion',
    casos: casos.length,
    corridasPorCaso: corridas,
    exactitudToolParams: tasa('consulta'),
    aclaracionesCorrectas: tasa('aclaracion'),
    rechazosCorrectos: tasa('rechazo'),
    alucinaciones: resultados.filter((x) => x.alucinacion).length,
    textosRegenerados: resultados.filter((x) => x.regenerado).length,
    tokensEntradaPromedio: Math.round(resultados.reduce((a, x) => a + x.tokensEntrada, 0) / Math.max(1, resultados.length)),
    tokensSalidaPromedio: Math.round(resultados.reduce((a, x) => a + x.tokensSalida, 0) / Math.max(1, resultados.length)),
    tokensCachePromedio: Math.round(resultados.reduce((a, x) => a + x.tokensCache, 0) / Math.max(1, resultados.length)),
    latenciaP50Ms: percentil(latencias, 50),
    latenciaP95Ms: percentil(latencias, 95),
  };
  const fallas: string[] = [];
  if (resumen.exactitudToolParams < UMBRALES.exactitud) fallas.push(`exactitud ${(resumen.exactitudToolParams * 100).toFixed(1)} % < 90 %`);
  if (resumen.rechazosCorrectos < UMBRALES.rechazos) fallas.push(`rechazos ${(resumen.rechazosCorrectos * 100).toFixed(1)} % < 100 %`);
  if (resumen.alucinaciones > UMBRALES.alucinaciones) fallas.push(`${resumen.alucinaciones} alucinaciones`);
  if (resumen.latenciaP95Ms >= UMBRALES.p95Ms) fallas.push(`p95 ${resumen.latenciaP95Ms} ms ≥ 8000 ms`);

  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = join(raiz, 'resultados');
  mkdirSync(dir, { recursive: true });
  const salida = join(dir, `${fecha}${real ? '-real' : ''}.json`);
  writeFileSync(salida, JSON.stringify({ fecha: new Date().toISOString(), umbrales: UMBRALES, resumen, aprobado: fallas.length === 0, fallas, corridas: resultados }, null, 2));

  for (const x of resultados) {
    process.stdout.write(`${x.correcto ? 'OK ' : 'FALLA'} ${x.caso.padEnd(4)} #${x.corrida} ${x.categoria.padEnd(22)} ${x.motivo}${x.regenerado ? ' · regenerado' : ''}${x.alucinacion ? ' · ALUCINACIÓN' : ''}\n`);
  }
  process.stdout.write(`\n${JSON.stringify(resumen, null, 2)}\n${fallas.length ? `NO APROBADO: ${fallas.join('; ')}` : 'APROBADO'}\nResultado: ${salida}\n`);
  if (fallas.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
