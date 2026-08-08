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
  AGENTE_MAX_ITERACIONES: z.coerce.number().int().positive().default(6),
  AGENTE_MAX_TOKENS: z.coerce.number().int().positive().default(4096),

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
