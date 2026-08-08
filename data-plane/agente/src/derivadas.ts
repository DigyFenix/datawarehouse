/**
 * Métricas derivadas: indicadores que la organización compone sobre métricas ya
 * certificadas, sin escribir SQL.
 *
 * El cálculo ocurre AQUÍ, en código, no en una consulta generada: se leen los dos
 * operandos de `oro.metrica_valor` con las plantillas constantes de siempre y se
 * combinan por (empresa, período). Así una métrica derivada no puede introducir
 * SQL arbitrario ni saltarse el filtro de empresas (CLAUDE.md §11 y §14).
 *
 * Autorización: una derivada exige alcance sobre TODOS sus operandos. Sin esa
 * regla, componer sería un rodeo para leer una métrica no autorizada.
 */
import { SQL_DERIVADAS } from './tools/consultas';
import type { EjecutorSql, MetricaAutorizada } from './tipos';

export type OperacionDerivada = 'razon' | 'porcentaje' | 'suma' | 'resta';

export interface MetricaDerivada {
  clave: string;
  nombre: string;
  definicion: string;
  operacion: OperacionDerivada;
  operandoA: string;
  operandoB: string;
  unidad: 'numero' | 'moneda' | 'porcentaje';
}

/** Derivadas activas del tenant. Si la tabla no existe todavía, no hay ninguna. */
export async function leerDerivadas(ejecutor: EjecutorSql): Promise<MetricaDerivada[]> {
  const filas = await ejecutor.consultarTenant(SQL_DERIVADAS, []).catch(() => []);
  return filas.map((f) => ({
    clave: String(f['clave']),
    nombre: String(f['nombre']),
    definicion: String(f['definicion'] ?? ''),
    operacion: String(f['operacion']) as OperacionDerivada,
    operandoA: String(f['operando_a']),
    operandoB: String(f['operando_b']),
    unidad: (String(f['unidad']) || 'numero') as MetricaDerivada['unidad'],
  }));
}

/**
 * Combina los valores de los dos operandos por (empresa, período).
 *
 * Sólo se emite resultado donde EXISTEN ambos operandos: si un mes tiene ventas y
 * no tiene costo, el margen de ese mes no es cero, es desconocido, e inventarlo
 * sería el peor error posible en una plataforma que vende certeza en el número.
 *
 * La división por cero devuelve `null` por la misma razón.
 */
export function combinar(
  operacion: OperacionDerivada,
  valoresA: Map<string, number>,
  valoresB: Map<string, number>,
): Map<string, number> {
  const resultado = new Map<string, number>();
  for (const [llave, a] of valoresA) {
    const b = valoresB.get(llave);
    if (b === undefined) continue;
    const valor = aplicar(operacion, a, b);
    if (valor !== null) resultado.set(llave, valor);
  }
  return resultado;
}

function aplicar(operacion: OperacionDerivada, a: number, b: number): number | null {
  switch (operacion) {
    case 'suma':
      return a + b;
    case 'resta':
      return a - b;
    case 'razon':
      return b === 0 ? null : a / b;
    case 'porcentaje':
      return b === 0 ? null : (a / b) * 100;
  }
}

/**
 * Convierte una derivada en la ficha que consume el resto del agente, heredando
 * el estado MENOS certificado de sus operandos: un resultado no puede ser más
 * fiable que sus partes.
 *
 * Devuelve null si algún operando no está en el alcance del usuario — es la guarda
 * que impide usar la composición como rodeo de autorización.
 */
export function fichaDerivada(
  derivada: MetricaDerivada,
  autorizadas: Map<string, MetricaAutorizada>,
): MetricaAutorizada | null {
  const a = autorizadas.get(derivada.operandoA);
  const b = autorizadas.get(derivada.operandoB);
  if (!a || !b) return null;

  const estado = a.estado === 'exploratoria' || b.estado === 'exploratoria'
    ? 'exploratoria'
    : 'certificada';

  // El período con datos de la derivada es la INTERSECCIÓN: donde falta un operando
  // no hay resultado que dar.
  const desde = maximo(a.periodoDesde, b.periodoDesde);
  const hasta = minimo(a.periodoHasta, b.periodoHasta);

  return {
    clave: derivada.clave,
    nombreOficial: derivada.nombre,
    definicionNegocio: `${derivada.definicion} (definida por la organización a partir de ${a.nombreOficial} y ${b.nombreOficial}).`,
    dominio: a.dominio,
    estado,
    periodoDesde: desde,
    periodoHasta: hasta,
  };
}

function maximo(x: string | null, y: string | null): string | null {
  if (x === null || y === null) return null;
  return x > y ? x : y;
}

function minimo(x: string | null, y: string | null): string | null {
  if (x === null || y === null) return null;
  return x < y ? x : y;
}

/** Cómo se calcula, en palabras: el modelo lo cita y el usuario lo entiende. */
export function descripcionOperacion(
  operacion: OperacionDerivada,
  nombreA: string,
  nombreB: string,
): string {
  switch (operacion) {
    case 'suma':
      return `${nombreA} más ${nombreB}`;
    case 'resta':
      return `${nombreA} menos ${nombreB}`;
    case 'razon':
      return `${nombreA} dividido entre ${nombreB}`;
    case 'porcentaje':
      return `${nombreA} dividido entre ${nombreB}, expresado en porcentaje`;
  }
}
