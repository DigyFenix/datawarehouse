/**
 * GUARDA 1 (parte a): esquemas Zod ESTRICTOS de las 4 tools. El LLM solo puede
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

export const esquemaListarMetricas = z
  .object({
    dominio: z
      .enum(['ventas', 'compras', 'tesoreria', 'rentabilidad', 'inventario', 'pedidos'])
      .optional(),
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
          enum: ['ventas', 'compras', 'tesoreria', 'rentabilidad', 'inventario', 'pedidos'],
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
