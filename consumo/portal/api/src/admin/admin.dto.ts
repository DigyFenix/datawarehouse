/** Esquemas Zod del módulo de autoadministración de la organización. */
import { z } from 'zod';

export const crearUsuarioSchema = z.object({
  email: z.string().email().max(200),
  nombre: z.string().min(2).max(200),
  // Contraseña temporal: el sistema fuerza el cambio al primer ingreso.
  password: z.string().min(8).max(100),
  esAdmin: z.boolean().default(false),
});

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(2).max(200).optional(),
  esAdmin: z.boolean().optional(),
  activo: z.boolean().optional(),
});

export const restablecerPasswordSchema = z.object({
  password: z.string().min(8).max(100),
});

export const asignarPerfilesSchema = z.object({
  perfilIds: z.array(z.number().int().positive()).max(100),
});

export const crearPerfilSchema = z.object({
  clave: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_]+$/, 'solo minúsculas, números y guion bajo'),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().max(1000).optional(),
  activo: z.boolean().default(true),
});

export const actualizarPerfilSchema = crearPerfilSchema.partial().omit({ clave: true });

export const asignarTablerosSchema = z.object({
  tableroIds: z.array(z.number().int().positive()).max(200),
});

// Alcances del perfil para el chatbot (Fase 4 del roadmap): se administran desde ya.
// 'empresa' es RLS (qué filas ve el agente); 'dominio'/'metrica' son autorización (qué puede invocar).
export const asignarAlcancesSchema = z.object({
  alcances: z
    .array(
      z.object({
        recursoTipo: z.enum(['dominio', 'metrica', 'empresa']),
        recursoClave: z.string().min(1).max(120),
      }),
    )
    .max(200),
});

/**
 * Término del glosario propio de la organización. `equivaleA` apunta a la clave de
 * una métrica del catálogo del producto: se valida con el mismo alfabeto que allí,
 * porque el agente la usa para traducir la pregunta a una consulta.
 */
export const terminoGlosarioSchema = z.object({
  termino: z.string().trim().min(2).max(80),
  definicion: z.string().trim().min(3).max(600),
  equivaleA: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'clave de métrica inválida (minúsculas, dígitos y _)')
    .max(80)
    .nullable()
    .optional(),
  dominio: z.string().trim().max(60).nullable().optional(),
});

export type TerminoGlosarioDto = z.infer<typeof terminoGlosarioSchema>;
export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioDto = z.infer<typeof actualizarUsuarioSchema>;
export type RestablecerPasswordDto = z.infer<typeof restablecerPasswordSchema>;
export type AsignarPerfilesDto = z.infer<typeof asignarPerfilesSchema>;
export type CrearPerfilDto = z.infer<typeof crearPerfilSchema>;
export type ActualizarPerfilDto = z.infer<typeof actualizarPerfilSchema>;
export type AsignarTablerosDto = z.infer<typeof asignarTablerosSchema>;
export type AsignarAlcancesDto = z.infer<typeof asignarAlcancesSchema>;
