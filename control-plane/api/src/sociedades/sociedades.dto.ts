import { z } from 'zod';

export const filtroSociedadesSchema = z.object({
  organizacionId: z.coerce
    .number({ invalid_type_error: 'Falta la organización (organizacionId) o no es un número' })
    .int()
    .positive('El id de organización debe ser positivo'),
});

export type FiltroSociedadesDto = z.infer<typeof filtroSociedadesSchema>;

export const crearSociedadSchema = z.object({
  // Obligatoria (migración 105): determina el ERP y la base del tenant de la sociedad.
  organizacionId: z.number().int().positive(),
  empresaId: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'Solo minúsculas, dígitos y guion bajo; empieza por letra'),
  nombre: z.string().min(1).max(150),
  nit: z.string().max(50).optional(),
  // ISO 4217 (GTQ, USD). El grupo dejó de ser monomoneda: El Salvador opera en USD.
  moneda: z.string().trim().toUpperCase().length(3).nullable().optional(),
  // Moneda de consolidación; distinta de `moneda` = convertir con la serie de la sociedad.
  monedaPresentacion: z.string().trim().toUpperCase().length(3).nullable().optional(),
  conexionId: z.number().int().positive().nullable().optional(),
  esquemaOrigen: z.string().max(100).optional(),
  activo: z.boolean().default(true),
  orden: z.number().int().min(0).default(0),
});

// Una sociedad no se reasigna de organización: eso sería otra sociedad, no una edición.
export const actualizarSociedadSchema = crearSociedadSchema
  .omit({ empresaId: true, organizacionId: true })
  .partial();

export type CrearSociedadDto = z.infer<typeof crearSociedadSchema>;
export type ActualizarSociedadDto = z.infer<typeof actualizarSociedadSchema>;
