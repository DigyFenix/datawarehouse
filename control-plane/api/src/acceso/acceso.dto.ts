/** Esquemas Zod para autorizaciones (grants por rol). */
import { z } from 'zod';

export const crearAutorizacionSchema = z.object({
  rolId: z.number().int().positive(),
  recursoTipo: z.enum(['dominio', 'metrica', 'portal']),
  recursoClave: z.string().min(1).max(100), // clave o '*'
  permiso: z.enum(['leer', 'invocar', 'certificar', 'administrar']),
});

export type CrearAutorizacionDto = z.infer<typeof crearAutorizacionSchema>;
