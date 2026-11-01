/**
 * @quilate/agente — agente de IA gobernado (CLAUDE.md §11).
 *
 * Paquete de DOMINIO: no conoce NestJS ni pg. El host (API del portal de
 * usuario) inyecta el ejecutor de SQL y persiste la auditoría; aquí viven las
 * tools tipadas, las guardas y el loop.
 */
export { responder, acotarTexto, LARGO_MAXIMO_RESPUESTA } from './agente';
export type { EntradaAgente } from './agente';
export { resolverAlcance, empresasParaConsulta } from './alcances';
export type { OpcionesAlcance } from './alcances';
export { fichaDeMetrica, leerGlosario } from './catalogo';
export type { FichaMetrica, TerminoGlosario } from './catalogo';
export { ejecutarTool } from './tools/ejecutar';
export { ejecutarGuardada, validarEspecificacion, TOOLS_GUARDABLES } from './guardada';
export type { EntradaGuardada, ResultadoGuardada } from './guardada';
export type { ContextoTool, ResultadoTool } from './tools/ejecutar';
export { TOOLS_ANTHROPIC, DIMENSIONES, TIPOS_SOLICITUD, TIPOS_SOLICITUD_MODELO, construirTools } from './tools/esquemas';
export {
  ejecutarAccion,
  ejecutarAcciones,
  validarAccion,
  normalizarContexto,
  actualizarContexto,
  sugerenciasIniciales,
  sugerenciasSiguientes,
  opcionesDesambiguacion,
  buscarRepeticion,
  turnosDesdeFilas,
  TOOLS_ACCION,
  PREGUNTA_AMBIGUA,
  CONTEXTO_VACIO,
} from './acciones';
export type { EntradaAccion, ResultadoAcciones } from './acciones';
export { construirEvidencia, verificarTexto, extraerCifras, reemplazarClaves, plantillaRespuesta } from './grounding';
export type { Evidencia, Verificacion } from './grounding';
export { formatearCifra, nombrePeriodo, nombreRango } from './formato';
export { unidadDe, corteDe } from './unidades';
export {
  SQL_LEER_CONTEXTO_CONVERSACION,
  SQL_GUARDAR_CONTEXTO_CONVERSACION,
  SQL_TURNOS_CON_CONSULTAS,
} from './tools/consultas';
export { prepararDescarga, esquemaDescarga, NIVELES_DESCARGA, TOPE_FILAS_DESCARGA } from './descargas';
export type { EntradaDescarga, HojaDescarga, NivelDescarga, ParamsDescarga, ResultadoDescarga } from './descargas';
export { construirSystemPrompt, construirBloquesSystem, FRASE_FUERA_CATALOGO } from './prompt';
export { clasificarIntencion, clasificarMensaje, esIntencionBloqueada, RESPUESTAS_FIJAS, INTENCIONES } from './compuerta';
export type { Intencion, ClasificacionCompuerta } from './compuerta';
export type {
  UsoModelo,
  AlcanceEfectivo,
  ConfigAgente,
  ConjuntoDatos,
  ConsultaEjecutada,
  EjecutorSql,
  EventoAuditoria,
  FrescuraDominio,
  MensajeHistorial,
  MetricaAutorizada,
  ResultadoAgente,
  SolicitudNoAtendida,
  TarjetaDato,
  UnidadMetrica,
  AccionTool,
  OpcionAccion,
  ContextoConversacion,
  TurnoPrevio,
} from './tipos';
