/**
 * Las cuatro restricciones duras de CLAUDE.md §11, probadas SIN base de datos
 * (ejecutor falso). Si un cambio futuro las rompe, estos tests fallan.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolverAlcance } from './alcances';
import { ejecutarTool } from './tools/ejecutar';
import type { AlcanceEfectivo, EjecutorSql, MetricaAutorizada } from './tipos';

// ---------------------------------------------------------------- utilidades

function metrica(clave: string, dominio: string, estado: 'certificada' | 'exploratoria' = 'certificada'): MetricaAutorizada {
  return {
    clave,
    nombreOficial: clave,
    definicionNegocio: 'definición',
    dominio,
    estado,
    periodoDesde: '2026-01',
    periodoHasta: '2026-08',
  };
}

function alcanceCon(metricas: MetricaAutorizada[], empresas: '*' | string[]): AlcanceEfectivo {
  return { metricas: new Map(metricas.map((m) => [m.clave, m])), empresas };
}

/** Ejecutor falso: registra el SQL y los parámetros que recibió. */
function ejecutorFalso(filas: Record<string, unknown>[] = []): EjecutorSql & {
  llamadas: { sql: string; params: unknown[] }[];
} {
  const llamadas: { sql: string; params: unknown[] }[] = [];
  return {
    llamadas,
    async consultarTenant(sql, params) {
      llamadas.push({ sql, params });
      return filas;
    },
    async consultarControl(sql, params) {
      llamadas.push({ sql, params });
      return filas;
    },
  };
}

const ctx = (alcance: AlcanceEfectivo, ejecutor: EjecutorSql) => ({
  ejecutor,
  alcance,
  empresas: new Map([
    ['proavisa', 'Empresa Uno'],
    ['loreto', 'Empresa Dos'],
  ]),
});

// ---------------------------------------------------------------- guarda 1

describe('Guarda 1 — sin SQL libre', () => {
  it('todo el SQL es constante: ninguna consulta lleva interpolación', () => {
    const fuente = readFileSync(join(__dirname, 'tools', 'consultas.ts'), 'utf8');
    // Solo el cuerpo de las plantillas SQL (entre acentos graves); los
    // comentarios del archivo quedan fuera. Las consultas usan placeholders
    // $1..$n: una interpolación sería la puerta a SQL armado con datos del LLM.
    const plantillas = fuente.match(/`[^`]*`/g) ?? [];
    expect(plantillas.length).toBeGreaterThan(5);
    for (const sql of plantillas) {
      expect(sql).not.toContain('${');
    }
  });

  it('rechaza una clave de métrica con intento de inyección', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], '*');
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: "x'; DROP TABLE oro.metrica_valor; --" },
      ctx(alcance, ejecutorFalso()),
    );
    expect(r.esError).toBe(true);
    expect(r.auditoria.accion).toBe('consulta_agente_denegada');
  });

  it('rechaza parámetros fuera del contrato', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], '*');
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'ventas_netas_sin_iva', tabla: 'bronce.oinv' },
      ctx(alcance, ejecutorFalso()),
    );
    expect(r.esError).toBe(true);
  });
});

// ---------------------------------------------------------------- guarda 2

describe('Guarda 2 — solo métricas consumibles', () => {
  it('el catálogo se lee filtrando estado certificada/exploratoria', () => {
    const fuente = readFileSync(join(__dirname, 'tools', 'consultas.ts'), 'utf8');
    expect(fuente).toContain("estado in ('certificada', 'exploratoria')");
  });

  it('una métrica fuera del alcance efectivo se rechaza aunque exista la clave', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], '*');
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'saldo_cxc' },
      ctx(alcance, ejecutorFalso()),
    );
    expect(r.esError).toBe(true);
    expect(r.contenido).toContain('no está disponible');
  });

  it('el estado exploratoria viaja en la tarjeta para poder marcarlo', async () => {
    const alcance = alcanceCon([metrica('backlog', 'pedidos', 'exploratoria')], '*');
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'backlog' },
      ctx(alcance, ejecutorFalso([{ empresa_id: 'proavisa', periodo: '2026-07', valor: 100 }])),
    );
    expect(r.esError).toBe(false);
    expect(r.tarjetas[0]?.estado).toBe('exploratoria');
  });
});

// ---------------------------------------------------------------- guarda 3

describe('Guarda 3 — alcance de empresas siempre aplicado', () => {
  // Regresión: `empresa_id` es TEXTO en todo el modelo Oro (la clave de sociedad del
  // ERP). Castearlo a bigint hacía que Postgres abortara con «operator does not exist:
  // text = bigint» y el agente no devolvía una sola fila en ningún tenant. Los tests
  // no lo vieron porque el ejecutor falso devolvía ids numéricos que la base nunca da.
  it('el filtro de empresa se compara como texto, nunca como entero', () => {
    const fuente = readFileSync(join(__dirname, 'tools', 'consultas.ts'), 'utf8');
    expect(fuente).not.toMatch(/::(big)?int\[\]/);
    expect(fuente).toContain('::text[]');
  });

  it('toda consulta al warehouse lleva el arreglo de empresas autorizadas', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], ['proavisa']);
    const ejecutor = ejecutorFalso([{ empresa_id: 'proavisa', periodo: '2026-07', valor: 500 }]);
    await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'ventas_netas_sin_iva' },
      ctx(alcance, ejecutor),
    );
    const llamada = ejecutor.llamadas[0];
    expect(llamada?.sql).toContain('empresa_id = any($4::text[])');
    expect(llamada?.params[3]).toEqual(['proavisa']);
  });

  it('pedir una empresa fuera del alcance se deniega antes de tocar la base', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], ['proavisa']);
    const ejecutor = ejecutorFalso();
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'ventas_netas_sin_iva', empresa_id: 'loreto' },
      ctx(alcance, ejecutor),
    );
    expect(r.esError).toBe(true);
    expect(ejecutor.llamadas).toHaveLength(0);
    expect(r.auditoria.accion).toBe('consulta_agente_denegada');
  });

  it('sin empresas autorizadas no se devuelve ni una fila (fail-closed)', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], []);
    const ejecutor = ejecutorFalso();
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'ventas_netas_sin_iva' },
      ctx(alcance, ejecutor),
    );
    expect(r.esError).toBe(true);
    expect(ejecutor.llamadas).toHaveLength(0);
  });

  it('el alcance efectivo es fail-closed cuando el perfil no declara empresa', async () => {
    const ejecutor: EjecutorSql = {
      async consultarTenant(sql) {
        if (sql.includes('perfil_alcances')) {
          return [{ recurso_tipo: 'dominio', recurso_clave: 'ventas' }];
        }
        if (sql.includes('distinct metrica_clave')) {
          return [{ metrica_clave: 'ventas_netas_sin_iva', dominio: 'ventas' }];
        }
        return [];
      },
      async consultarControl() {
        return [
          {
            clave: 'ventas_netas_sin_iva',
            nombre_oficial: 'Ventas netas',
            definicion_negocio: 'd',
            estado: 'certificada',
          },
        ];
      },
    };
    const alcance = await resolverAlcance(ejecutor, 1);
    expect(alcance.empresas).toEqual([]);
    expect(alcance.metricas.has('ventas_netas_sin_iva')).toBe(true);
  });
});

// ---------------------------------------------------------------- guarda 5

describe('Guarda 5 — dato + métrica + período + estado', () => {
  it('cada tarjeta trae los cuatro campos, tomados del catálogo y del SQL', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], '*');
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'ventas_netas_sin_iva' },
      ctx(alcance, ejecutorFalso([
        { empresa_id: 'proavisa', periodo: '2026-06', valor: 1000 },
        { empresa_id: 'loreto', periodo: '2026-06', valor: 500 },
      ])),
    );
    expect(r.tarjetas).toHaveLength(1);
    const t = r.tarjetas[0]!;
    expect(t.metricaClave).toBe('ventas_netas_sin_iva');
    expect(t.metricaNombre).toBeTruthy();
    expect(t.periodo).toBe('2026-06');
    expect(t.valor).toBe(1500); // suma de las dos empresas
    expect(t.estado).toBe('certificada');
  });

  it('agrupar por empresa produce una tarjeta por empresa con su nombre', async () => {
    const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], '*');
    const r = await ejecutarTool(
      'consultar_metrica',
      { metrica_clave: 'ventas_netas_sin_iva', agrupar_por_empresa: true },
      ctx(alcance, ejecutorFalso([
        { empresa_id: 'proavisa', periodo: '2026-06', valor: 1000 },
        { empresa_id: 'loreto', periodo: '2026-06', valor: 500 },
      ])),
    );
    expect(r.tarjetas).toHaveLength(2);
    expect(r.tarjetas.map((t) => t.empresa)).toEqual(['Empresa Uno', 'Empresa Dos']);
  });
});
