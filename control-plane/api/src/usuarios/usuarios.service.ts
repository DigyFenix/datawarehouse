/** Gestión de usuarios del portal. Contraseñas siempre con hash argon2 (nunca en claro). */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';

import { AuditoriaService } from '../auditoria/auditoria.service';
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
  ) {}

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

    const [asignado] = await this.db
      .insert(usuarioRoles)
      .values({ usuarioId, rolId: dto.rolId, organizacionId: dto.organizacionId ?? null })
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

  async quitarRol(usuarioId: number, rolId: number, actor: Actor): Promise<void> {
    await this.db
      .delete(usuarioRoles)
      .where(and(eq(usuarioRoles.usuarioId, usuarioId), eq(usuarioRoles.rolId, rolId)));
    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      accion: 'quitar_rol',
      entidad: 'usuario_roles',
      entidadId: String(usuarioId),
      antes: { usuarioId, rolId },
    });
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
}
