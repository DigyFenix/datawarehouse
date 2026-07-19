import { z } from 'zod';

export const crearMetricaSchema = z.object({
  clave: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/, 'solo minúsculas, números y guion bajo'),
  nombreOficial: z.string().min(2).max(200),
  definicionNegocio: z.string().min(2),
  hechoOrigen: z.string().min(1),
  periodicidad: z.string().max(50).optional(),
  owner: z.string().min(1).max(100),
  rolesAutorizados: z.array(z.string()).default([]),
  aprobadores: z.array(z.string().email()).default([]),
});

// Editar solo campos de gestión; la fórmula y el estado se cambian por versión/certificación.
export const actualizarMetricaSchema = z.object({
  nombreOficial: z.string().min(2).max(200).optional(),
  definicionNegocio: z.string().min(2).optional(),
  periodicidad: z.string().max(50).optional(),
  owner: z.string().min(1).max(100).optional(),
  rolesAutorizados: z.array(z.string()).optional(),
  aprobadores: z.array(z.string().email()).optional(),
});

export const crearVersionSchema = z.object({
  formula: z.string().min(1),
  definicionNegocio: z.string().min(2),
  notas: z.string().optional(),
});

export const enviarRevisionSchema = z.object({
  // Aprobadores requeridos para esta versión (emails). Si se omite, usa los de la métrica.
  aprobadores: z.array(z.string().email()).min(1).optional(),
});

export const votarSchema = z.object({
  aprobado: z.boolean(),
  comentario: z.string().max(500).optional(),
});

export type CrearMetricaDto = z.infer<typeof crearMetricaSchema>;
export type ActualizarMetricaDto = z.infer<typeof actualizarMetricaSchema>;
export type CrearVersionDto = z.infer<typeof crearVersionSchema>;
export type EnviarRevisionDto = z.infer<typeof enviarRevisionSchema>;
export type VotarDto = z.infer<typeof votarSchema>;
