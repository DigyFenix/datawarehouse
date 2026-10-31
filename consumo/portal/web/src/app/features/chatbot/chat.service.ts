/** Cliente del agente de IA gobernado (/t/:hash/agente): conversaciones y consultas guardadas. */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';

export interface Conversacion {
  id: number;
  titulo: string;
  creadaEn: string;
  actualizadaEn: string;
}

/**
 * El dato que sustenta una respuesta. Lo arma el agente desde el catálogo y el
 * resultado SQL — nunca desde el texto del modelo — para que la métrica, el
 * período y el estado de certificación se muestren siempre (CLAUDE.md §11).
 */
export interface TarjetaDato {
  metricaClave: string;
  metricaNombre: string;
  periodo: string;
  valor: number;
  estado: 'certificada' | 'exploratoria';
  empresa?: string;
  unidad?: string;
}

/** Tabla de datos de una respuesta: serie mensual, ranking por dimensión o aging. */
export interface ConjuntoDatos {
  tipo: 'serie' | 'ranking' | 'aging';
  titulo: string;
  metricaClave: string;
  metricaNombre: string;
  estado: 'certificada' | 'exploratoria';
  periodo: string;
  unidad?: string;
  columnas: { clave: string; nombre: string; tipo: 'texto' | 'numero' | 'periodo' }[];
  filas: Record<string, string | number | null>[];
}

/** Especificación reejecutable (tool + params validados) que produjo un conjunto. */
export interface ConsultaEjecutada {
  tool: string;
  params: Record<string, unknown>;
  conjunto: number;
  tituloSugerido: string;
}

export interface DatosMensaje {
  conjuntos: ConjuntoDatos[];
  consultas: ConsultaEjecutada[];
}

export interface MensajeChat {
  id: number;
  rol: 'usuario' | 'asistente';
  contenido: string;
  tarjetas: TarjetaDato[] | null;
  datos: DatosMensaje | null;
  creadoEn: string;
}

export interface RespuestaAgente {
  texto: string;
  tarjetas: TarjetaDato[];
  conjuntos: ConjuntoDatos[];
  consultas: ConsultaEjecutada[];
}

export type VistaConsulta = 'tabla' | 'barras' | 'lineas';

export interface ConsultaGuardada {
  id: number;
  titulo: string;
  descripcion: string | null;
  tool: string;
  params: Record<string, unknown>;
  vista: VistaConsulta;
  metricaClave: string | null;
  versionDefinicion: number | null;
  creadaEn: string;
  actualizadaEn: string;
  ultimaEjecucionEn: string | null;
  /** «Mi tablero»: fijada como widget, su posición y su ancho (1 = media fila, 2 = fila completa). */
  enTablero: boolean;
  tableroOrden: number | null;
  tableroAncho: 1 | 2;
}

export interface ProximaCarga {
  iso: string;
  texto: string;
  minutos: number;
}

export interface EjecucionGuardada {
  consulta: ConsultaGuardada;
  ok: boolean;
  motivo?: string;
  conjunto?: ConjuntoDatos;
  tarjetas: TarjetaDato[];
  avisos: string[];
  frescura: { dominio: string; fechaDatoMasReciente: string | null }[];
  proximaCarga: ProximaCarga | null;
  ejecutadaEn: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);

  conversaciones(): Observable<Conversacion[]> {
    return this.api.get<Conversacion[]>('/agente/conversaciones');
  }

  crear(): Observable<Conversacion> {
    return this.api.post<Conversacion>('/agente/conversaciones', {});
  }

  mensajes(id: number): Observable<MensajeChat[]> {
    return this.api.get<MensajeChat[]>(`/agente/conversaciones/${id}/mensajes`);
  }

  enviar(id: number, contenido: string): Observable<RespuestaAgente> {
    return this.api.post<RespuestaAgente>(`/agente/conversaciones/${id}/mensajes`, { contenido });
  }

  eliminar(id: number): Observable<void> {
    return this.api.delete<void>(`/agente/conversaciones/${id}`);
  }

  // ---- consultas guardadas

  guardadas(): Observable<ConsultaGuardada[]> {
    return this.api.get<ConsultaGuardada[]>('/agente/consultas');
  }

  guardar(c: { titulo: string; descripcion?: string | null; tool: string; params: Record<string, unknown>; vista: VistaConsulta; enTablero?: boolean }): Observable<ConsultaGuardada> {
    return this.api.post<ConsultaGuardada>('/agente/consultas', c);
  }

  ejecutarGuardada(id: number): Observable<EjecucionGuardada> {
    return this.api.get<EjecucionGuardada>(`/agente/consultas/${id}/ejecutar`);
  }

  actualizarGuardada(
    id: number,
    cambios: { titulo?: string; descripcion?: string | null; vista?: VistaConsulta; enTablero?: boolean; tableroAncho?: 1 | 2 },
  ): Observable<ConsultaGuardada> {
    return this.api.patch<ConsultaGuardada>(`/agente/consultas/${id}`, cambios);
  }

  eliminarGuardada(id: number): Observable<void> {
    return this.api.delete<void>(`/agente/consultas/${id}`);
  }

  // ---- mi tablero

  /** Widgets del tablero personal, cada uno reejecutado con datos frescos. */
  tablero(): Observable<EjecucionGuardada[]> {
    return this.api.get<EjecucionGuardada[]>('/agente/tablero');
  }

  ordenarTablero(ids: number[]): Observable<ConsultaGuardada[]> {
    return this.api.put<ConsultaGuardada[]>('/agente/tablero/orden', { ids });
  }
}
