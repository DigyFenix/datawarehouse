/**
 * Declara DE DÓNDE sale la organización que la ruta afecta, para que
 * OrganizacionGuard verifique la membresía del actor ANTES de ejecutar.
 *
 *   @AlcanceOrg({ desde: 'query' })                    // ?organizacionId=
 *   @AlcanceOrg({ desde: 'body' })                     // { organizacionId: ... }
 *   @AlcanceOrg({ desde: 'param', campo: 'id' })       // /organizaciones/:id
 *   @AlcanceOrg({ desde: 'query', opcional: true })    // listados: sin org = filtrar por membresía
 *
 * Las rutas cuyo recurso se carga por PK (sin organización en la request) NO usan este
 * decorador: su defensa es exigirAccesoOrg() en el servicio, después de cargar la fila.
 */
import { SetMetadata } from '@nestjs/common';

export interface AlcanceOrgConfig {
  desde: 'query' | 'body' | 'param';
  /** Nombre del campo; default 'organizacionId' (en param suele ser 'id'). */
  campo?: string;
  /** true = la request puede no traer organización (p. ej. listados globales). */
  opcional?: boolean;
}

export const ALCANCE_ORG = 'alcance_org';

export const AlcanceOrg = (config: AlcanceOrgConfig) => SetMetadata(ALCANCE_ORG, config);
