/**
 * @pulso/agente — agente de IA gobernado (CLAUDE.md §11).
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
export type { ContextoTool, ResultadoTool } from './tools/ejecutar';
export { TOOLS_ANTHROPIC } from './tools/esquemas';
export { construirSystemPrompt } from './prompt';
export type {
  AlcanceEfectivo,
  ConfigAgente,
  EjecutorSql,
  EventoAuditoria,
  MensajeHistorial,
  MetricaAutorizada,
  ResultadoAgente,
  TarjetaDato,
} from './tipos';
