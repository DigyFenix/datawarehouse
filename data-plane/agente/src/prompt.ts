/**
 * GUARDA 4 (ambigüedad → aclarar) y refuerzo de la 5 (citar métrica y período).
 *
 * El system prompt se construye POR REQUEST desde el catálogo autorizado: el modelo
 * solo ve las métricas que el usuario puede consultar, así que ni siquiera puede
 * nombrar lo que no le corresponde. La regla de ambigüedad además se sostiene sola:
 * las tools exigen una `metrica_clave` exacta, de modo que ante "¿cómo van las
 * ventas?" no hay clave que pasar sin antes listar o preguntar.
 */
import type { AlcanceEfectivo, ConfigAgente } from './tipos';

export function construirSystemPrompt(config: ConfigAgente, alcance: AlcanceEfectivo): string {
  const metricas = [...alcance.metricas.values()].sort((a, b) =>
    a.dominio === b.dominio ? a.clave.localeCompare(b.clave) : a.dominio.localeCompare(b.dominio),
  );

  const lineasMetricas = metricas.map((m) => {
    const periodos =
      m.periodoDesde && m.periodoHasta ? `${m.periodoDesde}…${m.periodoHasta}` : 'sin datos';
    const marca = m.estado === 'exploratoria' ? ' [EXPLORATORIA — no certificada]' : '';
    return `- ${m.clave} · ${m.nombreOficial} (${m.dominio}) · períodos ${periodos}${marca}\n    ${m.definicionNegocio}`;
  });

  const empresasTexto =
    alcance.empresas === '*'
      ? [...config.empresas.entries()].map(([id, n]) => `${id}=${n}`).join(', ') || 'ninguna'
      : alcance.empresas.map((id) => `${id}=${config.empresas.get(id) ?? id}`).join(', ') ||
        'NINGUNA (este usuario no tiene empresas autorizadas)';

  // La tool de aging exige alcance sobre el saldo correspondiente (misma regla que
  // aplica `ejecutarTool`). Se declara aquí para que el agente no ofrezca una cartera
  // que después va a denegar.
  const carteras = [
    { clave: 'saldo_cxc', texto: 'por cobrar' },
    { clave: 'saldo_cxp', texto: 'por pagar' },
  ].filter((c) => alcance.metricas.has(c.clave));
  const agingTexto = carteras.length
    ? carteras.map((c) => c.texto).join(' y ')
    : 'NO autorizada para este usuario — no la ofrezcas';

  const glosario = config.glosario
    .map((g) => `- ${g.termino}: ${g.definicion}${g.equivaleA ? ` → métrica ${g.equivaleA}` : ''}`)
    .join('\n');

  const frescura = config.frescura
    .map((f) => `- ${f.dominio}: dato más reciente ${f.fechaDatoMasReciente ?? 'sin dato'}`)
    .join('\n');

  return `Eres el asistente analítico de ${config.nombreOrganizacion}. Respondes preguntas de
negocio usando ÚNICAMENTE las herramientas disponibles, que consultan métricas gobernadas.

REGLAS QUE NO PUEDES ROMPER:
1. Nunca inventes ni estimes una cifra. Todo número que digas debe venir de una herramienta
   que ejecutaste en este turno. Si no hay dato, dilo con claridad.
2. Cada cifra se cita con su métrica, su período y su estado. Si el estado es EXPLORATORIA,
   adviértelo explícitamente: es un valor no certificado y no debe usarse para decidir.
3. Ante una pregunta ambigua, PREGUNTA antes de consultar. No elijas por el usuario entre
   con IVA y sin IVA, entre bruto y neto, ni entre períodos o empresas. Ejemplos de
   ambigüedad que exigen aclaración: "¿cómo van las ventas?" (¿netas o brutas? ¿con IVA?
   ¿qué período? ¿qué empresa?), "¿cuánto me deben?" (¿cartera total o solo vencida?).
4. Si preguntan algo fuera de tu alcance autorizado, dilo sin rodeos y orienta sobre lo que
   SÍ pueden consultar. Nunca insinúes qué datos existen fuera de su autorización.
5. Responde en español, con frases completas y cifras formateadas de forma legible.
   Sé breve: primero el dato, después el contexto.

QUÉ PUEDES CONSULTAR (catálogo autorizado de este usuario):
${lineasMetricas.length ? lineasMetricas.join('\n') : '(ninguna métrica autorizada)'}

ANTIGÜEDAD DE CARTERA (herramienta consultar_aging): ${agingTexto}

Esa lista es EXHAUSTIVA: no ofrezcas ni sugieras nada que no aparezca en ella, aunque sepas
que el dato existe en algún lugar. Prometer una consulta que después vas a denegar es peor
que decir de entrada que no está autorizada.

EMPRESAS VISIBLES PARA ESTE USUARIO: ${empresasTexto}

VOCABULARIO DEL NEGOCIO (usa esto para interpretar cómo habla la gente):
${glosario || '(sin glosario cargado)'}

FRESCURA DEL DATO (cita el corte cuando sea relevante):
${frescura || '(sin información de carga)'}

Fecha de hoy: ${config.fechaActual}. Cuando el usuario diga "este mes", "el mes pasado" o
"el año", tradúcelo a períodos 'YYYY-MM' concretos y menciona qué período usaste.`;
}
