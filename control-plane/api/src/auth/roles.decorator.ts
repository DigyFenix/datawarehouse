/**
 * Autorización por ROL (control "qué puede invocar", §12).
 *
 * @RolesPermitidos('data_owner', ...)  — exige el rol en CUALQUIER alcance (global o
 *   acotado a una organización); el alcance fino lo aplica @AlcanceOrg / el servicio.
 * @RolesGlobales('admin_portal', ...)  — exige el rol con alcance GLOBAL
 *   (organizacion_id NULL): reservado a operadores del producto (catálogos globales,
 *   usuarios, conexiones de cualquier tenant).
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_PERMITIDOS = 'roles_permitidos';
export const ROLES_GLOBALES = 'roles_globales';

export const RolesPermitidos = (...claves: string[]) => SetMetadata(ROLES_PERMITIDOS, claves);
export const RolesGlobales = (...claves: string[]) => SetMetadata(ROLES_GLOBALES, claves);
