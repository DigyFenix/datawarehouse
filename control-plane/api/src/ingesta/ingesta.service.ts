/**
 * Ingesta gobernada (§4 diseño): administra política (por objeto) y plan (corrida) de ingesta.
 * El portal (plano de control) escribe estos metadatos; el worker del plano de datos los lee.
 * Cambios auditados (§12). No mueve datos.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { exigirAccesoOrg } from '../common/acceso';
import { DB, DRIZZLE } from '../db/drizzle.module';
import {
  campoIngesta,
  catalogoDominios,
  organizaciones,
  planIngesta,
  politicaIngesta,
  sociedades,
} from '../db/schema';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  ActualizarCampoDto,
  ActualizarPlanDto,
  ActualizarPoliticaDto,
  CrearDominioDto,
  CrearPlanDto,
  CrearPoliticaDto,
  DescubrirDto,
  ExtraerDto,
  TransformarDto,
} from './ingesta.dto';

@Injectable()
export class IngestaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** La organización debe existir: sin tenant no hay configuración de ingesta válida. */
  private async exigirOrganizacion(organizacionId: number): Promise<void> {
    const [org] = await this.db
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.id, organizacionId));
    if (!org) throw new NotFoundException(`Organización ${organizacionId} no encontrada`);
  }

  // --- Políticas ------------------------------------------------------------

  /** Políticas de UNA organización. El objeto se repite entre tenants con otra fuente. */
  listarPoliticas(organizacionId: number) {
    return this.db
      .select()
      .from(politicaIngesta)
      .where(eq(politicaIngesta.organizacionId, organizacionId))
      .orderBy(politicaIngesta.id);
  }

  async crearPolitica(dto: CrearPoliticaDto, actor: Actor) {
    await this.exigirOrganizacion(dto.organizacionId);
    const [existe] = await this.db
      .select({ id: politicaIngesta.id })
      .from(politicaIngesta)
      .where(
        and(
          eq(politicaIngesta.organizacionId, dto.organizacionId),
          eq(politicaIngesta.objeto, dto.objeto),
        ),
      );
    if (existe)
      throw new ConflictException(
        `Esta organización ya tiene una política para el objeto '${dto.objeto}'`,
      );

    const [creado] = await this.db.insert(politicaIngesta).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'crear',
      entidad: 'politica_ingesta',
      entidadId: String(creado.id),
      despues: creado,
    });
    return creado;
  }

  async actualizarPolitica(id: number, dto: ActualizarPoliticaDto, actor: Actor) {
    const [antes] = await this.db.select().from(politicaIngesta).where(eq(politicaIngesta.id, id));
    if (!antes) throw new NotFoundException(`Política ${id} no encontrada`);
    exigirAccesoOrg(actor, antes.organizacionId); // IDOR por PK: la fila debe ser de una org del actor
    const [act] = await this.db
      .update(politicaIngesta)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(politicaIngesta.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'actualizar',
      entidad: 'politica_ingesta',
      entidadId: String(id),
      antes,
      despues: act,
    });
    return act;
  }

  async eliminarPolitica(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(politicaIngesta).where(eq(politicaIngesta.id, id));
    if (!antes) throw new NotFoundException(`Política ${id} no encontrada`);
    exigirAccesoOrg(actor, antes.organizacionId);
    await this.db.delete(politicaIngesta).where(eq(politicaIngesta.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'eliminar',
      entidad: 'politica_ingesta',
      entidadId: String(id),
      antes,
    });
  }

  // --- Planes ---------------------------------------------------------------

  listarPlanes(organizacionId: number) {
    return this.db
      .select()
      .from(planIngesta)
      .where(eq(planIngesta.organizacionId, organizacionId))
      .orderBy(planIngesta.id);
  }

  /**
   * Los objetos del plan deben existir como políticas DE ESA ORGANIZACIÓN (integridad;
   * el array no admite FK). Sin el filtro por organización, un plan podría listar un
   * objeto que solo existe en otro tenant y el worker no sabría qué política aplicar.
   */
  private async validarObjetos(organizacionId: number, objetos: string[]): Promise<void> {
    const existentes = await this.db
      .select({ objeto: politicaIngesta.objeto })
      .from(politicaIngesta)
      .where(
        and(
          eq(politicaIngesta.organizacionId, organizacionId),
          inArray(politicaIngesta.objeto, objetos),
        ),
      );
    const set = new Set(existentes.map((e) => e.objeto));
    const faltan = objetos.filter((o) => !set.has(o));
    if (faltan.length)
      throw new BadRequestException(
        `Objetos sin política en esta organización: ${faltan.join(', ')}`,
      );
  }

  /** Las sociedades del plan deben pertenecer a la organización del plan. */
  private async validarSociedades(organizacionId: number, empresas: string[]): Promise<void> {
    const existentes = await this.db
      .select({ empresaId: sociedades.empresaId })
      .from(sociedades)
      .where(
        and(
          eq(sociedades.organizacionId, organizacionId),
          inArray(sociedades.empresaId, empresas),
        ),
      );
    const set = new Set(existentes.map((e) => e.empresaId));
    const faltan = empresas.filter((e) => !set.has(e));
    if (faltan.length)
      throw new BadRequestException(
        `Sociedades que no son de esta organización: ${faltan.join(', ')}`,
      );
  }

  async crearPlan(dto: CrearPlanDto, actor: Actor) {
    await this.exigirOrganizacion(dto.organizacionId);
    const [existe] = await this.db
      .select({ id: planIngesta.id })
      .from(planIngesta)
      .where(
        and(eq(planIngesta.organizacionId, dto.organizacionId), eq(planIngesta.nombre, dto.nombre)),
      );
    if (existe)
      throw new ConflictException(
        `Esta organización ya tiene un plan con nombre '${dto.nombre}'`,
      );
    await this.validarObjetos(dto.organizacionId, dto.objetos);
    await this.validarSociedades(dto.organizacionId, dto.empresas);

    const [creado] = await this.db.insert(planIngesta).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'crear',
      entidad: 'plan_ingesta',
      entidadId: String(creado.id),
      despues: creado,
    });
    return creado;
  }

  async actualizarPlan(id: number, dto: ActualizarPlanDto, actor: Actor) {
    const [antes] = await this.db.select().from(planIngesta).where(eq(planIngesta.id, id));
    if (!antes) throw new NotFoundException(`Plan ${id} no encontrado`);
    exigirAccesoOrg(actor, antes.organizacionId);
    if (dto.objetos) await this.validarObjetos(antes.organizacionId, dto.objetos);
    if (dto.empresas) await this.validarSociedades(antes.organizacionId, dto.empresas);
    const [act] = await this.db
      .update(planIngesta)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(planIngesta.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'actualizar',
      entidad: 'plan_ingesta',
      entidadId: String(id),
      antes,
      despues: act,
    });
    return act;
  }

  async eliminarPlan(id: number, actor: Actor): Promise<void> {
    const [antes] = await this.db.select().from(planIngesta).where(eq(planIngesta.id, id));
    if (!antes) throw new NotFoundException(`Plan ${id} no encontrado`);
    exigirAccesoOrg(actor, antes.organizacionId);
    await this.db.delete(planIngesta).where(eq(planIngesta.id, id));
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'eliminar',
      entidad: 'plan_ingesta',
      entidadId: String(id),
      antes,
    });
  }

  // --- Dominios (catálogo administrable) ------------------------------------

  listarDominios() {
    return this.db.select().from(catalogoDominios).orderBy(catalogoDominios.clave);
  }

  async crearDominio(dto: CrearDominioDto, actor: Actor) {
    const [existe] = await this.db
      .select({ id: catalogoDominios.id })
      .from(catalogoDominios)
      .where(eq(catalogoDominios.clave, dto.clave));
    if (existe) throw new ConflictException(`Ya existe el dominio '${dto.clave}'`);
    const [creado] = await this.db.insert(catalogoDominios).values(dto).returning();
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear',
      entidad: 'catalogo_dominios',
      entidadId: String(creado.id),
      despues: creado,
    });
    return creado;
  }

  // --- Campos de ingesta (columna de origen → canónico) ---------------------

  /**
   * Campos de una entidad (objeto) DE UNA ORGANIZACIÓN, ordenados por tabla de origen.
   * Sin el filtro por organización, 'productos' devolvería OITM (SAP B1) y
   * product_product/product_template (Odoo) en la misma lista: dos ERPs mezclados.
   */
  listarCampos(organizacionId: number, objeto: string) {
    return this.db
      .select()
      .from(campoIngesta)
      .where(and(eq(campoIngesta.organizacionId, organizacionId), eq(campoIngesta.objeto, objeto)))
      .orderBy(campoIngesta.tablaOrigen, campoIngesta.id);
  }

  async actualizarCampo(id: number, dto: ActualizarCampoDto, actor: Actor) {
    const [antes] = await this.db.select().from(campoIngesta).where(eq(campoIngesta.id, id));
    if (!antes) throw new NotFoundException(`Campo ${id} no encontrado`);
    exigirAccesoOrg(actor, antes.organizacionId);
    // REGLA DURA (decisión de Edwin, 2026-08-01): un UDF SIN DATOS no se incluye ni se mapea.
    // Cada instalación trae decenas de U_* vacíos; incluirlos satura Bronce y oro.campo_usuario
    // sin aportar nada. `tiene_datos` lo determina el perfilado de Descubrir: si el campo se
    // empezó a usar en el ERP, se corre Descubrir de nuevo y queda habilitado.
    const quiereActivar =
      dto.incluido === true || (dto.campoCanonico != null && dto.campoCanonico !== '');
    if (antes.esUdf && !antes.tieneDatos && quiereActivar) {
      throw new BadRequestException(
        `El campo de usuario '${antes.campoOrigen}' no tiene datos en el ERP: no se puede ` +
          'incluir ni mapear. Si empezó a usarse, corre Descubrir de nuevo para actualizar el perfilado.',
      );
    }
    const [act] = await this.db
      .update(campoIngesta)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(campoIngesta.id, id))
      .returning();
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: antes.organizacionId,
      accion: 'actualizar', entidad: 'campo_ingesta', entidadId: String(id), antes, despues: act,
    });
    return act;
  }

  /**
   * Dispara una acción en el worker del plano de datos (introspección / extracción / dbt).
   *
   * El timeout es alto a propósito: con volumen real un `dbt build` de ventas tarda minutos
   * (medido: 5:09 para 215k líneas de hecho). Con el tope anterior de 5 min el portal
   * reportaba "no se pudo contactar el worker" mientras la corrida terminaba bien — un falso
   * negativo peor que la espera, porque invita a relanzar algo que ya está corriendo.
   */
  private async llamarWorker(ruta: string, cuerpo: unknown): Promise<unknown> {
    const base = process.env.WORKER_URL ?? 'http://worker:3010';
    const timeoutMs = Number(process.env.WORKER_TIMEOUT_MS ?? 1_800_000); // 30 min
    let respuesta: { success: boolean; data?: unknown; error?: string };
    try {
      const r = await fetch(`${base}/${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      respuesta = (await r.json()) as { success: boolean; data?: unknown; error?: string };
    } catch {
      throw new ServiceUnavailableException('No se pudo contactar el worker del plano de datos.');
    }
    if (!respuesta.success) throw new BadRequestException(respuesta.error ?? 'La operación falló en el origen.');
    return respuesta.data;
  }

  /**
   * La sociedad debe pertenecer a la organización activa. Evita que una acción del
   * portal toque el origen de otro tenant por un id equivocado (§12 aislamiento).
   */
  private async exigirSociedadDeOrganizacion(
    organizacionId: number,
    empresaId: string,
  ): Promise<void> {
    const [soc] = await this.db
      .select({ id: sociedades.id })
      .from(sociedades)
      .where(
        and(eq(sociedades.organizacionId, organizacionId), eq(sociedades.empresaId, empresaId)),
      );
    if (!soc)
      throw new BadRequestException(
        `La sociedad '${empresaId}' no pertenece a la organización seleccionada`,
      );
  }

  /** Introspección: llena campo_ingesta desde el origen. Auditado. */
  async descubrir(dto: DescubrirDto, actor: Actor) {
    await this.exigirSociedadDeOrganizacion(dto.organizacionId, dto.sociedad);
    const data = await this.llamarWorker('descubrir', {
      objeto: dto.objeto, sociedad: dto.sociedad, tablas: dto.tablas ?? null,
    });
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'descubrir', entidad: 'campo_ingesta', entidadId: dto.objeto, despues: data,
    });
    return data;
  }

  /** Extracción read-only → Bronze de los campos incluidos. Auditado. */
  async extraer(dto: ExtraerDto, actor: Actor) {
    await this.exigirSociedadDeOrganizacion(dto.organizacionId, dto.sociedad);
    const data = await this.llamarWorker('extraer', { objeto: dto.objeto, sociedad: dto.sociedad });
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'extraer', entidad: 'bronce', entidadId: dto.objeto, despues: data,
    });
    return data;
  }

  /** Transformación dbt (Bronze→Silver→Gold) gobernada por la política del objeto. Auditado. */
  async transformar(dto: TransformarDto, actor: Actor) {
    if (dto.sociedad) await this.exigirSociedadDeOrganizacion(dto.organizacionId, dto.sociedad);
    // El worker corre dbt contra la base de ESA organización: necesita su código, no la
    // sociedad (la transformación es por tenant, no por sociedad).
    const [org] = await this.db
      .select({ codigo: organizaciones.codigo })
      .from(organizaciones)
      .where(eq(organizaciones.id, dto.organizacionId));
    if (!org) throw new NotFoundException(`Organización ${dto.organizacionId} no encontrada`);

    const data = await this.llamarWorker('transformar', {
      objeto: dto.objeto,
      organizacion: org.codigo,
    });
    await this.auditoria.registrar({
      usuarioId: actor.id, usuarioEmail: actor.email, ip: actor.ip,
      organizacionId: dto.organizacionId,
      accion: 'transformar', entidad: 'oro', entidadId: dto.objeto, despues: data,
    });
    return data;
  }
}
