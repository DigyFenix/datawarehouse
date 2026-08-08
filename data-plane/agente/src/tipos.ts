/**
 * Contratos del agente gobernado. El paquete NO conoce NestJS ni pg: recibe
 * ejecutores de consulta inyectados y devuelve resultados tipados. Así las
 * guardas se prueban sin base de datos y el paquete puede montarse en otro
 * host (API del portal hoy; CLI o microservicio mañana) sin tocar la lógica.
 */

/** Ejecutor de SQL PARAMETRIZADO. La implementación real (API del portal) corre cada
 *  consulta del warehouse en una transacción con `set_config('app.empresas', ..., true)`
 *  sobre el pool del rol `portal_lector` (RLS). El agente jamás concatena SQL. */
export interface EjecutorSql {
  /** Consulta al warehouse del tenant (esquema oro), BAJO el contexto RLS del usuario. */
  consultarTenant(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  /** Consulta a la BD de control (catálogo de metadatos, glosario). Solo lectura. */
  consultarControl(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
}

/** Alcance EFECTIVO del usuario, resuelto por request (perfil_alcances ∩ catálogo). */
export interface AlcanceEfectivo {
  /** Claves de métrica consultables (ya intersectadas con estado certificada/exploratoria). */
  metricas: Map<string, MetricaAutorizada>;
  /** Empresas visibles: lista de empresa_id, o '*' = todas. FAIL-CLOSED: vacía = ninguna. */
  empresas: '*' | number[];
}

export interface MetricaAutorizada {
  clave: string;
  nombreOficial: string;
  definicionNegocio: string;
  dominio: string;
  estado: 'certificada' | 'exploratoria';
  /** Rango de períodos con datos ('YYYY-MM'), para que el prompt ancle las fechas. */
  periodoDesde: string | null;
  periodoHasta: string | null;
}

/** Tarjeta de dato: la guarda 5 POR CONSTRUCCIÓN — dato + métrica + período + estado
 *  salen del catálogo y del resultado SQL, nunca del texto del LLM. */
export interface TarjetaDato {
  metricaClave: string;
  metricaNombre: string;
  periodo: string;
  valor: number;
  estado: 'certificada' | 'exploratoria';
  empresa?: string;
  unidad?: string;
}

export interface MensajeHistorial {
  rol: 'usuario' | 'asistente';
  contenido: string;
}

export interface ResultadoAgente {
  texto: string;
  tarjetas: TarjetaDato[];
}

/** Evento de auditoría que el host persiste (portal.auditoria del tenant). */
export interface EventoAuditoria {
  accion: 'consulta_agente' | 'consulta_agente_denegada';
  detalle: Record<string, unknown>;
}

export interface ConfigAgente {
  apiKey: string;
  modelo: string;
  maxIteraciones: number;
  maxTokens: number;
  /** Contexto de frescura y empresas para el system prompt. */
  nombreOrganizacion: string;
  /** empresa_id → nombre visible (de dim_organizacion), para el prompt y las tarjetas. */
  empresas: Map<number, string>;
  /** Glosario término → definición (global + del tenant). */
  glosario: { termino: string; definicion: string; equivaleA: string | null }[];
  /** Frescura por dominio (oro.estado_carga), para que el agente cite el corte del dato. */
  frescura: { dominio: string; fechaDatoMasReciente: string | null }[];
  fechaActual: string;
}
