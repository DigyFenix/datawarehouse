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
