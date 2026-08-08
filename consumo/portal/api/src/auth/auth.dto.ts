/** Esquemas Zod de autenticación del portal de usuario. */
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(100),
});

export const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1).max(100),
  passwordNueva: z.string().min(8).max(100),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type CambiarPasswordDto = z.infer<typeof cambiarPasswordSchema>;

/**
 * Pase de impersonación emitido por el portal de administración. Sólo se valida la
 * forma: el pase real se comprueba contra `portal.impersonaciones` (un solo uso y
 * caducidad), no aquí.
 */
export const impersonarSchema = z.object({
  ticket: z.string().min(20).max(200),
});

export type ImpersonarDto = z.infer<typeof impersonarSchema>;
