/** Esquemas Zod del módulo portal-org (administración del portal de usuario por tenant). */
import { z } from 'zod';

export const sembrarAdminSchema = z.object({
  email: z.string().email().max(200),
  nombre: z.string().min(2).max(200),
  // Contraseña TEMPORAL: el portal de usuario fuerza el cambio al primer ingreso.
  password: z.string().min(8).max(100),
});

export const crearTableroSchema = z.object({
  clave: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_]+$/, 'solo minúsculas, números y guion bajo'),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().max(1000).optional(),
  // URL pública de Publish to Web. Solo https; el riesgo de exposición ya fue aceptado.
  urlPublica: z.string().url().max(2000).startsWith('https://', 'la URL debe ser https'),
  orden: z.number().int().min(0).default(0),
  activo: z.boolean().default(true),
});

export const actualizarTableroSchema = crearTableroSchema.partial().omit({ clave: true });

export type SembrarAdminDto = z.infer<typeof sembrarAdminSchema>;
export type CrearTableroDto = z.infer<typeof crearTableroSchema>;
export type ActualizarTableroDto = z.infer<typeof actualizarTableroSchema>;
