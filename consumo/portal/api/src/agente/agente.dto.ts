/** Esquemas Zod del módulo del asistente (mensajes y consultas guardadas). */
import { z } from 'zod';

export const enviarMensajeSchema = z.object({
  contenido: z.string().min(1).max(4000),
});
export type EnviarMensajeDto = z.infer<typeof enviarMensajeSchema>;

/**
 * Clic en un botón de desambiguación o en una sugerencia: la acción que armó el CÓDIGO del
 * agente (tool + params). Aquí solo se valida la FORMA; el paquete la revalida con el Zod
 * estricto de la tool, el catálogo, el alcance y el RLS de quien hace clic antes de ejecutarla.
 */
export const accionChatSchema = z.object({
  etiqueta: z.string().trim().min(1).max(160),
  accion: z.object({
    tool: z.enum(['consultar_metrica', 'consultar_aging', 'consultar_metrica_por_dimension', 'explicar_metrica']),
    params: z.record(z.string().regex(/^[a-z_]{1,40}$/), z.union([z.string().max(200), z.number().finite(), z.boolean()])).refine((o) => Object.keys(o).length <= 12, {
      message: 'Demasiados parámetros',
    }),
  }),
});
export type AccionChatDto = z.infer<typeof accionChatSchema>;

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
  /** Fijar de una vez como widget de «Mi tablero». */
  enTablero: z.boolean().optional(),
});
export type CrearConsultaGuardadaDto = z.infer<typeof crearConsultaGuardadaSchema>;

export const actualizarConsultaGuardadaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(120).optional(),
    descripcion: z.string().trim().max(500).nullable().optional(),
    vista: vistaSchema.optional(),
    enTablero: z.boolean().optional(),
    tableroAncho: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nada que actualizar' });
export type ActualizarConsultaGuardadaDto = z.infer<typeof actualizarConsultaGuardadaSchema>;

/** Orden del tablero: ids propios en la posición deseada. */
export const ordenTableroSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(60),
});
export type OrdenTableroDto = z.infer<typeof ordenTableroSchema>;

export const estadoSolicitudSchema = z.enum(['nueva', 'en_revision', 'atendida', 'descartada']);
export const actualizarSolicitudSchema = z
  .object({
    estado: estadoSolicitudSchema.optional(),
    notaAdmin: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nada que actualizar' });
export type ActualizarSolicitudDto = z.infer<typeof actualizarSolicitudSchema>;
