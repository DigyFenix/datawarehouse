/** Esquema Zod del mensaje entrante del chat con el agente de IA. */
import { z } from 'zod';

export const enviarMensajeSchema = z.object({
  contenido: z.string().min(1).max(4000),
});

export type EnviarMensajeDto = z.infer<typeof enviarMensajeSchema>;
