/**
 * GUARDA 1 (parte a): esquemas Zod ESTRICTOS de las tools. El LLM solo puede
 * producir estos parámetros; cualquier cosa fuera del contrato se rechaza antes
 * de tocar la base. Las claves llevan regex: ni espacios, ni comillas, ni SQL.
 */
import { z } from 'zod';

const claveMetrica = z
  .string()
  .regex(/^[a-z0-9_]+$/, 'clave de métrica inválida (solo minúsculas, dígitos y _)');

const periodo = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "período inválido (formato 'YYYY-MM')");

// `empresa_id` es la clave de sociedad del ERP y en todo el modelo Oro es TEXTO
// (`proavisa`, `ironnetwork`…), no un entero. Mismo regex que la clave de métrica:
// deja fuera espacios, comillas y cualquier cosa que parezca SQL.
const claveEmpresa = z
  .string()
  .regex(/^[a-z0-9_]+$/, 'clave de empresa inválida (solo minúsculas, dígitos y _)');

// El dominio ya no es un enum fijo: el API recibe el enum de los dominios del alcance
// (`construirTools`) y el código vuelve a comprobar que el dominio pertenezca al alcance.
export const esquemaListarMetricas = z
  .object({
    dominio: z.string().regex(/^[a-z_]{1,40}$/, 'dominio inválido').optional(),
  })
  .strict();

export const esquemaConsultarMetrica = z
  .object({
    metrica_clave: claveMetrica,
    periodo_desde: periodo.optional(),
    periodo_hasta: periodo.optional(),
    empresa_id: claveEmpresa.optional(),
    agrupar_por_empresa: z.boolean().optional(),
  })
  .strict();

export const esquemaConsultarAging = z
  .object({
    tipo_cartera: z.enum(['cobrar', 'pagar']),
    empresa_id: claveEmpresa.optional(),
    detalle: z.enum(['por_rango', 'por_socio']).default('por_rango'),
    limite_socios: z.number().int().min(1).max(25).default(10),
  })
  .strict();

export const esquemaExplicarMetrica = z
  .object({ metrica_clave: claveMetrica })
  .strict();

/** Vocabulario cerrado de dimensiones (coincide con oro.metrica_valor_dimension.dimension). */
export const DIMENSIONES = ['cliente', 'producto', 'linea', 'vendedor', 'canal', 'sector', 'proveedor'] as const;
export type Dimension = (typeof DIMENSIONES)[number];

export const esquemaConsultarPorDimension = z
  .object({
    metrica_clave: claveMetrica,
    dimension: z.enum(DIMENSIONES),
    periodo_desde: periodo.optional(),
    periodo_hasta: periodo.optional(),
    empresa_id: claveEmpresa.optional(),
    limite: z.number().int().min(1).max(50).default(10),
    orden: z.enum(['mayor', 'menor']).default('mayor'),
  })
  .strict();
export type ParamsConsultarPorDimension = z.infer<typeof esquemaConsultarPorDimension>;

/** Tipos de demanda no atendida (coinciden con portal.solicitudes_no_atendidas.tipo). */
export const TIPOS_SOLICITUD = ['fuera_catalogo', 'frescura', 'sin_autorizacion', 'desglose_no_admitido', 'otro'] as const;

/** Los únicos que registra el MODELO; `sin_autorizacion` y `desglose_no_admitido` los deduce el código. */
export const TIPOS_SOLICITUD_MODELO = ['fuera_catalogo', 'frescura'] as const;

/**
 * Registro de una pregunta que NO se puede atender con la capa semántica. No consulta nada:
 * deja constancia para el administrador. El resumen se acota y se limpia de saltos de línea.
 */
export const esquemaRegistrarSolicitud = z
  .object({
    tipo: z.enum(TIPOS_SOLICITUD_MODELO),
    resumen: z.string().trim().min(5).max(300),
    metrica_clave: claveMetrica.optional(),
    dominio: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  })
  .strict();
export type ParamsRegistrarSolicitud = z.infer<typeof esquemaRegistrarSolicitud>;

export type ParamsListarMetricas = z.infer<typeof esquemaListarMetricas>;
export type ParamsConsultarMetrica = z.infer<typeof esquemaConsultarMetrica>;
export type ParamsConsultarAging = z.infer<typeof esquemaConsultarAging>;
export type ParamsExplicarMetrica = z.infer<typeof esquemaExplicarMetrica>;

/** Definiciones para el API de Anthropic (JSON Schema a mano: 4 tools chicas, cero deps). */
export const TOOLS_ANTHROPIC = [
  {
    name: 'listar_metricas_disponibles',
    description:
      'Lista las métricas certificadas que este usuario puede consultar, con su definición ' +
      'de negocio y el rango de períodos con datos. Úsala cuando no estés seguro de qué ' +
      'métrica corresponde a la pregunta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dominio: {
          type: 'string',
          description: 'Filtrar por dominio de negocio (opcional).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultar_metrica',
    description:
      'Devuelve los valores mensuales de UNA métrica del catálogo, por período y empresa. ' +
      'Solo acepta claves exactas del catálogo autorizado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metrica_clave: { type: 'string', description: 'Clave exacta de la métrica (p. ej. ventas_netas_sin_iva).' },
        periodo_desde: { type: 'string', description: "Mes inicial 'YYYY-MM' (opcional)." },
        periodo_hasta: { type: 'string', description: "Mes final 'YYYY-MM' (opcional)." },
        empresa_id: { type: 'string', description: "Clave de empresa (texto, p. ej. 'ironnetwork') para limitar a una sola (opcional)." },
        agrupar_por_empresa: { type: 'boolean', description: 'true = desglosar por empresa.' },
      },
      required: ['metrica_clave'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultar_aging',
    description:
      'Antigüedad de la cartera (cobrar o pagar) a la última fecha de corte: por rango ' +
      '(corriente, 1-30, 31-60, 61-90, +90) o los mayores socios por saldo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo_cartera: { type: 'string', enum: ['cobrar', 'pagar'] },
        empresa_id: { type: 'string', description: "Clave de empresa (texto) para limitar a una sola (opcional)." },
        detalle: { type: 'string', enum: ['por_rango', 'por_socio'], description: "Default 'por_rango'." },
        limite_socios: { type: 'number', description: 'Top-N socios (1-25, default 10). Solo con detalle por_socio.' },
      },
      required: ['tipo_cartera'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultar_metrica_por_dimension',
    description:
      'Desglosa UNA métrica del catálogo por una dimensión (cliente, producto, línea, vendedor, ' +
      'canal, sector o proveedor): ranking de los mayores o menores miembros, sumando el rango de ' +
      'períodos. Úsala para «top clientes», «qué productos», «por vendedor», «a quién le compro». ' +
      'Solo las métricas marcadas como desglosables admiten esta herramienta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metrica_clave: { type: 'string', description: 'Clave exacta de la métrica (debe ser desglosable).' },
        dimension: { type: 'string', enum: [...DIMENSIONES], description: 'Eje del desglose.' },
        periodo_desde: { type: 'string', description: "Mes inicial 'YYYY-MM' (opcional)." },
        periodo_hasta: { type: 'string', description: "Mes final 'YYYY-MM' (opcional)." },
        empresa_id: { type: 'string', description: 'Clave de empresa (texto) para limitar a una sola (opcional).' },
        limite: { type: 'number', description: 'Cuántos miembros devolver (1-50, default 10).' },
        orden: { type: 'string', enum: ['mayor', 'menor'], description: "'mayor' = los más grandes (default); 'menor' = los más chicos." },
      },
      required: ['metrica_clave', 'dimension'],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_solicitud',
    description:
      'Deja constancia de algo que la persona pidió y NO se puede atender: una métrica o dato que ' +
      'no existe en el catálogo (fuera_catalogo) o un dato más reciente que la última carga ' +
      '(frescura). No consulta ni cambia nada. Llámala UNA vez, en el mismo turno de tu respuesta. ' +
      'No la uses para preguntas ambiguas, permisos, desgloses ni errores de parámetros.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo: { type: 'string', enum: [...TIPOS_SOLICITUD_MODELO] },
        resumen: { type: 'string', description: 'Qué pidió la persona, en una frase (5 a 300 caracteres), sin datos personales.' },
        metrica_clave: { type: 'string', description: 'Métrica relacionada, si la hay.' },
        dominio: { type: 'string', description: 'Dominio de negocio relacionado (ventas, compras, tesoreria, inventario, pedidos, rentabilidad), si aplica.' },
      },
      required: ['tipo', 'resumen'],
      additionalProperties: false,
    },
  },
  {
    name: 'explicar_metrica',
    description:
      'Ficha de gobierno de una métrica: definición oficial, fórmula, estado de certificación ' +
      'y términos del glosario relacionados. Úsala cuando pregunten QUÉ significa una métrica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metrica_clave: { type: 'string', description: 'Clave exacta de la métrica.' },
      },
      required: ['metrica_clave'],
      additionalProperties: false,
    },
  },
];

/**
 * Tools para UNA petición: igual que `TOOLS_ANTHROPIC`, pero el filtro de dominio de
 * `listar_metricas_disponibles` es el enum de los dominios del alcance del usuario (el modelo no
 * puede pedir un dominio que no existe o que no le corresponde). Orden estable: los dominios se
 * ordenan para no romper la caché del prefijo entre peticiones del mismo alcance.
 */
export function construirTools(dominios: string[]): typeof TOOLS_ANTHROPIC {
  const enumDominios = [...new Set(dominios.filter((d) => /^[a-z_]{1,40}$/.test(d)))].sort();
  return TOOLS_ANTHROPIC.map((t) => {
    if (t.name !== 'listar_metricas_disponibles' || enumDominios.length === 0) return t;
    return {
      ...t,
      input_schema: {
        ...t.input_schema,
        properties: {
          dominio: { type: 'string', enum: enumDominios, description: 'Filtrar por dominio de negocio (opcional).' },
        },
      },
    };
  }) as typeof TOOLS_ANTHROPIC;
}
