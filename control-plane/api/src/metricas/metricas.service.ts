/**
 * Catálogo de métricas + certificación multi-aprobador (§9).
 * Una versión se certifica cuando TODOS sus aprobadores aprueban. Cambiar una fórmula
 * certificada = nueva versión + recertificación (nunca editar en silencio).
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, max } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import {
  catalogoHechos,
  catalogoMetricas,
  metricaAprobaciones,
  metricaVersiones,
} from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarMetricaDto, CrearMetricaDto, CrearVersionDto } from './metrica.dto';

@Injectable()
export class MetricasService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  listar() {
    return this.db.select().from(catalogoMetricas);
  }

  listarHechos() {
    return this.db.select().from(catalogoHechos);
  }

  async obtener(id: number) {
    const [metrica] = await this.db
      .select()
      .from(catalogoMetricas)
      .where(eq(catalogoMetricas.id, id));
    if (!metrica) throw new NotFoundException(`Métrica ${id} no encontrada`);

    const versiones = await this.db
      .select()
      .from(metricaVersiones)
      .where(eq(metricaVersiones.metricaId, id));

    const versionesConAprob = await Promise.all(
      versiones.map(async (v) => ({
        ...v,
        aprobaciones: await this.db
          .select()
          .from(metricaAprobaciones)
          .where(eq(metricaAprobaciones.metricaVersionId, v.id)),
      })),
    );
    return { ...metrica, versiones: versionesConAprob };
  }

  async crear(dto: CrearMetricaDto, actor: Actor) {
    const [existe] = await this.db
      .select({ id: catalogoMetricas.id })
      .from(catalogoMetricas)
      .where(eq(catalogoMetricas.clave, dto.clave));
    if (existe) throw new ConflictException('Ya existe una métrica con esa clave');

    const [hecho] = await this.db
      .select({ clave: catalogoHechos.clave })
      .from(catalogoHechos)
      .where(eq(catalogoHechos.clave, dto.hechoOrigen));
    if (!hecho) throw new BadRequestException(`Hecho de origen '${dto.hechoOrigen}' no existe`);

    const [creada] = await this.db
      .insert(catalogoMetricas)
      .values({ ...dto, estado: 'borrador' })
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear',
      entidad: 'catalogo_metricas',
      entidadId: String(creada.id),
      despues: creada,
    });
    return creada;
  }

  /** Edita campos de gestión de la métrica (no fórmula ni estado). */
  async actualizar(id: number, dto: ActualizarMetricaDto, actor: Actor) {
    const [antes] = await this.db
      .select()
      .from(catalogoMetricas)
      .where(eq(catalogoMetricas.id, id));
    if (!antes) throw new NotFoundException(`Métrica ${id} no encontrada`);
    const [act] = await this.db
      .update(catalogoMetricas)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(catalogoMetricas.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'actualizar',
      entidad: 'catalogo_metricas',
      entidadId: String(id),
      antes,
      despues: act,
    });
    return act;
  }

  /** Crea una nueva versión de la definición (fórmula) en estado borrador. */
  async crearVersion(metricaId: number, dto: CrearVersionDto, actor: Actor) {
    await this.obtener(metricaId);
    const [{ maxVersion }] = await this.db
      .select({ maxVersion: max(metricaVersiones.version) })
      .from(metricaVersiones)
      .where(eq(metricaVersiones.metricaId, metricaId));
    const siguiente = (maxVersion ?? 0) + 1;

    const [version] = await this.db
      .insert(metricaVersiones)
      .values({
        metricaId,
        version: siguiente,
        formula: dto.formula,
        definicionNegocio: dto.definicionNegocio,
        estado: 'borrador',
        creadoPor: actor.email ?? 'desconocido',
        notas: dto.notas,
      })
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear_version',
      entidad: 'metrica_versiones',
      entidadId: String(version.id),
      despues: version,
    });
    return version;
  }

  /** Envía una versión a revisión: fija los aprobadores requeridos y crea sus votos pendientes. */
  async enviarRevision(
    metricaId: number,
    versionId: number,
    aprobadoresParam: string[] | undefined,
    actor: Actor,
  ) {
    const metrica = (await this.obtener(metricaId)) as { aprobadores: string[] };
    await this.obtenerVersion(metricaId, versionId); // valida que la versión pertenece a la métrica

    const aprobadores = aprobadoresParam ?? metrica.aprobadores;
    if (!aprobadores || aprobadores.length === 0) {
      throw new BadRequestException('La métrica no tiene aprobadores definidos');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(metricaVersiones)
        .set({ estado: 'en_revision' })
        .where(eq(metricaVersiones.id, versionId));
      await tx
        .update(catalogoMetricas)
        .set({ estado: 'en_revision', aprobadores, actualizadoEn: new Date() })
        .where(eq(catalogoMetricas.id, metricaId));
      // Reinicia votos: borra previos y crea uno pendiente por aprobador.
      await tx.delete(metricaAprobaciones).where(eq(metricaAprobaciones.metricaVersionId, versionId));
      await tx
        .insert(metricaAprobaciones)
        .values(aprobadores.map((a) => ({ metricaVersionId: versionId, aprobador: a, aprobado: null })));
    });

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'enviar_revision',
      entidad: 'metrica_versiones',
      entidadId: String(versionId),
      despues: { aprobadores },
    });
    return { versionId, aprobadores, estado: 'en_revision' };
  }

  /**
   * Registra el voto de un aprobador. Si todos aprueban, certifica la versión y la métrica.
   * Si alguno rechaza, la versión vuelve a borrador y la métrica no se certifica.
   * El aprobador es el usuario autenticado (no puede votar por otro).
   */
  async votar(versionId: number, aprobado: boolean, comentario: string | undefined, actor: Actor) {
    const email = actor.email;
    if (!email) throw new BadRequestException('No se pudo identificar al aprobador');

    const [voto] = await this.db
      .select()
      .from(metricaAprobaciones)
      .where(
        and(
          eq(metricaAprobaciones.metricaVersionId, versionId),
          eq(metricaAprobaciones.aprobador, email),
        ),
      );
    if (!voto) throw new BadRequestException('No estás en la lista de aprobadores de esta versión');

    const [version] = await this.db
      .select()
      .from(metricaVersiones)
      .where(eq(metricaVersiones.id, versionId));
    if (!version) throw new NotFoundException(`Versión ${versionId} no encontrada`);
    if (version.estado !== 'en_revision') {
      throw new BadRequestException('La versión no está en revisión');
    }

    await this.db
      .update(metricaAprobaciones)
      .set({ aprobado, comentario, fecha: new Date() })
      .where(eq(metricaAprobaciones.id, voto.id));

    const votos = await this.db
      .select()
      .from(metricaAprobaciones)
      .where(eq(metricaAprobaciones.metricaVersionId, versionId));

    let resultado: 'certificada' | 'rechazada' | 'pendiente' = 'pendiente';

    if (!aprobado) {
      // Un rechazo detiene la certificación: versión vuelve a borrador, métrica no certificada.
      resultado = 'rechazada';
      await this.db.transaction(async (tx) => {
        await tx
          .update(metricaVersiones)
          .set({ estado: 'borrador' })
          .where(eq(metricaVersiones.id, versionId));
        await tx
          .update(catalogoMetricas)
          .set({ estado: 'borrador', actualizadoEn: new Date() })
          .where(eq(catalogoMetricas.id, version.metricaId));
      });
    } else if (votos.every((v) => v.aprobado === true)) {
      // TODOS aprobaron: certifica la versión y promueve la métrica (§9).
      resultado = 'certificada';
      await this.db.transaction(async (tx) => {
        await tx
          .update(metricaVersiones)
          .set({ estado: 'certificada', fechaCertificacion: new Date(), certificadaPor: email })
          .where(eq(metricaVersiones.id, versionId));
        await tx
          .update(catalogoMetricas)
          .set({
            estado: 'certificada',
            formula: version.formula,
            definicionNegocio: version.definicionNegocio,
            versionDefinicion: version.version,
            actualizadoEn: new Date(),
          })
          .where(eq(catalogoMetricas.id, version.metricaId));
      });
    }

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: email,
      ip: actor.ip,
      accion: resultado === 'certificada' ? 'certificar' : 'votar_aprobacion',
      entidad: 'metrica_versiones',
      entidadId: String(versionId),
      despues: { aprobado, resultado, comentario },
    });
    return { versionId, resultado };
  }

  private async obtenerVersion(metricaId: number, versionId: number) {
    const [v] = await this.db
      .select()
      .from(metricaVersiones)
      .where(and(eq(metricaVersiones.id, versionId), eq(metricaVersiones.metricaId, metricaId)));
    if (!v) throw new NotFoundException(`Versión ${versionId} no encontrada para la métrica ${metricaId}`);
    return v;
  }
}
