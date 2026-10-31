/**
 * @quilate/agente — agente de IA gobernado (CLAUDE.md §11).
 *
 * Paquete de DOMINIO: no conoce NestJS ni pg. El host (API del portal de
 * usuario) inyecta el ejecutor de SQL y persiste la auditoría; aquí viven las
 * tools tipadas, las guardas y el loop.
 */
export { responder } from './agente';
export type { EntradaAgente } from './agente';
export { resolverAlcance, empresasParaConsulta } from './alcances';
export { fichaDeMetrica, leerGlosario } from './catalogo';
export type { FichaMetrica, TerminoGlosario } from './catalogo';
export { ejecutarTool } from './tools/ejecutar';
export { ejecutarGuardada, validarEspecificacion, TOOLS_GUARDABLES } from './guardada';
export type { EntradaGuardada, ResultadoGuardada } from './guardada';
export type { ContextoTool, ResultadoTool } from './tools/ejecutar';
export { TOOLS_ANTHROPIC, DIMENSIONES, TIPOS_SOLICITUD } from './tools/esquemas';
export { prepararDescarga, esquemaDescarga, NIVELES_DESCARGA, TOPE_FILAS_DESCARGA } from './descargas';
export type { EntradaDescarga, HojaDescarga, NivelDescarga, ParamsDescarga, ResultadoDescarga } from './descargas';
export { construirSystemPrompt } from './prompt';
export type {
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
} from './tipos';
