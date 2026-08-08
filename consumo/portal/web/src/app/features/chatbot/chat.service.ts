/** Cliente del agente de IA gobernado (/t/:hash/agente). */
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

export interface MensajeChat {
  id: number;
  rol: 'usuario' | 'asistente';
  contenido: string;
  tarjetas: TarjetaDato[] | null;
  creadoEn: string;
}

export interface RespuestaAgente {
  texto: string;
  tarjetas: TarjetaDato[];
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
}
