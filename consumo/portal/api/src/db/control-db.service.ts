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
  moduloAsistente: boolean;
}

/**
 * La organización por hash se lee en TODA petición autenticada (y varias veces en algunas).
 * Se cachea 60 s: desactivar una organización o cambiar su branding tarda a lo sumo eso en
 * verse en el portal de usuario. La revocación de USUARIOS sigue siendo inmediata (se relee
 * `portal.usuarios` en cada request).
 */
const TTL_ORGANIZACION_MS = 60_000;
const MAXIMO_EN_CACHE = 1_000;

@Injectable()
export class ControlDbService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly cacheOrganizaciones = new Map<string, { organizacion: OrganizacionTenant; expira: number }>();

  constructor(config: ConfigService<Env, true>) {
    this.pool = new Pool({
      host: config.get('POSTGRES_HOST', { infer: true }),
      port: config.get('POSTGRES_PORT', { infer: true }),
      database: config.get('POSTGRES_DB', { infer: true }),
      user: config.get('POSTGRES_USER', { infer: true }),
      password: config.get('POSTGRES_PASSWORD', { infer: true }),
      max: config.get('POSTGRES_POOL_MAX', { infer: true }),
      idleTimeoutMillis: 30_000,
    });
  }

  /**
   * Organización activa por hash de tenant. 404 GENÉRICO si no existe o no está
   * operable: un hash inválido no debe revelar nada sobre los tenants.
   */
  async organizacionPorHash(hash: string): Promise<OrganizacionTenant> {
    const ahora = Date.now();
    const enCache = this.cacheOrganizaciones.get(hash);
    if (enCache && enCache.expira > ahora) return enCache.organizacion;
    // Se cachean solo los aciertos: un hash inexistente no ocupa memoria ni puede envenenar el
    // caché, y una organización recién dada de alta se ve en la primera petición.
    const organizacion = await this.leerOrganizacionPorHash(hash);
    if (this.cacheOrganizaciones.size >= MAXIMO_EN_CACHE) {
      for (const [clave, entrada] of this.cacheOrganizaciones) if (entrada.expira <= ahora) this.cacheOrganizaciones.delete(clave);
      if (this.cacheOrganizaciones.size >= MAXIMO_EN_CACHE) this.cacheOrganizaciones.clear();
    }
    this.cacheOrganizaciones.set(hash, { organizacion, expira: ahora + TTL_ORGANIZACION_MS });
    return organizacion;
  }

  private async leerOrganizacionPorHash(hash: string): Promise<OrganizacionTenant> {
    const resultado = await this.pool.query(
      `SELECT id, codigo, nombre,
              color_marca   AS "colorMarca",
              base_datos_dw AS "baseDatosDw",
              logo_mime     AS "logoMime",
              modulo_asistente AS "moduloAsistente"
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

  /**
   * Consulta genérica de SOLO LECTURA contra la BD de control (catálogo de
   * metadatos, glosario). Único método no acotado a `gobierno.organizaciones`:
   * lo usa el agente de IA (`EjecutorSql.consultarControl`) para leer
   * `metadatos.*` sin que el paquete `@quilate/agente` conozca `pg`.
   */
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    const resultado = await this.pool.query<T>(sql, params);
    return resultado.rows;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
