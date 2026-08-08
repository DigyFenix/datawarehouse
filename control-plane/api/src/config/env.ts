/**
 * Validación de variables de entorno con Zod (entradas externas siempre validadas).
 * Falla al arranque si falta algo. NUNCA registrar valores sensibles.
 */
import { z } from 'zod';

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),

  // Postgres (metadata-store)
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRA_EN: z.string().default('8h'),

  // Admin de arranque: se crea si la tabla de usuarios está vacía (bootstrap).
  // SIN defaults: un correo/contraseña por defecto en un producto multi-tenant es una
  // puerta trasera conocida. Se exigen en el .env (ver .env.example).
  PORTAL_ADMIN_EMAIL: z.string().email(),
  PORTAL_ADMIN_PASSWORD: z.string().min(8),

  // Worker del plano de datos (introspección/extracción).
  WORKER_URL: z.string().url().default('http://worker:3010'),
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
