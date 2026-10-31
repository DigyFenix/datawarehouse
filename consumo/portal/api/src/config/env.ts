/**
 * Validación de variables de entorno con Zod. Falla al arranque si falta algo.
 * NUNCA registrar valores sensibles.
 *
 * En producción, POSTGRES_USER/POSTGRES_PASSWORD deben ser el rol dedicado del
 * portal de usuario (SELECT sobre gobierno.organizaciones en la base de control
 * + permisos sobre el esquema `portal` de cada base de tenant), no el admin.
 */
import { z } from 'zod';

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORTAL_USUARIO_PORT: z.coerce.number().int().positive().default(3002),

  // Postgres: base de control (resolución hash → tenant + branding) y bases de tenant.
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),

  // Auth del portal de usuario: secreto PROPIO, distinto del portal admin.
  PORTAL_JWT_SECRET: z.string().min(16, 'PORTAL_JWT_SECRET debe tener al menos 16 caracteres'),
  PORTAL_JWT_EXPIRA_EN: z.string().default('8h'),

  // Agente de IA (CLAUDE.md §11): opcional — sin ANTHROPIC_API_KEY el módulo agente
  // responde 503 al postear un mensaje, pero el resto de la API arranca normal.
  ANTHROPIC_API_KEY: z.string().default(''),
  AGENTE_MODELO: z.string().default('claude-opus-5'),
  // Compuerta de intención: modelo barato que clasifica cada mensaje con salida estructurada antes
  // de que corra el agente. Vacío = sin compuerta.
  AGENTE_MODELO_COMPUERTA: z.string().default('claude-haiku-5-5'),
  // Cada iteración es una llamada al modelo: 4 alcanzan para aclarar, consultar y redactar.
  AGENTE_MAX_ITERACIONES: z.coerce.number().int().positive().default(4),
  // Respuestas cortas por diseño: el texto final son pocas frases y las tools son bloques chicos.
  AGENTE_MAX_TOKENS: z.coerce.number().int().positive().default(1000),

  // true (default) = el asistente, las guardadas, el tablero y las descargas SOLO ven métricas
  // certificadas. Es un filtro del código al construir el catálogo autorizado: ninguna
  // instrucción en el chat puede saltárselo. false = también exploratorias, marcadas.
  AGENTE_SOLO_CERTIFICADAS: z
    .string()
    .default('true')
    .transform((v) => !['false', '0', 'no'].includes(v.trim().toLowerCase())),

  // Zona horaria del negocio: «hoy», «este mes» y las fechas de corte se calculan aquí, no en UTC.
  ZONA_HORARIA: z.string().default('America/Guatemala'),
  // Horas de la carga programada del warehouse ("HH:MM HH:MM", hora del negocio). Es el MISMO
  // valor que lee infra/produccion/programador.sh: el portal no dispara cargas, solo dice cuándo
  // llega la próxima (frescura honesta en el asistente y en el inicio). Vacío = no se informa.
  HORAS_CARGA: z.string().default(''),

  // Rol de solo lectura `portal_lector` (RLS oro): el agente lee el warehouse del
  // tenant SOLO con esta contraseña. Sin ella, LectorPoolsService lanza al usarse.
  PORTAL_LECTOR_PASSWORD: z.string().default(''),
});

export type Env = z.infer<typeof esquemaEnv>;

/** Valida `process.env` y devuelve la config tipada. Lanza si es inválida. */
export function validarEnv(config: Record<string, unknown>): Env {
  const parsed = esquemaEnv.safeParse(config);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración de entorno inválida:\n${detalle}`);
  }
  return parsed.data;
}
