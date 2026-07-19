import { z } from 'zod';

export const crearTerminoSchema = z.object({
  termino: z.string().min(1).max(100),
  definicion: z.string().min(1),
  equivaleA: z.string().max(200).optional(),
  dominio: z.string().max(100).optional(),
});

export const actualizarTerminoSchema = crearTerminoSchema.partial().omit({ termino: true });

export type CrearTerminoDto = z.infer<typeof crearTerminoSchema>;
export type ActualizarTerminoDto = z.infer<typeof actualizarTerminoSchema>;
