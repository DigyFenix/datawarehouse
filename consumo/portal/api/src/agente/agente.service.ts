/**
 * Cableado del agente de IA (@quilate/agente, CLAUDE.md §11) al portal de usuario.
 * Este servicio NO reimplementa lógica del agente: arma el `EjecutorSql` (RLS vía
 * `portal_lector`), el `ConfigAgente` (empresas/glosario/frescura del tenant) y
 * persiste la conversación. El paquete decide qué tool invocar; este código valida
 * la conversación, resuelve el alcance de empresas y ejecuta.
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigAgente, EjecutorSql, EventoAuditoria, ResultadoAgente } from '@quilate/agente';
import { leerGlosario, responder } from '@quilate/agente';
import { Pool } from 'pg';

import { AuditoriaPortalService } from '../auditoria/auditoria-portal.service';
import { SesionService } from '../auth/sesion.service';
import { UsuarioPortal } from '../auth/tipos';
import type { Env } from '../config/env';
import { ControlDbService } from '../db/control-db.service';
import { LectorPoolsService } from '../db/lector-pools.service';
import { ConversacionesService } from './conversaciones.service';

/** Turnos de historial que se le dan al modelo como contexto (no todo el hilo). */
const HISTORIAL_MAXIMO = 20;

@Injectable()
export class AgenteService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly sesion: SesionService,
    private readonly conversaciones: ConversacionesService,
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
      fechaActual: new Date().toISOString().slice(0, 10),
    };

    // (e) El loop del agente vive en @quilate/agente; aquí solo se inyectan datos y auditoría.
    const resultado = await responder({
      ejecutor,
      config: configAgente,
      usuarioId: usuario.id,
      historial,
      mensaje: contenido,
      auditar: (evento: EventoAuditoria) =>
        this.auditoria.registrar(pool, {
          usuarioId: usuario.id,
          usuarioEmail: usuario.email,
          accion: evento.accion,
          entidad: 'agente',
          entidadId: String(conversacionId),
          despues: evento.detalle,
          ip,
        }),
    });

    // (f)+(g) Persiste el turno y actualiza título/fecha de la conversación.
    await this.conversaciones.registrarTurno(pool, conversacion, contenido, resultado);
    return resultado;
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
    const resultado = await pool.query(
      `SELECT empresa_id AS id, nombre
         FROM oro.dim_organizacion
        WHERE es_vigente AND empresa_id IS NOT NULL`,
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
    return filas.map((f) => ({
      dominio: f.dominio,
      fechaDatoMasReciente: f.fechaDatoMasReciente
        ? f.fechaDatoMasReciente.toISOString().slice(0, 10)
        : null,
    }));
  }
}
