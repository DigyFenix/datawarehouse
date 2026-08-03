import { z } from 'zod';

export const filtroNitsAfiliadosSchema = z.object({
  organizacionId: z.coerce
    .number({ invalid_type_error: 'Falta la organización (organizacionId) o no es un número' })
    .int()
    .positive('El id de organización debe ser positivo'),
});

export type FiltroNitsAfiliadosDto = z.infer<typeof filtroNitsAfiliadosSchema>;

// Alta en LOTE: la lista suele llegar pegada de un correo/Excel. El servicio
// normaliza, descarta vacíos y omite los que ya existen (unicidad por forma
// normalizada) — repetir la carga no duplica.
export const crearNitsAfiliadosSchema = z.object({
  organizacionId: z.number().int().positive(),
  nits: z
    .array(z.string().trim().min(1).max(50))
    .min(1, 'Envía al menos un NIT')
    .max(200, 'Máximo 200 NIT por lote'),
});

export type CrearNitsAfiliadosDto = z.infer<typeof crearNitsAfiliadosSchema>;

export const actualizarNitAfiliadoSchema = z
  .object({
    nit: z.string().trim().min(1).max(50),
    nombre: z.string().trim().max(150).nullable(),
    activo: z.boolean(),
  })
  .partial();

export type ActualizarNitAfiliadoDto = z.infer<typeof actualizarNitAfiliadoSchema>;
