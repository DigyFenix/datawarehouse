/** Contrato de respuesta estándar de la API: { success, data, error }. */
export interface RespuestaOk<T> {
  success: true;
  data: T;
  error: null;
}

export interface RespuestaError {
  success: false;
  data: null;
  error: {
    codigo: string;
    mensaje: string;
    detalles?: unknown;
  };
}

export type Respuesta<T> = RespuestaOk<T> | RespuestaError;

export function ok<T>(data: T): RespuestaOk<T> {
  return { success: true, data, error: null };
}
