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
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConfigAgente,
  ConjuntoDatos,
  EjecutorSql,
  EventoAuditoria,
  FrescuraDominio,
  ResultadoAgente,
  TarjetaDato,
} from '@quilate/agente';
import { ejecutarGuardada, leerGlosario, resolverAlcance, responder } from '@quilate/agente';
import { Pool } from 'pg';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import type { Env } from '../config/env';
import { ControlDbService } from '../db/control-db.service';
import { LectorPoolsService } from '../db/lector-pools.service';
import { ConsultaGuardada, ConsultasGuardadasService } from './consultas-guardadas.service';
import { ConversacionesService } from './conversaciones.service';
import { proximaCarga, type ProximaCarga } from './frescura';
import { SolicitudesService } from './solicitudes.service';

/** Turnos de historial que se le dan al modelo como contexto: solo los últimos 3 intercambios.
 *  El chat no es conversacional: basta con lo justo para una aclaración («¿netas o brutas?»). */
const HISTORIAL_MAXIMO = 6;

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
    const ejecutor = this.construirEjecutor(organizacion.baseDatosDw, empresasCsv);

    // (c) Contexto del prompt: empresas visibles, glosario y frescura del dato.
    const [empresas, glosario, frescura, historial] = await Promise.all([
      this.leerEmpresas(pool),
      leerGlosario(ejecutor),
      this.leerFrescura(pool),
      this.conversaciones.historialReciente(pool, conversacionId, HISTORIAL_MAXIMO),
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
    };

    // (e) El loop del agente vive en @quilate/agente; aquí solo se inyectan datos y auditoría.
    const resultado = await responder({
      ejecutor,
      config: configAgente,
      usuarioId: usuario.id,
      historial,
      mensaje: contenido,
      auditar: (evento: EventoAuditoria) => this.auditar(pool, usuario, evento, String(conversacionId), ip),
    });

    // (f)+(g) Persiste el turno (texto, tarjetas y conjuntos) y actualiza título/fecha.
    await this.conversaciones.registrarTurno(pool, conversacion, contenido, resultado);
    // (h) Demanda que no se pudo atender: queda para el administrador (nunca bloquea la respuesta).
    await this.solicitudes.registrar(pool, usuario, conversacionId, contenido, resultado.solicitudes);

    // (i) Estado de la sesión y sugerencias del portal (no del modelo): tope cercano o mezcla de temas.
    const sesion = await this.estadoSesion(pool, conversacionId);
    const dominiosTurno = [...new Set(resultado.conjuntos.map((c) => c.dominio).filter(Boolean))];
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

  /** Estado de una conversación del usuario (para pintar el contador al abrirla). */
  async estadoConversacion(usuario: UsuarioPortal, conversacionId: number): Promise<EstadoSesion> {
    const { pool } = await this.sesion.contexto(usuario.hash);
    await this.conversaciones.obtenerPropia(usuario, conversacionId);
    return this.estadoSesion(pool, conversacionId);
  }

  /** Métricas que este usuario puede consultar (nombre y dominio): el panel derecho del chat. */
  async metricasDisponibles(usuario: UsuarioPortal): Promise<MetricaDisponible[]> {
    const ctx = await this.contextoLectura(usuario);
    const alcance = await resolverAlcance(ctx.ejecutor, usuario.id, { soloCertificadas: this.soloCertificadas() });
    return [...alcance.metricas.values()]
      .map((m) => ({ clave: m.clave, nombre: m.nombreOficial, dominio: m.dominio || 'otros' }))
      .sort((a, b) => a.dominio.localeCompare(b.dominio) || a.nombre.localeCompare(b.nombre));
  }

  /**
   * Contexto de lectura gobernada para quien NO pasa por el modelo (tablero personal,
   * descargas): mismo ejecutor bajo RLS, mismas empresas y frescura que el chat.
   */
  async contextoLectura(usuario: UsuarioPortal): Promise<ContextoLectura> {
    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    const empresasCsv = await this.resolverEmpresasCsv(pool, usuario.id);
    const ejecutor = this.construirEjecutor(organizacion.baseDatosDw, empresasCsv);
    const [empresas, frescura] = await Promise.all([this.leerEmpresas(pool), this.leerFrescura(pool)]);
    return { pool, ejecutor, empresas, frescura, proximaCarga: this.proximaCarga() };
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
    const empresasCsv = await this.resolverEmpresasCsv(pool, usuario.id);
    const ejecutor = this.construirEjecutor(organizacion.baseDatosDw, empresasCsv);
    const [empresas, frescura] = await Promise.all([this.leerEmpresas(pool), this.leerFrescura(pool)]);

    const r = await ejecutarGuardada({
      ejecutor,
      usuarioId: usuario.id,
      empresas,
      tool: consulta.tool,
      params: consulta.params,
      auditar: (evento: EventoAuditoria) => this.auditar(pool, usuario, evento, `guardada:${id}`, ip),
      soloCertificadas: this.soloCertificadas(),
    });

    const avisos: string[] = [];
    if (consulta.metricaClave && consulta.versionDefinicion !== null) {
      const vigente = await this.guardadas.versionDefinicion(consulta.metricaClave);
      if (vigente !== null && vigente !== consulta.versionDefinicion) {
        avisos.push(
          `La definición de la métrica cambió desde que guardaste esta consulta (versión ${consulta.versionDefinicion} → ${vigente}). El dato se calcula con la definición vigente.`,
        );
      }
    }
    // Una sesión suplantada (soporte) ve el dato pero no deja huella como si fuera el usuario.
    if (r.ok && !usuario.impersonadoPor) await this.guardadas.marcarEjecutada(usuario, id);

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

  /**
   * «Mi tablero»: reejecuta, en orden, todas las consultas que el usuario fijó al tablero.
   * Cada widget pasa por las mismas guardas que una guardada abierta a mano; una que ya no
   * se pueda ejecutar se devuelve con su motivo, sin tumbar el resto del tablero.
   */
  async ejecutarTablero(usuario: UsuarioPortal, ip: string | null): Promise<EjecucionGuardada[]> {
    const consultas = await this.guardadas.listarTablero(usuario);
    const salida: EjecucionGuardada[] = [];
    for (const c of consultas) {
      try {
        salida.push(await this.ejecutarGuardada(usuario, c.id, ip));
      } catch (error) {
        salida.push({
          consulta: c,
          ok: false,
          motivo: error instanceof Error ? error.message : 'No se pudo ejecutar la consulta.',
          tarjetas: [],
          avisos: [],
          frescura: [],
          proximaCarga: null,
          ejecutadaEn: new Date().toISOString(),
        });
      }
    }
    return salida;
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

  /** Ejecutor inyectado al paquete: tenant bajo RLS (portal_lector), control de solo lectura. */
  private construirEjecutor(baseDatosDw: string, empresasCsv: string): EjecutorSql {
    return {
      consultarTenant: (sql, params) =>
        this.lectorPools.ejecutarConRls(baseDatosDw, empresasCsv, async (cliente) => {
          const resultado = await cliente.query(sql, params);
          return resultado.rows;
        }),
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
