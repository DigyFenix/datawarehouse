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
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConfigAgente,
  ConjuntoDatos,
  EjecutorSql,
  EventoAuditoria,
  ResultadoAgente,
  TarjetaDato,
} from '@quilate/agente';
import { ejecutarGuardada, leerGlosario, responder } from '@quilate/agente';
import { Pool } from 'pg';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import type { Env } from '../config/env';
import { ControlDbService } from '../db/control-db.service';
import { LectorPoolsService } from '../db/lector-pools.service';
import { ConsultaGuardada, ConsultasGuardadasService } from './consultas-guardadas.service';
import { ConversacionesService } from './conversaciones.service';

/** Turnos de historial que se le dan al modelo como contexto (no todo el hilo). */
const HISTORIAL_MAXIMO = 20;

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
  frescura: { dominio: string; fechaDatoMasReciente: string | null }[];
  ejecutadaEn: string;
}

@Injectable()
export class AgenteService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly sesion: SesionService,
    private readonly conversaciones: ConversacionesService,
    private readonly guardadas: ConsultasGuardadasService,
    private readonly lectorPools: LectorPoolsService,
    private readonly controlDb: ControlDbService,
    private readonly auditoria: AuditoriaPortalService,
  ) {}

  async responderMensaje(
    usuario: UsuarioPortal,
    conversacionId: number,
    contenido: string,
    ip: string | null,
  ): Promise<ResultadoAgente> {
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException('El agente no está configurado');
    }

    const { organizacion, pool } = await this.sesion.contexto(usuario.hash);
    // (a) La conversación debe ser del usuario — 404 genérico si no.
    const conversacion = await this.conversaciones.obtenerPropia(usuario, conversacionId);

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
      fechaActual: fechaLocal(new Date(), this.config.get('ZONA_HORARIA', { infer: true })),
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
    return resultado;
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
  private async leerFrescura(
    pool: Pool,
  ): Promise<{ dominio: string; fechaDatoMasReciente: string | null }[]> {
    const resultado = await pool.query(
      `SELECT dominio, max(fecha_dato_mas_reciente) AS "fechaDatoMasReciente"
         FROM oro.estado_carga
        GROUP BY dominio
        ORDER BY dominio`,
    );
    const filas = resultado.rows as { dominio: string; fechaDatoMasReciente: Date | null }[];
    const zona = this.config.get('ZONA_HORARIA', { infer: true });
    return filas.map((f) => ({
      dominio: f.dominio,
      fechaDatoMasReciente: f.fechaDatoMasReciente ? fechaLocal(f.fechaDatoMasReciente, zona) : null,
    }));
  }
}
