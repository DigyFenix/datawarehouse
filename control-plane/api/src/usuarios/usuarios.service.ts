/** Gestión de usuarios del portal. Contraseñas siempre con hash argon2 (nunca en claro). */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
import type { Env } from '../config/env';
import type { Actor } from '../organizaciones/organizaciones.service';
import { DB, DRIZZLE } from '../db/drizzle.module';
import { roles, usuarioRoles, usuarios } from '../db/schema';
import { ActualizarUsuarioDto, AsignarRolDto, CrearUsuarioDto } from './usuario.dto';

/** Vista pública de un usuario (sin el hash de contraseña). */
const columnasPublicas = {
  id: usuarios.id,
  email: usuarios.email,
  nombre: usuarios.nombre,
  activo: usuarios.activo,
  creadoEn: usuarios.creadoEn,
  actualizadoEn: usuarios.actualizadoEn,
};

@Injectable()
export class UsuariosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * La cuenta maestra de la plataforma: la que declara `PORTAL_ADMIN_EMAIL`.
   *
   * Es la llave de repuesto del producto. No se le puede quitar el rol, desactivar
   * ni cambiar el estado desde el portal, porque es lo único que garantiza que
   * siempre haya una forma de entrar aunque el resto de las cuentas se rompan. Para
   * moverla hay que cambiar el `.env`, que es una decisión de infraestructura y no
   * un clic.
   */
  private esCuentaMaestra(email: string): boolean {
    const maestro = this.config.get('PORTAL_ADMIN_EMAIL', { infer: true });
    return email.toLowerCase() === String(maestro).toLowerCase();
  }

  private exigirNoTocarLaMaestra(email: string, accion: string): void {
    if (this.esCuentaMaestra(email)) {
      throw new BadRequestException(
        `La cuenta maestra de la plataforma (${email}) no se puede ${accion}. ` +
          'Es la llave de repuesto del sistema; para moverla se cambia PORTAL_ADMIN_EMAIL.',
      );
    }
  }

  listar() {
    return this.db.select(columnasPublicas).from(usuarios);
  }

  async obtener(id: number) {
    const [u] = await this.db.select(columnasPublicas).from(usuarios).where(eq(usuarios.id, id));
    if (!u) throw new NotFoundException(`Usuario ${id} no encontrado`);
    return u;
  }

  async crear(dto: CrearUsuarioDto, actor: Actor) {
    const [existe] = await this.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, dto.email));
    if (existe) throw new ConflictException('Ya existe un usuario con ese email');

    const hashPassword = await argon2.hash(dto.password);
    const [creado] = await this.db
      .insert(usuarios)
      .values({ email: dto.email, nombre: dto.nombre, hashPassword })
      .returning(columnasPublicas);

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'crear',
      entidad: 'usuarios',
      entidadId: String(creado.id),
      despues: creado, // sin hash (columnasPublicas)
    });
    return creado;
  }

  async actualizar(id: number, dto: ActualizarUsuarioDto, actor: Actor) {
    const antes = await this.obtener(id);
    // Desactivar al último operador deja la plataforma sin quien la administre, y
    // sin forma de revertirlo desde el portal. Ya pasó una vez.
    if (dto.activo === false) {
      this.exigirNoTocarLaMaestra(antes.email, 'desactivar');
      if (actor.id === id) {
        throw new BadRequestException(
          'No puedes desactivarte a ti mismo: perderías el acceso al portal en el momento.',
        );
      }
      await this.exigirQueQuedeOtroOperadorActivo(id);
    }
    const [act] = await this.db
      .update(usuarios)
      .set({ ...dto, actualizadoEn: new Date() })
      .where(eq(usuarios.id, id))
      .returning(columnasPublicas);
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'actualizar',
      entidad: 'usuarios',
      entidadId: String(id),
      antes,
      despues: act,
    });
    return act;
  }

  async asignarRol(usuarioId: number, dto: AsignarRolDto, actor: Actor) {
    await this.obtener(usuarioId);
    const [rol] = await this.db.select().from(roles).where(eq(roles.id, dto.rolId));
    if (!rol) throw new NotFoundException(`Rol ${dto.rolId} no encontrado`);

    // `onConflictDoNothing` se apoya en el UNIQUE de la tabla, que NO cubre las
    // filas globales: con `organizacion_id` nulo no hay conflicto que detectar
    // (NULL <> NULL) y el mismo rol global se insertaba una y otra vez. La
    // migración 124 añadió el índice parcial; aquí se comprueba antes para
    // devolver `yaExistia` en vez de un error de restricción.
    const organizacionId = dto.organizacionId ?? null;
    const yaAsignado = await this.db
      .select({ id: usuarioRoles.id })
      .from(usuarioRoles)
      .where(
        and(
          eq(usuarioRoles.usuarioId, usuarioId),
          eq(usuarioRoles.rolId, dto.rolId),
          organizacionId === null
            ? isNull(usuarioRoles.organizacionId)
            : eq(usuarioRoles.organizacionId, organizacionId),
        ),
      );
    if (yaAsignado.length > 0) {
      return { usuarioId, rolId: dto.rolId, organizacionId, yaExistia: true };
    }

    const [asignado] = await this.db
      .insert(usuarioRoles)
      .values({ usuarioId, rolId: dto.rolId, organizacionId })
      .onConflictDoNothing()
      .returning();

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'asignar_rol',
      entidad: 'usuario_roles',
      entidadId: String(usuarioId),
      despues: { usuarioId, rolId: dto.rolId, organizacionId: dto.organizacionId ?? null },
    });
    return asignado ?? { usuarioId, rolId: dto.rolId, yaExistia: true };
  }

  async listarRolesDeUsuario(usuarioId: number) {
    await this.obtener(usuarioId);
    return this.db
      .select({ rolId: roles.id, clave: roles.clave, nombre: roles.nombre, organizacionId: usuarioRoles.organizacionId })
      .from(usuarioRoles)
      .innerJoin(roles, eq(roles.id, usuarioRoles.rolId))
      .where(eq(usuarioRoles.usuarioId, usuarioId));
  }

  /**
   * Quita una asignación de rol.
   *
   * El mismo rol puede estar asignado en varias organizaciones (y además en global),
   * así que el alcance identifica la fila: sin él se borraban TODAS las asignaciones
   * de ese rol y quitarlo en una organización lo revocaba en todas las demás.
   *
   * @param alcance `'global'` para la asignación sin organización, un id para la de
   *        esa organización, `undefined` para quitar el rol completo (todas).
   */
  async quitarRol(
    usuarioId: number,
    rolId: number,
    actor: Actor,
    alcance?: number | 'global',
  ): Promise<void> {
    const objetivo = await this.obtener(usuarioId);
    this.exigirNoTocarLaMaestra(objetivo.email, 'modificar');
    await this.exigirNoQuitarseElPropioMando(usuarioId, rolId, alcance, actor);
    await this.exigirQueQuedeUnOperador(usuarioId, rolId, alcance);

    const filtroAlcance =
      alcance === undefined
        ? undefined
        : alcance === 'global'
          ? isNull(usuarioRoles.organizacionId)
          : eq(usuarioRoles.organizacionId, alcance);

    await this.db
      .delete(usuarioRoles)
      .where(
        and(eq(usuarioRoles.usuarioId, usuarioId), eq(usuarioRoles.rolId, rolId), filtroAlcance),
      );
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId: typeof alcance === 'number' ? alcance : null,
      accion: 'quitar_rol',
      entidad: 'usuario_roles',
      entidadId: String(usuarioId),
      antes: { usuarioId, rolId, alcance: alcance ?? 'todas' },
    });
  }

  /**
   * Impide que alguien se quite a sí mismo el mando.
   *
   * Es distinto de «queda otro administrador»: aunque queden diez, quitarse el
   * propio rol te expulsa en la MISMA petición siguiente —la sesión relee los roles
   * en cada request— y ya no puedes deshacerlo. Le pasó al operador del producto y
   * dejó el portal mostrando cero organizaciones.
   *
   * @throws 400 si el actor intenta retirarse su propio rol de administrador global
   */
  private async exigirNoQuitarseElPropioMando(
    usuarioId: number,
    rolId: number,
    alcance: number | 'global' | undefined,
    actor: Actor,
  ): Promise<void> {
    if (actor.id !== usuarioId) return;
    if (alcance !== undefined && alcance !== 'global') return;
    const [rol] = await this.db.select().from(roles).where(eq(roles.id, rolId));
    if (rol?.clave !== 'admin_portal') return;
    throw new BadRequestException(
      'No puedes quitarte a ti mismo el rol de administrador: perderías el acceso al portal ' +
        'en el momento. Pídeselo a otro administrador.',
    );
  }

  /** Variante para la baja de un usuario: ¿queda algún operador activo aparte de él? */
  private async exigirQueQuedeOtroOperadorActivo(usuarioId: number): Promise<void> {
    const operadores = await this.operadoresGlobalesActivos();
    if (operadores.filter((o) => o !== usuarioId).length === 0) {
      throw new BadRequestException(
        'No se puede desactivar: es el último administrador de la plataforma.',
      );
    }
  }

  private async operadoresGlobalesActivos(): Promise<number[]> {
    const filas = await this.db
      .select({ usuarioId: usuarioRoles.usuarioId })
      .from(usuarioRoles)
      .innerJoin(roles, eq(roles.id, usuarioRoles.rolId))
      .innerJoin(usuarios, eq(usuarios.id, usuarioRoles.usuarioId))
      .where(
        and(
          eq(roles.clave, 'admin_portal'),
          isNull(usuarioRoles.organizacionId),
          eq(usuarios.activo, true),
        ),
      );
    return filas.map((f) => f.usuarioId);
  }

  /**
   * Impide dejar la plataforma sin ningún operador.
   *
   * Ocurrió: al quitar el último `admin_portal` global, el API dejó de reconocer a
   * nadie como operador y el portal devolvía la lista de organizaciones vacía — sin
   * forma de arreglarlo desde la interfaz, porque para asignar un rol hay que ser
   * administrador.
   *
   * @throws 400 si la operación dejaría cero administradores globales activos
   */
  private async exigirQueQuedeUnOperador(
    usuarioId: number,
    rolId: number,
    alcance?: number | 'global',
  ): Promise<void> {
    // Sólo peligra al retirar un rol GLOBAL (o todos los alcances de ese rol).
    if (alcance !== undefined && alcance !== 'global') return;

    const [rol] = await this.db.select().from(roles).where(eq(roles.id, rolId));
    if (rol?.clave !== 'admin_portal') return;

    const operadores = await this.operadoresGlobalesActivos();
    const quedarian = operadores.filter((o) => o !== usuarioId);
    if (quedarian.length === 0) {
      throw new BadRequestException(
        'No se puede quitar: es el último administrador de la plataforma. ' +
          'Asigna el rol a otra persona antes de retirárselo a esta.',
      );
    }
  }

  /** Crea un usuario admin de arranque si no existe ninguno (bootstrap). Idempotente. */
  async asegurarAdmin(email: string, password: string): Promise<'creado' | 'ya_existe'> {
    const [algun] = await this.db.select({ id: usuarios.id }).from(usuarios).limit(1);
    if (algun) return 'ya_existe';

    const hashPassword = await argon2.hash(password);
    const [admin] = await this.db
      .insert(usuarios)
      .values({ email, nombre: 'Administrador', hashPassword })
      .returning({ id: usuarios.id });

    const [rolAdmin] = await this.db.select().from(roles).where(eq(roles.clave, 'admin_portal'));
    if (rolAdmin) {
      await this.db
        .insert(usuarioRoles)
        .values({ usuarioId: admin.id, rolId: rolAdmin.id })
        .onConflictDoNothing();
    }
    await this.auditoria.registrar({
      accion: 'bootstrap_admin',
      entidad: 'usuarios',
      entidadId: String(admin.id),
      despues: { email },
    });
    return 'creado';
  }

  /**
   * Garantiza que el usuario de arranque tenga admin_portal con ALCANCE GLOBAL
   * (organizacion_id NULL). Idempotente: el UNIQUE trata los NULL como distintos,
   * así que la deduplicación se hace con SELECT explícito, no con onConflict.
   */
  async asegurarRolAdminGlobal(email: string): Promise<void> {
    const [usuario] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email));
    if (!usuario) return;

    const [rol] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.clave, 'admin_portal'));
    if (!rol) return;

    const [existente] = await this.db
      .select({ id: usuarioRoles.id })
      .from(usuarioRoles)
      .where(
        and(
          eq(usuarioRoles.usuarioId, usuario.id),
          eq(usuarioRoles.rolId, rol.id),
          isNull(usuarioRoles.organizacionId),
        ),
      );
    if (existente) return;

    await this.db
      .insert(usuarioRoles)
      .values({ usuarioId: usuario.id, rolId: rol.id, organizacionId: null });
    await this.auditoria.registrar({
      accion: 'bootstrap_rol_admin',
      entidad: 'usuario_roles',
      entidadId: String(usuario.id),
      despues: { usuarioId: usuario.id, rolId: rol.id, organizacionId: null },
    });
  }
}
