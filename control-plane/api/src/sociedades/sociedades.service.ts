/**
 * Sociedades (empresas del grupo). El portal las administra; cada una apunta a una
 * conexión y define su esquema de origen. Cambios auditados (§12). No mueve datos.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { exigirAccesoOrg } from '../common/acceso';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { conexiones, organizaciones, sociedades } from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarSociedadDto, CrearSociedadDto } from './sociedades.dto';

@Injectable()
export class SociedadesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Sociedades de una organización. Sin organización no hay listado: cada tenant ve las suyas. */
  listar(organizacionId: number) {
    return this.db
      .select()
      .from(sociedades)
      .where(eq(sociedades.organizacionId, organizacionId))
      .orderBy(sociedades.orden, sociedades.id);
  }

  /**
   * Integridad cruzada (§12 aislamiento): la conexión asignada debe existir y ser de la
   * MISMA organización de la sociedad. Un solo mensaje para no confirmar la existencia
   * de conexiones de otros tenants.
   */
  private async exigirConexionDeOrganizacion(
    organizacionId: number,
    conexionId: number,
  ): Promise<void> {
    const [con] = await this.db
      .select({ id: conexiones.id })
      .from(conexiones)
      .where(and(eq(conexiones.id, conexionId), eq(conexiones.organizacionId, organizacionId)));
    if (!con) {
      throw new BadRequestException(
        `La conexión ${conexionId} no existe o no pertenece a la organización de la sociedad`,
      );
    }
  }

  async crear(dto: CrearSociedadDto, actor: Actor) {
    const [org] = await this.db
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.id, dto.organizacionId));
    if (!org) throw new NotFoundException(`Organización ${dto.organizacionId} no encontrada`);

    // empresa_id es único global a propósito: es la etiqueta de trazabilidad en Bronce
    // y el worker resuelve la sociedad por ella (ver migración 105).
    const [existe] = await this.db
      .select({ id: sociedades.id })
      .from(sociedades)
      .where(eq(sociedades.empresaId, dto.empresaId));
    if (existe) throw new ConflictException(`Ya existe una sociedad con empresa_id '${dto.empresaId}'`);
    if (dto.conexionId != null) {
      await this.exigirConexionDeOrganizacion(dto.organizacionId, dto.conexionId);
    }
    const [creado] = await this.db.insert(sociedades).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'crear', entidad: 'sociedades', entidadId: String(creado.id), despues: creado,
    });
    return creado;
  }

  async actualizar(id: number, dto: ActualizarSociedadDto, actor: Actor) {
    const [antes] = await this.db.select().from(sociedades).where(eq(sociedades.id, id));
    if (!antes) throw new NotFoundException(`Sociedad ${id} no encontrada`);
    exigirAccesoOrg(actor, antes.organizacionId); // IDOR por PK: la fila debe ser de una org del actor
    if (dto.conexionId != null) {
      await this.exigirConexionDeOrganizacion(antes.organizacionId, dto.conexionId);
    }
    const [act] = await this.db
      .update(sociedades)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(sociedades.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'actualizar', entidad: 'sociedades', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  async eliminar(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(sociedades).where(eq(sociedades.id, id));
    if (!antes) throw new NotFoundException(`Sociedad ${id} no encontrada`);
    exigirAccesoOrg(actor, antes.organizacionId);
    await this.db.delete(sociedades).where(eq(sociedades.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'eliminar', entidad: 'sociedades', entidadId: String(id), antes,
    });
  }
}
