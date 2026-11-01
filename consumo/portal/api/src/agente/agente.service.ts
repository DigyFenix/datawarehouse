/**
 * Cableado del agente de IA (@quilate/agente, CLAUDE.md §11) al portal de usuario.
 * Este servicio NO reimplementa lógica del agente: arma el `EjecutorSql` (RLS vía
 * `portal_lector`), el `ConfigAgente` (empresas/glosario/frescura del tenant) y
 * persiste la conversación. El paquete decide qué tool invocar; este código valida
 * la conversación, resuelve el alcance de empresas y ejecuta.
 *
 * Las CONSULTAS GUARDADAS se reejecutan por la misma vía (mismo ejecutor bajo RLS,
 * mismas guardas del paquete) pero sin pasar por el modelo.
 */
import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AlcanceEfectivo,
  ConfigAgente,
  ConjuntoDatos,
  EjecutorSql,
  EventoAuditoria,
  FrescuraDominio,
  ResultadoAgente,
  ResultadoGuardada,
  TarjetaDato,
} from '@quilate/agente';
import { ejecutarTool, leerGlosario, resolverAlcance, responder, TOOLS_GUARDABLES } from '@quilate/agente';
// [chat: contexto, repetición, acciones sin modelo] — auditoría 2026-10-31 §5.
import type { AccionTool, ContextoConversacion, OpcionAccion, TurnoPrevio } from '@quilate/agente';
import {
  ejecutarAccion,
  normalizarContexto,
  SQL_GUARDAR_CONTEXTO_CONVERSACION,
  SQL_LEER_CONTEXTO_CONVERSACION,
  SQL_TURNOS_CON_CONSULTAS,
  sugerenciasIniciales,
  turnosDesdeFilas,
  validarAccion,
} from '@quilate/agente';
import { Pool } from 'pg';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import type { Env } from '../config/env';
import { ControlDbService } from '../db/control-db.service';
import { ConsultarRls, LectorPoolsService } from '../db/lector-pools.service';
import { ConsultaGuardada, ConsultasGuardadasService } from './consultas-guardadas.service';
import { ConversacionesService } from './conversaciones.service';
import { proximaCarga, type ProximaCarga } from './frescura';
import { SolicitudesService } from './solicitudes.service';
import { UsoIaService } from './uso-ia.service';

/** Turnos de historial que se le dan al modelo como contexto: solo los últimos 3 intercambios.
 *  El chat no es conversacional: basta con lo justo para una aclaración («¿netas o brutas?»). */
const HISTORIAL_MAXIMO = 6;

/** Widgets del tablero que se ejecutan a la vez: cada carril es UNA transacción RLS del lector.
 *  3 deja holgura en el pool (POSTGRES_POOL_MAX) para el chat y las demás pantallas. */
const CONCURRENCIA_TABLERO = 3;

/** 'YYYY-MM-DD' de un instante en la zona horaria del negocio (nunca UTC: a las 18:00 de
 *  Guatemala ya es «mañana» en UTC y «este mes» se corría al siguiente). */
function fechaLocal(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/** Lo que devuelve abrir una consulta guardada: datos frescos + contexto de gobierno. */
export interface EjecucionGuardada {
  consulta: ConsultaGuardada;
  ok: boolean;
  motivo?: string;
  conjunto?: ConjuntoDatos;
  tarjetas: TarjetaDato[];
  /** Avisos que no impiden ver el dato (p. ej. la definición de la métrica cambió de versión). */
  avisos: string[];
  /** Frescura del dato por dominio al momento de ejecutar. */
  frescura: FrescuraDominio[];
  /** Próxima carga programada (si el host conoce el horario). */
  proximaCarga: ProximaCarga | null;
  ejecutadaEn: string;
}

/** Estado de la sesión (conversación): cuántas consultas van y cuántas quedan antes de abrir otra. */
export interface EstadoSesion {
  usados: number;
  limite: number;
  restantes: number;
  /** true cuando conviene mostrar el aviso de «te quedan N». */
  avisar: boolean;
  /** Dominios ya tratados en esta conversación (para sugerir una nueva cuando se mezclan temas). */
  dominios: string[];
}

/** Respuesta del chat: lo del agente más el estado de la sesión y, si aplica, una sugerencia. */
export interface RespuestaChat extends ResultadoAgente {
  sesion: EstadoSesion;
  /** Sugerencia del portal (no del modelo): p. ej. terminar este tema y seguir en una consulta nueva. */
  sugerencia: { tipo: 'cambio_tema' | 'limite_cerca' | 'limite_alcanzado'; texto: string } | null;
}

/** Métrica disponible para el usuario (solo lo que el panel del chat necesita mostrar). */
export interface MetricaDisponible {
  clave: string;
  nombre: string;
  dominio: string;
}

/** Lo que cualquier lectura gobernada del warehouse necesita (chat, guardadas, tablero, descargas). */
export interface ContextoLectura {
  pool: Pool;
  ejecutor: EjecutorSql;
  empresas: Map<string, string>;
  frescura: FrescuraDominio[];
  proximaCarga: ProximaCarga | null;
}

@Injectable()
export class AgenteService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly sesion: SesionService,
    private readonly conversaciones: ConversacionesService,
    private readonly guardadas: ConsultasGuardadasService,
    private readonly solicitudes: SolicitudesService,
    private readonly usoIa: UsoIaService,
    private readonly lectorPools: LectorPoolsService,
    private readonly controlDb: ControlDbService,
    private readonly auditoria: AuditoriaPortalService,
  ) {}

  async responderMensaje(
    usuario: UsuarioPortal,
    conversacionId: number,
    contenido: string,
    ip: string | null,
  ): Promise<RespuestaChat> {
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException('El agente no está configurado');
    }

    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    // (a) La conversación debe ser del usuario — 404 genérico si no.
    const conversacion = await this.conversaciones.obtenerPropia(usuario, conversacionId);

    // (a2) Tope de consultas por conversación: el costo de una sesión queda acotado y el contexto
    // no se arrastra sin fin. Al llegar al tope se pide abrir una consulta nueva (409).
    const antes = await this.estadoSesion(pool, conversacionId);
    if (antes.restantes <= 0) {
      throw new ConflictException(
        `Esta consulta llegó a su tope de ${antes.limite} mensajes. Abre una «Nueva consulta» para seguir: el contexto empieza limpio y tus consultas guardadas se conservan.`,
      );
    }

    // (b) CSV de empresas ANTES de abrir la transacción con RLS (fail-closed si no hay alcance).
    const empresasCsv = await this.resolverEmpresasCsv(pool, usuario.id);

    // (b2) UNA transacción RLS del lector para todo el turno (glosario, alcance y cada tool):
    // BEGIN + set_config una sola vez. Lo que se persiste del turno va DESPUÉS, fuera de ella.
    const resultado = await this.lectorPools.conTransaccion(organizacion.baseDatosDw, empresasCsv, async (consultar) => {
      const ejecutor = this.construirEjecutor(consultar);

      // (c) Contexto del prompt: empresas visibles, glosario y frescura del dato.
      const [empresas, glosario, frescura, historial, memoria] = await Promise.all([
        this.leerEmpresas(pool),
        leerGlosario(ejecutor),
        this.leerFrescura(pool),
        this.conversaciones.historialReciente(pool, conversacionId, HISTORIAL_MAXIMO),
        // [chat] contexto {empresa, período} y preguntas previas con sus consultas (repetición).
        this.leerMemoriaConversacion(pool, conversacionId),
      ]);

      const configAgente: ConfigAgente = {
        apiKey,
        modelo: this.config.get('AGENTE_MODELO', { infer: true }),
        maxIteraciones: this.config.get('AGENTE_MAX_ITERACIONES', { infer: true }),
        maxTokens: this.config.get('AGENTE_MAX_TOKENS', { infer: true }),
        nombreOrganizacion: organizacion.nombre,
        empresas,
        glosario,
        frescura,
        proximaCarga: this.proximaCarga()?.texto ?? null,
        fechaActual: fechaLocal(new Date(), this.config.get('ZONA_HORARIA', { infer: true })),
        soloCertificadas: this.soloCertificadas(),
        modeloCompuerta: this.config.get('AGENTE_MODELO_COMPUERTA', { infer: true }) || null,
        // [chat] moneda: default del paquete (GTQ / «Q») hasta que exista la variable por tenant.
        contexto: memoria.contexto,
      };

      // (e) El loop del agente vive en @quilate/agente; aquí solo se inyectan datos y auditoría.
      return responder({
        ejecutor,
        config: configAgente,
        usuarioId: usuario.id,
        historial,
        turnosPrevios: memoria.turnos,
        mensaje: contenido,
        auditar: (evento: EventoAuditoria) => this.auditar(pool, usuario, evento, String(conversacionId), ip),
      });
    });

    // (f)+(g) Persiste el turno (texto, tarjetas y conjuntos) y actualiza título/fecha.
    await this.conversaciones.registrarTurno(pool, conversacion, contenido, resultado);
    // [chat] memoria corta de la conversación (empresa/período) para el próximo turno.
    await this.guardarContexto(pool, conversacionId, resultado.contexto);
    // (h) Demanda que no se pudo atender: queda para el administrador (nunca bloquea la respuesta).
    await this.solicitudes.registrar(pool, usuario, conversacionId, contenido, resultado.solicitudes);
    // Costo del turno para el administrador (nunca bloquea; el usuario no lo ve).
    await this.usoIa.registrar(pool, usuario, conversacionId, resultado.uso);

    // (i) Estado de la sesión y sugerencias del portal (no del modelo): tope cercano o mezcla de temas.
    // Se deriva del estado leído al inicio + este turno (registrarTurno guarda UN mensaje de
    // usuario): releerlo era una segunda consulta por mensaje con el mismo resultado.
    const dominiosTurno = [...new Set(resultado.conjuntos.map((c) => c.dominio).filter(Boolean))];
    const sesion = this.estadoTrasTurno(antes, dominiosTurno);
    const dominiosPrevios = antes.dominios;
    let sugerencia: RespuestaChat['sugerencia'] = null;
    if (sesion.restantes <= 0) {
      sugerencia = { tipo: 'limite_alcanzado', texto: 'Esta consulta llegó a su tope de mensajes. Para seguir, abre una nueva consulta: empieza limpia y no pierdes nada de lo guardado.' };
    } else if (sesion.avisar) {
      sugerencia = { tipo: 'limite_cerca', texto: `Te quedan ${sesion.restantes} mensajes en esta consulta. Si vas a cambiar de tema, conviene abrir una nueva.` };
    } else if (dominiosTurno.length && dominiosPrevios.length >= 1 && antes.usados >= 2 && dominiosTurno.every((d) => !dominiosPrevios.includes(d))) {
      sugerencia = { tipo: 'cambio_tema', texto: 'Esto ya es otro tema. Para que cada consulta quede ordenada (y barata), te sugiero cerrar esta y seguir en una nueva.' };
    }
    return { ...resultado, sesion, sugerencia };
  }

  // ---------------------------------------------------------------- [chat] acciones sin modelo
  // Bloque aditivo (auditoría 2026-10-31 §5): botones de desambiguación, sugerencias, contexto.

  /**
   * Clic en un botón u opción sugerida: valida (tool, params) con el Zod de la tool, la ejecuta
   * con las mismas guardas y RLS que el chat, SIN modelo, y persiste el turno como uno más
   * (cuenta para el tope de la conversación). El texto del turno del usuario es la etiqueta.
   *
   * @throws BadRequestException acción con tool o parámetros fuera de contrato
   * @throws ConflictException   la conversación llegó a su tope de mensajes
   */
  async responderAccion(
    usuario: UsuarioPortal,
    conversacionId: number,
    accion: AccionTool,
    etiqueta: string,
    ip: string | null,
  ): Promise<RespuestaChat> {
    const v = validarAccion(accion.tool, accion.params);
    if (!v.ok) throw new BadRequestException(v.motivo);
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const conversacion = await this.conversaciones.obtenerPropia(usuario, conversacionId);
    const antes = await this.estadoSesion(pool, conversacionId);
    if (antes.restantes <= 0) {
      throw new ConflictException(
        `Esta consulta llegó a su tope de ${antes.limite} mensajes. Abre una «Nueva consulta» para seguir: el contexto empieza limpio y tus consultas guardadas se conservan.`,
      );
    }
    const [empresasCsv, empresas, frescura, memoria] = await Promise.all([
      this.resolverEmpresasCsv(pool, usuario.id),
      this.leerEmpresas(pool),
      this.leerFrescura(pool),
      this.leerMemoriaConversacion(pool, conversacionId),
    ]);
    const resultado = await this.lectorPools.conTransaccion(organizacion.baseDatosDw, empresasCsv, (consultar) =>
      ejecutarAccion({
        ejecutor: this.construirEjecutor(consultar),
        usuarioId: usuario.id,
        empresas,
        frescura,
        accion: { tool: accion.tool, params: v.params },
        auditar: (evento: EventoAuditoria) => this.auditar(pool, usuario, evento, String(conversacionId), ip),
        soloCertificadas: this.soloCertificadas(),
        fechaActual: fechaLocal(new Date(), this.config.get('ZONA_HORARIA', { infer: true })),
        contexto: memoria.contexto,
      }),
    );
    await this.conversaciones.registrarTurno(pool, conversacion, etiqueta, resultado);
    await this.guardarContexto(pool, conversacionId, resultado.contexto);
    const dominiosTurno = [...new Set(resultado.conjuntos.map((c) => c.dominio).filter(Boolean))];
    return { ...resultado, sesion: this.estadoTrasTurno(antes, dominiosTurno), sugerencia: null };
  }

  /** Sugerencias para el chat vacío, desde el alcance REAL del usuario (son acciones sin modelo). */
  async sugerenciasIniciales(usuario: UsuarioPortal): Promise<OpcionAccion[]> {
    const alcance = await this.conLector(usuario, (ejecutor) =>
      resolverAlcance(ejecutor, usuario.id, { soloCertificadas: this.soloCertificadas() }),
    );
    return sugerenciasIniciales(alcance, fechaLocal(new Date(), this.config.get('ZONA_HORARIA', { infer: true })));
  }

  /**
   * Contexto persistido y preguntas previas con sus consultas. Si la migración 142 aún no está
   * aplicada (columna `contexto` inexistente, 42703) se sigue sin contexto; cualquier otro error
   * se propaga.
   */
  private async leerMemoriaConversacion(
    pool: Pool,
    conversacionId: number,
  ): Promise<{ contexto: ContextoConversacion | null; turnos: TurnoPrevio[] }> {
    const [ctx, turnos] = await Promise.all([
      pool.query(SQL_LEER_CONTEXTO_CONVERSACION, [conversacionId]).then(
        (r) => normalizarContexto((r.rows[0] as { contexto?: unknown } | undefined)?.contexto),
        (error: unknown) => {
          if ((error as { code?: string } | null)?.code === '42703') return null;
          throw error;
        },
      ),
      pool.query(SQL_TURNOS_CON_CONSULTAS, [conversacionId, HISTORIAL_MAXIMO]),
    ]);
    return { contexto: ctx, turnos: turnosDesdeFilas(turnos.rows as Record<string, unknown>[]) };
  }

  /** Guarda el contexto validado; sin la migración 142 (42703) no hace nada. */
  private async guardarContexto(pool: Pool, conversacionId: number, contexto: ContextoConversacion): Promise<void> {
    try {
      await pool.query(SQL_GUARDAR_CONTEXTO_CONVERSACION, [conversacionId, JSON.stringify(normalizarContexto(contexto))]);
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== '42703') throw error;
    }
  }

  /** Consultas usadas y restantes de una conversación, con los dominios ya tratados. */
  async estadoSesion(pool: Pool, conversacionId: number): Promise<EstadoSesion> {
    const limite = this.config.get('AGENTE_MENSAJES_POR_CONVERSACION', { infer: true });
    const umbral = this.config.get('AGENTE_AVISO_RESTANTES', { infer: true });
    const r = await pool.query<{ usados: string; dominios: string[] | null }>(
      `SELECT count(*) FILTER (WHERE rol = 'usuario')::text AS usados,
              array_remove(array_agg(DISTINCT c->>'dominio'), NULL) AS dominios
         FROM portal.chat_mensajes m
         LEFT JOIN LATERAL jsonb_array_elements(COALESCE(m.datos->'conjuntos', '[]'::jsonb)) c ON true
        WHERE m.conversacion_id = $1`,
      [conversacionId],
    );
    const usados = Number(r.rows[0]?.usados ?? 0);
    const restantes = Math.max(0, limite - usados);
    return { usados, limite, restantes, avisar: restantes > 0 && restantes <= umbral, dominios: (r.rows[0]?.dominios ?? []).filter((d) => d !== '') };
  }

  /** Estado tras registrar un turno, derivado del estado previo sin volver a la base. */
  private estadoTrasTurno(antes: EstadoSesion, dominiosTurno: string[]): EstadoSesion {
    const umbral = this.config.get('AGENTE_AVISO_RESTANTES', { infer: true });
    const usados = antes.usados + 1;
    const restantes = Math.max(0, antes.limite - usados);
    return {
      usados,
      limite: antes.limite,
      restantes,
      avisar: restantes > 0 && restantes <= umbral,
      dominios: [...new Set([...antes.dominios, ...dominiosTurno])],
    };
  }

  /** Estado de una conversación del usuario (para pintar el contador al abrirla). */
  async estadoConversacion(usuario: UsuarioPortal, conversacionId: number): Promise<EstadoSesion> {
    const { pool } = await this.sesion.contexto(usuario.hash);
    await this.conversaciones.obtenerPropia(usuario, conversacionId);
    return this.estadoSesion(pool, conversacionId);
  }

  /** Métricas que este usuario puede consultar (nombre y dominio): el panel derecho del chat. */
  async metricasDisponibles(usuario: UsuarioPortal): Promise<MetricaDisponible[]> {
    const alcance = await this.conLector(usuario, (ejecutor) =>
      resolverAlcance(ejecutor, usuario.id, { soloCertificadas: this.soloCertificadas() }),
    );
    return [...alcance.metricas.values()]
      .map((m) => ({ clave: m.clave, nombre: m.nombreOficial, dominio: m.dominio || 'otros' }))
      .sort((a, b) => a.dominio.localeCompare(b.dominio) || a.nombre.localeCompare(b.nombre));
  }

  /**
   * Contexto de lectura gobernada para quien NO pasa por el modelo (tablero personal,
   * descargas): mismo ejecutor bajo RLS, mismas empresas y frescura que el chat.
   */
  async contextoLectura(usuario: UsuarioPortal): Promise<ContextoLectura> {
    // Compatibilidad: el ejecutor de este contexto abre una transacción RLS POR CONSULTA porque
    // vive más allá de esta llamada. Para varias lecturas seguidas usar `conContextoLectura`.
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const empresasCsv = await this.resolverEmpresasCsv(pool, usuario.id);
    const ejecutor = this.construirEjecutor((sql, params) =>
      this.lectorPools.ejecutarConRls(organizacion.baseDatosDw, empresasCsv, async (cliente) => {
        const resultado = await cliente.query(sql, params);
        return resultado.rows as Record<string, unknown>[];
      }),
    );
    const [empresas, frescura] = await Promise.all([this.leerEmpresas(pool), this.leerFrescura(pool)]);
    return { pool, ejecutor, empresas, frescura, proximaCarga: this.proximaCarga() };
  }

  /**
   * Igual que `contextoLectura`, pero todas las lecturas de `fn` comparten UNA transacción RLS
   * del lector (BEGIN + set_config una vez). El ejecutor solo es válido dentro de `fn`.
   */
  async conContextoLectura<T>(usuario: UsuarioPortal, fn: (ctx: ContextoLectura) => Promise<T>): Promise<T> {
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const [empresasCsv, empresas, frescura] = await Promise.all([
      this.resolverEmpresasCsv(pool, usuario.id),
      this.leerEmpresas(pool),
      this.leerFrescura(pool),
    ]);
    return this.lectorPools.conTransaccion(organizacion.baseDatosDw, empresasCsv, (consultar) =>
      fn({ pool, ejecutor: this.construirEjecutor(consultar), empresas, frescura, proximaCarga: this.proximaCarga() }),
    );
  }

  /**
   * Dominio de cada métrica (metrica_clave → dominio) leído de `oro.metrica_valor` por la vía
   * gobernada: rol `portal_lector` bajo el RLS del usuario. Para que Administración deje de leer
   * Oro con el rol del portal. Con alcance de empresas acotado, una métrica sin filas en esas
   * empresas no aparece (el RLS manda; el llamador la agrupa en «otros»).
   */
  async dominiosDeMetricas(usuario: UsuarioPortal): Promise<Map<string, string>> {
    const filas = await this.conLector(usuario, (_ejecutor, consultar) =>
      consultar(`SELECT DISTINCT metrica_clave, dominio FROM oro.metrica_valor`, []),
    );
    return new Map(filas.map((f) => [String(f['metrica_clave']), String(f['dominio'] ?? '')]));
  }

  /** Abre la transacción RLS del lector para el usuario y le pasa ejecutor y `consultar`. */
  private async conLector<T>(
    usuario: UsuarioPortal,
    fn: (ejecutor: EjecutorSql, consultar: ConsultarRls) => Promise<T>,
  ): Promise<T> {
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const empresasCsv = await this.resolverEmpresasCsv(pool, usuario.id);
    return this.lectorPools.conTransaccion(organizacion.baseDatosDw, empresasCsv, (consultar) =>
      fn(this.construirEjecutor(consultar), consultar),
    );
  }

  /** Configuración del tenant-host: solo métricas certificadas en toda lectura gobernada. */
  soloCertificadas(): boolean {
    return this.config.get('AGENTE_SOLO_CERTIFICADAS', { infer: true });
  }

  /** Próxima carga programada según HORAS_CARGA, en la zona del negocio (null si no hay horario). */
  proximaCarga(): ProximaCarga | null {
    return proximaCarga(this.config.get('HORAS_CARGA', { infer: true }), this.config.get('ZONA_HORARIA', { infer: true }));
  }

  /** Registra en la auditoría del tenant un evento producido fuera del chat (tablero, descargas). */
  auditarEvento(pool: Pool, usuario: UsuarioPortal, evento: EventoAuditoria, entidadId: string, ip: string | null): Promise<void> {
    return this.auditar(pool, usuario, evento, entidadId, ip);
  }

  /**
   * Abre una consulta guardada: la reejecuta con datos frescos bajo el alcance de QUIEN
   * la abre. No pasa por el modelo (no gasta tokens ni puede desviarse): es la misma tool
   * con los mismos parámetros, validados otra vez.
   */
  async ejecutarGuardada(usuario: UsuarioPortal, id: number, ip: string | null): Promise<EjecucionGuardada> {
    const consulta = await this.guardadas.obtenerPropia(usuario, id);
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const [empresasCsv, empresas, frescura, versiones] = await Promise.all([
      this.resolverEmpresasCsv(pool, usuario.id),
      this.leerEmpresas(pool),
      this.leerFrescura(pool),
      this.guardadas.versionesDefinicion(consulta.metricaClave ? [consulta.metricaClave] : []),
    ]);

    // Alcance y tool en UNA transacción RLS del lector.
    const r = await this.lectorPools.conTransaccion(organizacion.baseDatosDw, empresasCsv, async (consultar) => {
      const ejecutor = this.construirEjecutor(consultar);
      const alcance = await resolverAlcance(ejecutor, usuario.id, { soloCertificadas: this.soloCertificadas() });
      return this.ejecutarEspecificacion(consulta, { ejecutor, alcance, empresas, frescura /* [chat] corte */ }, pool, usuario, ip);
    });

    // Una sesión suplantada (soporte) ve el dato pero no deja huella como si fuera el usuario.
    if (r.ok && !usuario.impersonadoPor) await this.guardadas.marcarEjecutada(usuario, id);
    return this.armarEjecucion(consulta, r, versiones, frescura);
  }

  /**
   * «Mi tablero»: reejecuta, en orden, todas las consultas que el usuario fijó al tablero.
   * Cada widget pasa por las mismas guardas que una guardada abierta a mano; una que ya no
   * se pueda ejecutar se devuelve con su motivo, sin tumbar el resto del tablero.
   *
   * Rendimiento: el alcance se resuelve UNA vez (no una por widget) y los widgets corren en
   * CONCURRENCIA_TABLERO carriles; cada carril es una sola transacción RLS del lector.
   */
  async ejecutarTablero(usuario: UsuarioPortal, ip: string | null): Promise<EjecucionGuardada[]> {
    const consultas = await this.guardadas.listarTablero(usuario);
    if (consultas.length === 0) return [];
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const [empresasCsv, empresas, frescura, versiones] = await Promise.all([
      this.resolverEmpresasCsv(pool, usuario.id),
      this.leerEmpresas(pool),
      this.leerFrescura(pool),
      this.guardadas.versionesDefinicion(consultas.map((c) => c.metricaClave).filter((c): c is string => !!c)),
    ]);
    const baseDatos = organizacion.baseDatosDw;
    const alcance = await this.lectorPools.conTransaccion(baseDatos, empresasCsv, (consultar) =>
      resolverAlcance(this.construirEjecutor(consultar), usuario.id, { soloCertificadas: this.soloCertificadas() }),
    );

    const salida: (EjecucionGuardada | undefined)[] = new Array<EjecucionGuardada | undefined>(consultas.length).fill(undefined);
    const fallida = (c: ConsultaGuardada, error: unknown): EjecucionGuardada => ({
      consulta: c,
      ok: false,
      motivo: error instanceof Error ? error.message : 'No se pudo ejecutar la consulta.',
      tarjetas: [],
      avisos: [],
      frescura: [],
      proximaCarga: null,
      ejecutadaEn: new Date().toISOString(),
    });
    let siguiente = 0;
    const carril = (): Promise<void> =>
      this.lectorPools.conTransaccion(baseDatos, empresasCsv, async (consultar) => {
        const ctxTool = { ejecutor: this.construirEjecutor(consultar), alcance, empresas, frescura /* [chat] corte */ };
        while (siguiente < consultas.length) {
          const i = siguiente++;
          const c = consultas[i];
          if (!c) continue;
          try {
            const r = await this.ejecutarEspecificacion(c, ctxTool, pool, usuario, ip);
            salida[i] = this.armarEjecucion(c, r, versiones, frescura);
          } catch (error) {
            salida[i] = fallida(c, error);
          }
        }
      });
    const carriles = await Promise.allSettled(
      Array.from({ length: Math.min(CONCURRENCIA_TABLERO, consultas.length) }, () => carril()),
    );
    // Si un carril no pudo abrir su transacción, sus widgets pendientes salen con el motivo.
    const errorCarril = carriles.find((c): c is PromiseRejectedResult => c.status === 'rejected')?.reason as unknown;
    const resultado = consultas.map((c, i) => salida[i] ?? fallida(c, errorCarril ?? new Error('No se pudo ejecutar la consulta.')));

    if (!usuario.impersonadoPor) {
      await this.guardadas.marcarEjecutadas(usuario, resultado.filter((e) => e.ok).map((e) => e.consulta.id));
    }
    return resultado;
  }

  /**
   * Reejecuta una especificación guardada con un alcance YA resuelto. Mismo contrato que
   * `ejecutarGuardada` de @quilate/agente (tools guardables, guardas de la tool, auditoría con
   * origen 'consulta_guardada'), sin volver a resolver el alcance en cada widget.
   */
  private async ejecutarEspecificacion(
    consulta: ConsultaGuardada,
    ctxTool: { ejecutor: EjecutorSql; alcance: AlcanceEfectivo; empresas: Map<string, string>; frescura?: FrescuraDominio[] },
    pool: Pool,
    usuario: UsuarioPortal,
    ip: string | null,
  ): Promise<ResultadoGuardada> {
    if (!(TOOLS_GUARDABLES as readonly string[]).includes(consulta.tool)) {
      return { ok: false, motivo: `La consulta guardada usa una herramienta que no se puede reejecutar (${consulta.tool}).`, tarjetas: [] };
    }
    const resultado = await ejecutarTool(consulta.tool, consulta.params, ctxTool);
    await this.auditar(
      pool,
      usuario,
      { ...resultado.auditoria, detalle: { ...resultado.auditoria.detalle, origen: 'consulta_guardada' } },
      `guardada:${consulta.id}`,
      ip,
    );
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

  /** Respuesta de una guardada: dato + avisos de versión + frescura. */
  private armarEjecucion(
    consulta: ConsultaGuardada,
    r: ResultadoGuardada,
    versiones: Map<string, number>,
    frescura: FrescuraDominio[],
  ): EjecucionGuardada {
    const avisos: string[] = [];
    if (consulta.metricaClave && consulta.versionDefinicion !== null) {
      const vigente = versiones.get(consulta.metricaClave) ?? null;
      if (vigente !== null && vigente !== consulta.versionDefinicion) {
        avisos.push(
          `La definición de la métrica cambió desde que guardaste esta consulta (versión ${consulta.versionDefinicion} → ${vigente}). El dato se calcula con la definición vigente.`,
        );
      }
    }
    return {
      consulta,
      ok: r.ok,
      motivo: r.motivo,
      conjunto: r.conjunto,
      tarjetas: r.tarjetas,
      avisos,
      frescura,
      proximaCarga: this.proximaCarga(),
      ejecutadaEn: new Date().toISOString(),
    };
  }

  private auditar(pool: Pool, usuario: UsuarioPortal, evento: EventoAuditoria, entidadId: string, ip: string | null) {
    return this.auditoria.registrar(pool, {
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      accion: evento.accion,
      entidad: 'agente',
      entidadId,
      despues: usuario.impersonadoPor ? { ...evento.detalle, impersonado_por: usuario.impersonadoPor } : evento.detalle,
      ip,
    });
  }

  /**
   * CSV de empresas del alcance EFECTIVO del usuario (portal.perfil_alcances,
   * recurso_tipo = 'empresa'). Se calcula con el pool NORMAL del tenant —no
   * `portal_lector`— porque se necesita ANTES de abrir la transacción con RLS.
   * '*' si algún alcance es universal; CSV de ids si son explícitos; '' (fail-closed,
   * cero filas) si el usuario no tiene ningún alcance de empresa.
   */
  private async resolverEmpresasCsv(pool: Pool, usuarioId: number): Promise<string> {
    const resultado = await pool.query(
      `SELECT pa.recurso_clave AS "recursoClave"
         FROM portal.perfil_alcances pa
         JOIN portal.perfiles p         ON p.id = pa.perfil_id AND p.activo
         JOIN portal.usuario_perfiles up ON up.perfil_id = pa.perfil_id
        WHERE up.usuario_id = $1 AND pa.recurso_tipo = 'empresa'`,
      [usuarioId],
    );
    const claves = (resultado.rows as { recursoClave: string }[]).map((f) => f.recursoClave);
    if (claves.some((c) => c === '*')) return '*';
    // `empresa_id` es texto (clave de sociedad del ERP), no un entero: se filtra por
    // el mismo alfabeto que valida el catálogo para que la coma del CSV siga siendo
    // separador y no pueda venir en el valor.
    return claves.filter((c) => /^[a-z0-9_]+$/.test(c)).join(',');
  }

  /**
   * Ejecutor inyectado al paquete: tenant bajo RLS (portal_lector) por `consultar` —normalmente
   * la transacción única de `LectorPoolsService.conTransaccion`—, control de solo lectura.
   */
  private construirEjecutor(consultar: ConsultarRls): EjecutorSql {
    return {
      consultarTenant: consultar,
      consultarControl: (sql, params) => this.controlDb.query(sql, params),
    };
  }

  /** empresa_id → nombre visible (oro.dim_organizacion), con el pool NORMAL del tenant. */
  private async leerEmpresas(pool: Pool): Promise<Map<string, string>> {
    // `empresa_id` (texto) es la clave de negocio con la que se filtran los hechos;
    // `organizacion_clave` es la surrogate key de la dimensión y NO cruza con ellos.
    // El miembro por defecto de la dimensión («No definido», empresa_id GLOBAL) no es una
    // sociedad: no se le ofrece al modelo ni se nombra en las respuestas. Los hechos que
    // cayeran ahí siguen entrando cuando el alcance es '*' (el RLS los permite), pero no
    // como «empresa» que el usuario pueda elegir.
    const resultado = await pool.query(
      `SELECT empresa_id AS id, nombre
         FROM oro.dim_organizacion
        WHERE es_vigente AND empresa_id IS NOT NULL
          AND empresa_id <> 'GLOBAL' AND nombre <> 'No definido'`,
    );
    const filas = resultado.rows as { id: string; nombre: string }[];
    return new Map(filas.map((f) => [String(f.id), f.nombre]));
  }

  /** Frescura por dominio (oro.estado_carga), agregada a través de las empresas del tenant. */
  private async leerFrescura(pool: Pool): Promise<FrescuraDominio[]> {
    const resultado = await pool.query(
      // La fecha del dato es un DATE: se trae como texto. Convertirla a Date la dejaba en
      // medianoche UTC y, al formatearla en la zona del negocio, retrocedía un día (el chat
      // decía «corte 29» cuando el warehouse tenía el 30).
      `SELECT dominio,
              max(fecha_dato_mas_reciente)::text AS "fechaDatoMasReciente",
              max(ultima_extraccion)             AS "ultimaExtraccion"
         FROM oro.estado_carga
        GROUP BY dominio
        ORDER BY dominio`,
    );
    const filas = resultado.rows as { dominio: string; fechaDatoMasReciente: string | null; ultimaExtraccion: Date | null }[];
    return filas.map((f) => ({
      dominio: f.dominio,
      fechaDatoMasReciente: f.fechaDatoMasReciente,
      ultimaExtraccion: f.ultimaExtraccion ? f.ultimaExtraccion.toISOString() : null,
    }));
  }
}
