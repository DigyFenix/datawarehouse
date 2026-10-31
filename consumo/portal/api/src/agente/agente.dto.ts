/** Esquemas Zod del módulo del asistente (mensajes y consultas guardadas). */
import { z } from 'zod';

export const enviarMensajeSchema = z.object({
  contenido: z.string().min(1).max(4000),
});
export type EnviarMensajeDto = z.infer<typeof enviarMensajeSchema>;

/**
 * Especificación guardable: la tool y sus parámetros. Aquí solo se valida la FORMA
 * (tool permitida, params objeto plano con valores escalares); la validación de
 * negocio (Zod estricto por tool, catálogo, alcance) la hace el paquete del agente al
 * ejecutarla, exactamente igual que cuando la pidió el modelo.
 */
const escalar = z.union([z.string().max(200), z.number().finite(), z.boolean()]);
const paramsSchema = z.record(z.string().regex(/^[a-z_]{1,40}$/), escalar).refine((o) => Object.keys(o).length <= 12, {
  message: 'Demasiados parámetros',
});

export const vistaSchema = z.enum(['tabla', 'barras', 'lineas']);

export const crearConsultaGuardadaSchema = z.object({
  titulo: z.string().trim().min(1).max(120),
  descripcion: z.string().trim().max(500).nullable().optional(),
  tool: z.enum(['consultar_metrica', 'consultar_aging', 'consultar_metrica_por_dimension']),
  params: paramsSchema,
  vista: vistaSchema.default('tabla'),
});
export type CrearConsultaGuardadaDto = z.infer<typeof crearConsultaGuardadaSchema>;

export const actualizarConsultaGuardadaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(120).optional(),
    descripcion: z.string().trim().max(500).nullable().optional(),
    vista: vistaSchema.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nada que actualizar' });
export type ActualizarConsultaGuardadaDto = z.infer<typeof actualizarConsultaGuardadaSchema>;
