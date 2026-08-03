/**
 * Acceso READ-ONLY a la base de control: resuelve hash_tenant → organización
 * (base de datos del tenant + branding). Es lo ÚNICO que este API lee de la
 * base de control; todo lo demás vive en la base del tenant.
 */
import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import type { Env } from '../config/env';

export interface OrganizacionTenant {
  id: number;
  codigo: string;
  nombre: string;
  colorMarca: string | null;
  baseDatosDw: string;
  logoMime: string | null;
}

@Injectable()
export class ControlDbService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService<Env, true>) {
    this.pool = new Pool({
      host: config.get('POSTGRES_HOST', { infer: true }),
      port: config.get('POSTGRES_PORT', { infer: true }),
      database: config.get('POSTGRES_DB', { infer: true }),
      user: config.get('POSTGRES_USER', { infer: true }),
      password: config.get('POSTGRES_PASSWORD', { infer: true }),
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }

  /**
   * Organización activa por hash de tenant. 404 GENÉRICO si no existe o no está
   * operable: un hash inválido no debe revelar nada sobre los tenants.
   */
  async organizacionPorHash(hash: string): Promise<OrganizacionTenant> {
    const resultado = await this.pool.query(
      `SELECT id, codigo, nombre,
              color_marca   AS "colorMarca",
              base_datos_dw AS "baseDatosDw",
              logo_mime     AS "logoMime"
         FROM gobierno.organizaciones
        WHERE hash_tenant = $1
          AND estado <> 'inactiva'
          AND base_datos_dw IS NOT NULL`,
      [hash],
    );
    const org = resultado.rows[0] as OrganizacionTenant | undefined;
    if (!org) throw new NotFoundException('Recurso no encontrado');
    return org;
  }

  /** Binario del logo del tenant (o null). */
  async logoPorHash(hash: string): Promise<{ datos: Buffer; mime: string } | null> {
    await this.organizacionPorHash(hash); // 404 genérico si el hash no existe
    const resultado = await this.pool.query<{ logo: Buffer | null; logo_mime: string | null }>(
      `SELECT logo, logo_mime FROM gobierno.organizaciones WHERE hash_tenant = $1`,
      [hash],
    );
    const fila = resultado.rows[0];
    if (!fila?.logo || !fila.logo_mime) return null;
    return { datos: fila.logo, mime: fila.logo_mime };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
