import { z } from 'zod';

export const crearConexionSchema = z.object({
  nombre: z.string().min(1).max(100),
  entornoClave: z.string().min(1).max(50),
  host: z.string().min(1).max(200),
  puerto: z.number().int().positive().max(65535),
  baseDatos: z.string().max(100).optional(),
  secretoRef: z.string().min(1).max(100),
  activo: z.boolean().default(true),
  notas: z.string().max(500).optional(),
});

export const actualizarConexionSchema = crearConexionSchema.partial();

export type CrearConexionDto = z.infer<typeof crearConexionSchema>;
export type ActualizarConexionDto = z.infer<typeof actualizarConexionSchema>;
