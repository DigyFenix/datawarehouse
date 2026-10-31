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
  /** Empresas visibles: lista de `empresa_id`, o '*' = todas. FAIL-CLOSED: vacía = ninguna.
   *  `empresa_id` es TEXTO en todo el modelo Oro (la clave de sociedad del ERP:
   *  `proavisa`, `ironnetwork`…), no un entero. */
  empresas: '*' | string[];
  /** Indicadores compuestos por la organización, por clave. Vacío si no definió ninguno. */
  derivadas: Map<string, import('./derivadas').MetricaDerivada>;
  /** Dimensiones por las que cada métrica autorizada se puede desglosar (oro.metrica_valor_dimension). */
  desglosables: Map<string, string[]>;
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

/**
 * Conjunto de datos tabular que sustenta una respuesta (serie mensual, ranking por
 * dimensión o aging). Igual que la tarjeta, se arma del catálogo y del SQL, nunca
 * del texto del modelo. La UI lo pinta como tabla o gráfica y lo exporta a CSV.
 */
export interface ConjuntoDatos {
  /** serie = (período[, empresa], valor) · ranking = (miembro, valor) · aging = (rango|socio, saldo, partidas). */
  tipo: 'serie' | 'ranking' | 'aging';
  titulo: string;
  metricaClave: string;
  metricaNombre: string;
  estado: 'certificada' | 'exploratoria';
  /** Período o rango consultado, legible ('2026-01 a 2026-10', 'corte 2026-10-30'). */
  periodo: string;
  unidad?: string;
  columnas: { clave: string; nombre: string; tipo: 'texto' | 'numero' | 'periodo' }[];
  filas: Record<string, string | number | null>[];
}

/**
 * Especificación de una consulta ejecutada con éxito: la tool y sus parámetros YA
 * validados. Es lo que se guarda para volver a ejecutarla otro día con datos frescos
 * (nunca se guarda el resultado): la reejecución pasa por las mismas guardas y por el
 * alcance de QUIEN la abre, no de quien la guardó.
 */
export interface ConsultaEjecutada {
  tool: string;
  params: Record<string, unknown>;
  /** Índice del conjunto que produjo (en `ResultadoAgente.conjuntos`). */
  conjunto: number;
  tituloSugerido: string;
}

export interface ResultadoAgente {
  texto: string;
  tarjetas: TarjetaDato[];
  conjuntos: ConjuntoDatos[];
  consultas: ConsultaEjecutada[];
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
  empresas: Map<string, string>;
  /** Glosario término → definición (global + del tenant). */
  glosario: { termino: string; definicion: string; equivaleA: string | null }[];
  /** Frescura por dominio (oro.estado_carga), para que el agente cite el corte del dato. */
  frescura: { dominio: string; fechaDatoMasReciente: string | null }[];
  fechaActual: string;
}
