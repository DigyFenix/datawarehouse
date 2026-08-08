/** Esquemas Zod del módulo auditoría. */
import { z } from 'zod';

export const filtroAuditoriaSchema = z.object({
  organizacionId: z.coerce.number().int().positive().optional(),
  /** Tamaño de página (default 50, máximo 200; el servicio hace clamp). */
  limite: z.coerce.number().int().positive().optional(),
  /** Cursor: id menor de la página previa (orden id DESC). */
  desdeId: z.coerce.number().int().positive().optional(),
});

export type FiltroAuditoriaDto = z.infer<typeof filtroAuditoriaSchema>;
