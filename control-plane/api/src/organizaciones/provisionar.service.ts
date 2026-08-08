/**
 * Provisionamiento de una organización nueva: crea su base del plano de datos,
 * le aplica el DDL de tenant y siembra el paquete de ingesta de su ERP.
 *
 * Antes eran tres pasos manuales de consola (createdb + psql de los `*_tenant.sql`
 * + psql de los seeds `-v org=`), que es donde se rompía el onboarding: quien daba
 * de alta la organización en el portal no siempre corría los tres. Ahora es un
 * botón, auditado, e idempotente — se puede repetir sin duplicar nada.
 *
 * Los archivos SQL son los MISMOS del repo (`metadata-store/`, montado read-only
 * en el contenedor del API): no hay una segunda copia del esquema que mantener.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { Client, Pool } from 'pg';

import { AuditoriaService } from '../auditoria/auditoria.service';
import type { Env } from '../config/env';
import { DB, DRIZZLE, PG_POOL } from '../db/drizzle.module';
import { organizaciones } from '../db/schema';
import type { Actor } from './organizaciones.service';

/** Raíz del metadata-store dentro del contenedor (bind read-only del repo). */
const RAIZ_METADATA = process.env.METADATA_STORE_DIR ?? '/opt/metadata-store';

/** DDL que se aplica a la base del TENANT, en orden. Son los `*_tenant.sql` del repo. */
const DDL_TENANT = [
  '101_esquemas_tenant.sql',
  '110_portal_tenant.sql',
  '119_rol_lector_tenant.sql',
  '120_alcance_empresa_tenant.sql',
  '121_portal_chat_tenant.sql',
];

/** Paquete de ingesta por ERP: seeds parametrizados con `-v org=` (y `company=` en Odoo). */
const PAQUETES: Record<string, string[]> = {
  sap_b1: [
    '58_paquete_sap_b1.sql',
    '58b_paquete_sap_b1_documentos.sql',
    '64_paquete_sap_b1_extension.sql',
    '66_paquete_sap_b1_pedidos_mayor.sql',
    '68_paquete_sap_b1_direcciones_retencion.sql',
  ],
  odoo: [
    '59_paquete_odoo.sql',
    '65_paquete_odoo_extension.sql',
    '67_paquete_odoo_pedidos_mayor.sql',
    '69_paquete_odoo_direcciones.sql',
  ],
};

export interface ResultadoProvision {
  baseDatos: string;
  baseCreada: boolean;
  /** Fecha desde la que se extraen los flujos del ERP (`YYYY-MM-DD`). */
  corte: string;
  ddlAplicado: string[];
  seedsAplicados: string[];
  advertencias: string[];
}

/**
 * Corte por defecto: 1 de enero del año en curso.
 *
 * La regla del producto es "el año corriente completo" — un literal fijo en los
 * seeds obligaba a editarlos cada enero (y el 2026-01-01 del paquete anterior ya
 * iba camino de quedar viejo). Se puede sobreescribir al provisionar cuando el
 * cliente quiere arrastrar más historia.
 */
function cortePorDefecto(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/**
 * El corte entra al seed como literal SQL (`:'corte'`), así que se valida aquí y
 * no solo en el DTO: el servicio es invocable desde otro punto del portal sin
 * pasar por el pipe de Zod, igual que el código de organización y el companyId
 * que ya se revisan en este mismo método.
 *
 * El patrón por sí solo no alcanza — `2026-13-45` lo cumple y no es una fecha —
 * así que se reconstruye y se compara: si el calendario la normalizó a otra, no
 * existía.
 */
function validarCorte(corte: string): void {
  const fecha = new Date(`${corte}T00:00:00Z`);
  const esValida =
    /^\d{4}-\d{2}-\d{2}$/.test(corte) &&
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === corte;
  if (!esValida) {
    throw new BadRequestException(
      `Fecha de corte inválida: '${corte}'. Se espera una fecha real en formato YYYY-MM-DD.`,
    );
  }
}

@Injectable()
export class ProvisionarService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DB,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Deja la organización lista para Descubrir/Extraer. Idempotente: si la base ya
   * existe se conserva, el DDL usa IF NOT EXISTS y los seeds ON CONFLICT.
   *
   * @param organizacionId id de la organización ya creada en el portal
   * @param companyId id de compañía de Odoo (obligatorio solo para ese ERP)
   * @param corte fecha `YYYY-MM-DD` desde la que se extraen los flujos; por
   *              defecto el 1 de enero del año en curso
   * @returns qué se creó y qué se aplicó, más las advertencias no fatales
   * @throws 404 si la organización no existe · 400 si falta el ERP o el companyId de Odoo
   */
  async provisionar(
    organizacionId: number,
    companyId: number | null,
    corte: string | null,
    actor: Actor,
  ): Promise<ResultadoProvision> {
    const [org] = await this.db
      .select()
      .from(organizaciones)
      .where(eq(organizaciones.id, organizacionId));
    if (!org) throw new NotFoundException(`Organización ${organizacionId} no encontrada`);

    const baseDatos = org.baseDatosDw ?? `dw_${org.codigo}`;
    // El nombre de la base y el código entran a SQL como identificador y como
    // literal: se validan aquí, no se escapan después.
    if (!/^[a-z0-9_]+$/.test(baseDatos)) {
      throw new BadRequestException(
        `Nombre de base inválido: '${baseDatos}'. Solo minúsculas, dígitos y guion bajo.`,
      );
    }
    if (!/^[a-z0-9_]+$/.test(org.codigo)) {
      throw new BadRequestException(
        `Código de organización inválido: '${org.codigo}'. Solo minúsculas, dígitos y guion bajo.`,
      );
    }

    const erp = org.erpTipo;
    const seeds = PAQUETES[erp];
    if (!seeds) {
      throw new BadRequestException(
        `La organización no tiene un ERP soportado ('${erp}'). Válidos: ${Object.keys(PAQUETES).join(', ')}.`,
      );
    }
    // También entra al seed como literal: se exige entero aunque el ERP no lo pida.
    if (companyId !== null && !Number.isInteger(companyId)) {
      throw new BadRequestException(
        `Id de compañía inválido: '${companyId}'. Debe ser un entero.`,
      );
    }
    if (erp === 'odoo' && (companyId === null || !Number.isInteger(companyId))) {
      throw new BadRequestException(
        'Odoo requiere el id de compañía (company_id de res_company) para sembrar su paquete.',
      );
    }

    const corteEfectivo = corte ?? cortePorDefecto();
    validarCorte(corteEfectivo);

    const advertencias: string[] = [];
    const baseCreada = await this.crearBaseSiFalta(baseDatos);

    const ddlAplicado = await this.aplicarEnTenant(baseDatos, DDL_TENANT, advertencias);
    const seedsAplicados = await this.aplicarSeeds(
      seeds,
      org.codigo,
      companyId,
      corteEfectivo,
      advertencias,
    );

    const resultado: ResultadoProvision = {
      baseDatos,
      baseCreada,
      corte: corteEfectivo,
      ddlAplicado,
      seedsAplicados,
      advertencias,
    };

    await this.auditoria.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      ip: actor.ip,
      organizacionId,
      accion: 'provisionar',
      entidad: 'organizaciones',
      entidadId: String(organizacionId),
      despues: resultado,
    });

    return resultado;
  }

  /** CREATE DATABASE no corre en transacción ni acepta parámetros: identificador ya validado. */
  private async crearBaseSiFalta(baseDatos: string): Promise<boolean> {
    const existe = await this.pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      baseDatos,
    ]);
    if ((existe.rowCount ?? 0) > 0) return false;
    await this.pool.query(`CREATE DATABASE "${baseDatos}"`);
    return true;
  }

  /** Aplica archivos de `schema/` sobre la base del tenant, en el orden dado. */
  private async aplicarEnTenant(
    baseDatos: string,
    archivos: string[],
    advertencias: string[],
  ): Promise<string[]> {
    const cliente = new Client({
      host: this.config.get('POSTGRES_HOST', { infer: true }),
      port: this.config.get('POSTGRES_PORT', { infer: true }),
      user: this.config.get('POSTGRES_USER', { infer: true }),
      password: this.config.get('POSTGRES_PASSWORD', { infer: true }),
      database: baseDatos,
    });
    await cliente.connect();
    const aplicados: string[] = [];
    try {
      for (const archivo of archivos) {
        const sql = await this.leerSql(join(RAIZ_METADATA, 'schema', archivo));
        if (sql === null) {
          advertencias.push(`DDL no encontrado, se omite: ${archivo}`);
          continue;
        }
        try {
          await cliente.query(sql);
          aplicados.push(archivo);
        } catch (error) {
          // El rol portal_lector puede no existir aún (119) — es una advertencia,
          // no un fallo del onboarding: el tenant queda usable sin el agente.
          if (archivo.startsWith('119')) {
            advertencias.push(
              `No se pudo conceder acceso al rol de lectura (${archivo}): ${mensaje(error)}. ` +
                'Crear el rol portal_lector y re-provisionar para habilitar el agente.',
            );
            continue;
          }
          throw new InternalServerErrorException(
            `Falló el DDL '${archivo}' sobre ${baseDatos}: ${mensaje(error)}`,
          );
        }
      }
    } finally {
      await cliente.end();
    }
    return aplicados;
  }

  /**
   * Aplica los seeds del paquete sobre la BASE DE CONTROL, sustituyendo las
   * variables de psql (`:'org'`, `:'company'`) por literales. El valor ya está
   * validado contra `[a-z0-9_]+` / entero: es la misma sustitución que hace psql.
   */
  private async aplicarSeeds(
    archivos: string[],
    codigo: string,
    companyId: number | null,
    corte: string,
    advertencias: string[],
  ): Promise<string[]> {
    const aplicados: string[] = [];
    for (const archivo of archivos) {
      const crudo = await this.leerSql(join(RAIZ_METADATA, 'seeds', archivo));
      if (crudo === null) {
        advertencias.push(`Seed no encontrado, se omite: ${archivo}`);
        continue;
      }
      const sql = sinMetacomandos(crudo)
        .replaceAll(":'org'", `'${codigo}'`)
        .replaceAll(":'corte'", `'${corte}'`)
        .replaceAll(":'company'", companyId === null ? 'NULL' : `'${companyId}'`)
        .replaceAll(':company', companyId === null ? 'NULL' : String(companyId));
      try {
        await this.pool.query(sql);
        aplicados.push(archivo);
      } catch (error) {
        throw new InternalServerErrorException(
          `Falló el seed '${archivo}' para '${codigo}': ${mensaje(error)}`,
        );
      }
    }
    return aplicados;
  }

  private async leerSql(ruta: string): Promise<string | null> {
    try {
      return await readFile(ruta, 'utf8');
    } catch {
      return null;
    }
  }

  /** ¿Está el metadata-store montado y legible? Lo usa la UI para avisar antes de intentar. */
  async disponible(): Promise<boolean> {
    try {
      const archivos = await readdir(join(RAIZ_METADATA, 'schema'));
      return archivos.includes('101_esquemas_tenant.sql');
    } catch {
      return false;
    }
  }
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Quita los metacomandos del cliente psql (`\set ON_ERROR_STOP on` y similares).
 *
 * Los seeds están escritos para ejecutarse con psql, que interpreta esas líneas
 * él mismo y nunca las manda al servidor. Aquí las mandaríamos: el driver las ve
 * como SQL y devuelve un error de sintaxis en la barra invertida. La equivalencia
 * funcional está cubierta: cada archivo se ejecuta como una sola sentencia, así
 * que un error ya aborta todo el archivo (que es lo que ON_ERROR_STOP pide).
 */
function sinMetacomandos(sql: string): string {
  return sql
    .split('\n')
    .filter((linea) => !/^\s*\\/.test(linea))
    .join('\n');
}
