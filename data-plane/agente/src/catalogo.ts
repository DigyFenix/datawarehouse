/**
 * Lectura del catálogo de metadatos (BD de control): fichas de métrica y glosario.
 *
 * GUARDA 2 vive aquí y en `alcances.ts`: el único filtro de estado del paquete es
 * `estado in ('certificada','exploratoria')` (SQL_METRICAS_CONSUMIBLES). Una métrica
 * en borrador, en revisión o deprecada no entra al prompt ni se puede consultar,
 * aunque el usuario acierte la clave.
 */
import { SQL_FICHA_METRICA, SQL_GLOSARIO } from './tools/consultas';
import type { EjecutorSql } from './tipos';

export interface FichaMetrica {
  clave: string;
  nombreOficial: string;
  definicionNegocio: string;
  formula: string | null;
  periodicidad: string | null;
  estado: string;
  versionDefinicion: number | null;
  hechoNombre: string | null;
  grano: string | null;
}

export async function fichaDeMetrica(
  ejecutor: EjecutorSql,
  clave: string,
): Promise<FichaMetrica | null> {
  const filas = await ejecutor.consultarControl(SQL_FICHA_METRICA, [clave]);
  const f = filas[0];
  if (!f) return null;
  return {
    clave: String(f['clave']),
    nombreOficial: String(f['nombre_oficial']),
    definicionNegocio: String(f['definicion_negocio'] ?? ''),
    formula: f['formula'] == null ? null : String(f['formula']),
    periodicidad: f['periodicidad'] == null ? null : String(f['periodicidad']),
    estado: String(f['estado']),
    versionDefinicion: f['version_definicion'] == null ? null : Number(f['version_definicion']),
    hechoNombre: f['hecho_nombre'] == null ? null : String(f['hecho_nombre']),
    grano: f['grano'] == null ? null : String(f['grano']),
  };
}

export interface TerminoGlosario {
  termino: string;
  definicion: string;
  equivaleA: string | null;
}

export async function leerGlosario(ejecutor: EjecutorSql): Promise<TerminoGlosario[]> {
  const filas = await ejecutor.consultarControl(SQL_GLOSARIO, []);
  return filas.map((f) => ({
    termino: String(f['termino']),
    definicion: String(f['definicion'] ?? ''),
    equivaleA: f['equivale_a'] == null ? null : String(f['equivale_a']),
  }));
}
