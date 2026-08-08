/** Esquemas Zod del módulo usuarios. */
import { z } from 'zod';

export const crearUsuarioSchema = z.object({
  email: z.string().email(),
  nombre: z.string().min(2).max(200),
  password: z.string().min(8, 'la contraseña debe tener al menos 8 caracteres'),
});

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(2).max(200).optional(),
  activo: z.boolean().optional(),
});

export const asignarRolSchema = z.object({
  rolId: z.number().int().positive(),
  /** Alcance del rol: id de organización, o null/ausente = alcance global. */
  organizacionId: z.number().int().positive().nullable().optional(),
});

export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioDto = z.infer<typeof actualizarUsuarioSchema>;
export type AsignarRolDto = z.infer<typeof asignarRolSchema>;
