/**
 * Catálogo de métricas + certificación multi-aprobador (§9).
 * Una versión se certifica cuando TODOS sus aprobadores aprueban. Cambiar una fórmula
 * certificada = nueva versión + recertificación (nunca editar en silencio).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, max, ne } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import {
  catalogoHechos,
  catalogoMetricas,
  metricaAprobaciones,
  metricaVersiones,
  roles,
  usuarioRoles,
  usuarios,
} from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import { ActualizarMetricaDto, CrearMetricaDto, CrearVersionDto } from './metrica.dto';

/**
 * Quién puede aprobar una certificación. El plano de control se quedó con dos
 * roles (migración 129) y aprobar una definición es un acto de gobierno: lo hace
 * quien administra la plataforma o quien administra esa organización.
 */
const ROLES_APROBADORES = ['admin_portal', 'admin_organizacion'];

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
    const version = await this.obtenerVersion(metricaId, versionId); // valida que la versión pertenece a la métrica

    // Solo una versión en borrador se envía a revisión. Una certificada jamás se
    // re-envía: eso resetearía sus votos (§9: nueva versión + recertificación).
    if (version.estado === 'en_revision') {
      throw new ConflictException('La versión ya está en revisión');
    }
    if (version.estado === 'certificada') {
      throw new BadRequestException('Una versión certificada no se re-envía: crea una versión nueva');
    }
    if (version.estado !== 'borrador') {
      throw new BadRequestException(
        `Solo una versión en borrador se puede enviar a revisión (estado actual: ${version.estado})`,
      );
    }

    // El índice único parcial uq_metrica_una_en_revision garantiza esto en BD;
    // se valida antes para dar un error legible en lugar de un fallo de constraint.
    const [otraEnRevision] = await this.db
      .select({ id: metricaVersiones.id, version: metricaVersiones.version })
      .from(metricaVersiones)
      .where(
        and(
          eq(metricaVersiones.metricaId, metricaId),
          eq(metricaVersiones.estado, 'en_revision'),
          ne(metricaVersiones.id, versionId),
        ),
      );
    if (otraEnRevision) {
      throw new ConflictException(
        `La métrica ya tiene la versión ${otraEnRevision.version} en revisión; resuélvela antes de enviar otra`,
      );
    }

    const aprobadores = aprobadoresParam ?? metrica.aprobadores;
    if (!aprobadores || aprobadores.length === 0) {
      throw new BadRequestException('La métrica no tiene aprobadores definidos');
    }

    // Separación de funciones: quien crea la versión no puede estar entre sus aprobadores.
    if (aprobadores.includes(version.creadoPor)) {
      throw new BadRequestException(
        'Quien crea una versión no puede certificarla (separación de funciones)',
      );
    }

    await this.validarAprobadores(aprobadores);

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

    // Revalida en el momento del voto: el aprobador debe seguir activo y siendo
    // administrador (pudo dejar de serlo después de que se envió a revisión).
    // Aprobar una definición es un acto de gobierno, no de consulta.
    const [usuario] = await this.db
      .select({ id: usuarios.id, activo: usuarios.activo })
      .from(usuarios)
      .where(eq(usuarios.email, email));
    if (!usuario || !usuario.activo) {
      throw new ForbiddenException('Tu usuario no existe o está inactivo: no puedes votar');
    }
    const [rolAprobador] = await this.db
      .select({ id: usuarioRoles.id })
      .from(usuarioRoles)
      .innerJoin(roles, eq(roles.id, usuarioRoles.rolId))
      .where(and(eq(usuarioRoles.usuarioId, usuario.id), inArray(roles.clave, ROLES_APROBADORES)))
      .limit(1);
    if (!rolAprobador) {
      throw new ForbiddenException(
        'Solo un administrador de la plataforma o de la organización puede aprobar una certificación',
      );
    }

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

  /**
   * Depreca una métrica certificada (y su versión vigente). No hay reactivación:
   * el único camino de vuelta es nueva versión + recertificación (§9).
   */
  async deprecar(metricaId: number, actor: Actor) {
    const [antes] = await this.db
      .select()
      .from(catalogoMetricas)
      .where(eq(catalogoMetricas.id, metricaId));
    if (!antes) throw new NotFoundException(`Métrica ${metricaId} no encontrada`);
    if (antes.estado !== 'certificada') {
      throw new BadRequestException('Solo una métrica certificada se puede deprecar');
    }

    // Versión vigente = la certificada de mayor número de versión.
    const [vigente] = await this.db
      .select({ id: metricaVersiones.id, version: metricaVersiones.version })
      .from(metricaVersiones)
      .where(
        and(eq(metricaVersiones.metricaId, metricaId), eq(metricaVersiones.estado, 'certificada')),
      )
      .orderBy(desc(metricaVersiones.version))
      .limit(1);

    const despues = await this.db.transaction(async (tx) => {
      const [act] = await tx
        .update(catalogoMetricas)
        .set({ estado: 'deprecada', actualizadoEn: new Date() })
        .where(eq(catalogoMetricas.id, metricaId))
        .returning();
      if (vigente) {
        await tx
          .update(metricaVersiones)
          .set({ estado: 'deprecada' })
          .where(eq(metricaVersiones.id, vigente.id));
      }
      return act;
    });

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'deprecar',
      entidad: 'catalogo_metricas',
      entidadId: String(metricaId),
      antes,
      despues,
    });
    return despues;
  }

  /** Versiones en revisión donde el actor tiene un voto pendiente. */
  async pendientesDeMiVoto(actor: Actor) {
    const email = actor.email;
    if (!email) throw new BadRequestException('No se pudo identificar al aprobador');

    return this.db
      .select({
        metricaId: catalogoMetricas.id,
        clave: catalogoMetricas.clave,
        nombreOficial: catalogoMetricas.nombreOficial,
        versionId: metricaVersiones.id,
        version: metricaVersiones.version,
        formula: metricaVersiones.formula,
        definicionNegocio: metricaVersiones.definicionNegocio,
        creadoPor: metricaVersiones.creadoPor,
        creadoEn: metricaVersiones.creadoEn,
      })
      .from(metricaAprobaciones)
      .innerJoin(metricaVersiones, eq(metricaVersiones.id, metricaAprobaciones.metricaVersionId))
      .innerJoin(catalogoMetricas, eq(catalogoMetricas.id, metricaVersiones.metricaId))
      .where(
        and(
          eq(metricaAprobaciones.aprobador, email),
          isNull(metricaAprobaciones.aprobado),
          eq(metricaVersiones.estado, 'en_revision'),
        ),
      );
  }

  /**
   * Valida que cada aprobador exista como usuario ACTIVO de gobierno.usuarios y tenga
   * rol de administrador (en cualquier alcance). Falla con 400 listando los inválidos.
   */
  private async validarAprobadores(aprobadores: string[]) {
    const encontrados = await this.db
      .select({ id: usuarios.id, email: usuarios.email, activo: usuarios.activo })
      .from(usuarios)
      .where(inArray(usuarios.email, aprobadores));
    const activosPorEmail = new Map(
      encontrados.filter((u) => u.activo).map((u) => [u.email, u.id]),
    );

    const idsActivos = [...activosPorEmail.values()];
    const conRolOwner = new Set<number>();
    if (idsActivos.length > 0) {
      const filas = await this.db
        .select({ usuarioId: usuarioRoles.usuarioId })
        .from(usuarioRoles)
        .innerJoin(roles, eq(roles.id, usuarioRoles.rolId))
        .where(and(inArray(usuarioRoles.usuarioId, idsActivos), inArray(roles.clave, ROLES_APROBADORES)));
      for (const f of filas) conRolOwner.add(f.usuarioId);
    }

    const invalidos: string[] = [];
    for (const email of aprobadores) {
      const usuarioId = activosPorEmail.get(email);
      if (usuarioId === undefined) {
        invalidos.push(`${email} (no existe o está inactivo)`);
      } else if (!conRolOwner.has(usuarioId)) {
        invalidos.push(`${email} (no es administrador)`);
      }
    }
    if (invalidos.length > 0) {
      throw new BadRequestException(`Aprobadores inválidos: ${invalidos.join(', ')}`);
    }
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
