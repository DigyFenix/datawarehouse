/**
 * Defensa del IDOR por PK: cuando una ruta muta un recurso cargado por id (sin
 * organización en la request), el servicio DEBE verificar la membresía DESPUÉS de
 * cargar la fila y ANTES de tocarla.
 *
 * 404 (no 403) para no confirmar la existencia de recursos de otros tenants.
 */
import { NotFoundException } from '@nestjs/common';

interface AlcanceActor {
  esGlobal?: boolean;
  orgIds?: number[];
}

export function exigirAccesoOrg(
  actor: AlcanceActor | null | undefined,
  organizacionId: number | null | undefined,
): void {
  if (!actor) throw new NotFoundException('Recurso no encontrado');
  if (actor.esGlobal) return;
  if (organizacionId != null && (actor.orgIds ?? []).includes(organizacionId)) return;
  throw new NotFoundException('Recurso no encontrado');
}

/** Organizaciones visibles para el actor en listados: null = todas (rol global). */
export function orgIdsVisibles(actor: AlcanceActor): number[] | null {
  return actor.esGlobal ? null : (actor.orgIds ?? []);
}
