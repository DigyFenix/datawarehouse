/**
 * Reejecución de una CONSULTA GUARDADA sin pasar por el modelo.
 *
 * Lo que se guarda es la especificación (tool + parámetros validados), nunca el
 * resultado: al abrirla otro día se vuelve a ejecutar con los datos frescos, con las
 * MISMAS guardas de siempre (Zod, catálogo, alcance, RLS) y con el alcance de QUIEN la
 * abre. Si la métrica dejó de ser consumible (deprecada, de vuelta a borrador, fuera
 * de la autorización), la consulta no se ejecuta y se explica por qué.
 */
import { resolverAlcance } from './alcances';
import { ejecutarTool } from './tools/ejecutar';
import { esquemaConsultarAging, esquemaConsultarMetrica, esquemaConsultarPorDimension } from './tools/esquemas';
import type { ConjuntoDatos, EjecutorSql, EventoAuditoria, TarjetaDato } from './tipos';

/** Tools cuyo resultado tiene forma de datos y por tanto tiene sentido guardar. */
export const TOOLS_GUARDABLES = ['consultar_metrica', 'consultar_aging', 'consultar_metrica_por_dimension'] as const;

/**
 * Valida una especificación ANTES de guardarla, con el mismo esquema Zod estricto que
 * usa la tool al ejecutarse. Devuelve los parámetros normalizados (defaults aplicados)
 * o el motivo del rechazo. No toca la base ni el catálogo: eso ocurre al ejecutar.
 */
export function validarEspecificacion(
  tool: string,
  params: unknown,
): { ok: true; params: Record<string, unknown> } | { ok: false; motivo: string } {
  const esquema =
    tool === 'consultar_metrica'
      ? esquemaConsultarMetrica
      : tool === 'consultar_aging'
        ? esquemaConsultarAging
        : tool === 'consultar_metrica_por_dimension'
          ? esquemaConsultarPorDimension
          : null;
  if (!esquema) return { ok: false, motivo: `Herramienta no guardable: ${tool}` };
  const r = esquema.safeParse(params);
  if (!r.success) {
    return { ok: false, motivo: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ') };
  }
  return { ok: true, params: r.data as Record<string, unknown> };
}

export interface EntradaGuardada {
  ejecutor: EjecutorSql;
  usuarioId: number;
  /** empresa_id → nombre visible (universo del tenant, igual que en ConfigAgente). */
  empresas: Map<string, string>;
  tool: string;
  params: Record<string, unknown>;
  auditar: (evento: EventoAuditoria) => Promise<void>;
  /** Misma configuración que el chat: solo certificadas. */
  soloCertificadas?: boolean;
}

export interface ResultadoGuardada {
  ok: boolean;
  /** Motivo legible cuando ok = false (métrica no disponible, parámetros inválidos…). */
  motivo?: string;
  conjunto?: ConjuntoDatos;
  tarjetas: TarjetaDato[];
}

export async function ejecutarGuardada(entrada: EntradaGuardada): Promise<ResultadoGuardada> {
  const { ejecutor, usuarioId, empresas, tool, params, auditar, soloCertificadas } = entrada;
  if (!(TOOLS_GUARDABLES as readonly string[]).includes(tool)) {
    return { ok: false, motivo: `La consulta guardada usa una herramienta que no se puede reejecutar (${tool}).`, tarjetas: [] };
  }
  const alcance = await resolverAlcance(ejecutor, usuarioId, { soloCertificadas });
  const resultado = await ejecutarTool(tool, params, { ejecutor, alcance, empresas });
  await auditar({ ...resultado.auditoria, detalle: { ...resultado.auditoria.detalle, origen: 'consulta_guardada' } });
  if (resultado.esError || !resultado.conjunto) {
    let motivo = 'La consulta no se pudo ejecutar.';
    try {
      const cuerpo = JSON.parse(resultado.contenido) as { error?: string };
      if (cuerpo.error) motivo = cuerpo.error;
    } catch {
      // el contenido no era JSON: se deja el motivo genérico
    }
    return { ok: false, motivo, tarjetas: [] };
  }
  return { ok: true, conjunto: resultado.conjunto, tarjetas: resultado.tarjetas };
}
