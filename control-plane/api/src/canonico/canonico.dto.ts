import { z } from 'zod';

const nombreCanonico = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, 'Solo minúsculas, dígitos y guion bajo; empieza por letra');

export const crearEntidadSchema = z.object({
  clave: nombreCanonico,
  nombre: z.string().min(1).max(120),
  dominio: z.string().min(1).max(100),
  tipo: z.enum(['dimension', 'hecho_cabecera', 'hecho_linea']),
  descripcion: z.string().max(300).optional(),
});
export type CrearEntidadDto = z.infer<typeof crearEntidadSchema>;

export const crearCampoSchema = z.object({
  entidadClave: z.string().min(1).max(80),
  nombre: nombreCanonico,
  tipo: z.string().min(1).max(40),
  requerido: z.boolean().default(false),
  descripcion: z.string().max(300).optional(),
  orden: z.number().int().min(0).default(0),
});
export type CrearCampoCanonicoDto = z.infer<typeof crearCampoSchema>;

export const actualizarCampoCanonicoSchema = crearCampoSchema.omit({ entidadClave: true }).partial();
export type ActualizarCampoCanonicoDto = z.infer<typeof actualizarCampoCanonicoSchema>;
