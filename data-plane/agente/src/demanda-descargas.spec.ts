/**
 * Demanda no atendida y descargas autoservicio: las mismas guardas de §11 aplicadas a
 * dos caminos nuevos que NO pasan por el modelo para ejecutarse (la descarga) o que
 * no consultan nada (la solicitud). Sin base de datos: ejecutor falso.
 */
import { acotarTexto } from './agente';
import { prepararDescarga, TOPE_FILAS_DESCARGA } from './descargas';
import { ejecutarTool } from './tools/ejecutar';
import type { AlcanceEfectivo, EjecutorSql, MetricaAutorizada } from './tipos';

function metrica(clave: string, dominio: string, estado: 'certificada' | 'exploratoria' = 'certificada'): MetricaAutorizada {
  return { clave, nombreOficial: clave, definicionNegocio: 'definición', dominio, estado, periodoDesde: '2026-01', periodoHasta: '2026-08' };
}

function alcanceCon(metricas: MetricaAutorizada[], empresas: '*' | string[], desglosables: Record<string, string[]> = {}): AlcanceEfectivo {
  return {
    metricas: new Map(metricas.map((m) => [m.clave, m])),
    empresas,
    derivadas: new Map(),
    desglosables: new Map(Object.entries(desglosables)),
  };
}

/** Ejecutor falso que responde por consulta: alcances del usuario, catálogo, dominios, períodos… */
function ejecutorPara(opciones: {
  alcances: { recurso_tipo: string; recurso_clave: string }[];
  consumibles: { clave: string; nombre_oficial: string; definicion_negocio: string; estado: string }[];
  dominios: { metrica_clave: string; dominio: string }[];
  desglosables?: { metrica_clave: string; dimension: string }[];
  datos?: Record<string, unknown>[];
}): EjecutorSql & { llamadas: { sql: string; params: unknown[] }[] } {
  const llamadas: { sql: string; params: unknown[] }[] = [];
  return {
    llamadas,
    async consultarTenant(sql, params) {
      llamadas.push({ sql, params });
      if (sql.includes('portal.perfil_alcances')) return opciones.alcances;
      if (sql.includes('oro.metrica_dimension_catalogo')) return opciones.desglosables ?? [];
      if (sql.includes('select distinct metrica_clave, dominio')) return opciones.dominios;
      if (sql.includes('min(periodo) as periodo_desde')) return [];
      if (sql.includes('portal.metricas_derivadas')) return [];
      if (sql.includes('select distinct empresa_id')) return [{ empresa_id: 'ironnetwork' }];
      return opciones.datos ?? [];
    },
    async consultarControl(sql, params) {
      llamadas.push({ sql, params });
      if (sql.includes('metadatos.catalogo_metricas')) return opciones.consumibles;
      return [];
    },
  };
}

const empresas = new Map([['ironnetwork', 'Iron Network']]);

describe('Demanda no atendida — registrar_solicitud', () => {
  const alcance = alcanceCon([metrica('ventas_netas_sin_iva', 'ventas')], ['ironnetwork'], { ventas_netas_sin_iva: ['cliente'] });
  const ejecutor = ejecutorPara({ alcances: [], consumibles: [], dominios: [] });

  it('registra la solicitud sin tocar la base y la devuelve para el host', async () => {
    const r = await ejecutarTool('registrar_solicitud', { tipo: 'frescura', resumen: 'Ventas de hoy; el corte es de ayer', dominio: 'ventas' }, { ejecutor, alcance, empresas });
    expect(r.esError).toBe(false);
    expect(r.solicitud).toEqual({ tipo: 'frescura', resumen: 'Ventas de hoy; el corte es de ayer', metricaClave: null, dominio: 'ventas', origen: 'tool' });
    expect(ejecutor.llamadas).toHaveLength(0);
    expect(r.auditoria.accion).toBe('solicitud_no_atendida');
  });

  it('rechaza un tipo fuera del enum o un resumen vacío', async () => {
    const r1 = await ejecutarTool('registrar_solicitud', { tipo: 'sql_libre', resumen: 'dame la tabla' }, { ejecutor, alcance, empresas });
    const r2 = await ejecutarTool('registrar_solicitud', { tipo: 'otro', resumen: 'x' }, { ejecutor, alcance, empresas });
    expect(r1.esError).toBe(true);
    expect(r2.esError).toBe(true);
    expect(r1.solicitud).toBeUndefined();
  });

  it('una métrica fuera del alcance deja una solicitud sin_autorizacion deducida por el código', async () => {
    const r = await ejecutarTool('consultar_metrica', { metrica_clave: 'saldo_cxc' }, { ejecutor, alcance, empresas });
    expect(r.esError).toBe(true);
    expect(r.solicitud?.tipo).toBe('sin_autorizacion');
    expect(r.solicitud?.metricaClave).toBe('saldo_cxc');
    expect(r.solicitud?.origen).toBe('denegacion');
  });

  it('un parámetro mal formado por el modelo NO es demanda del usuario', async () => {
    const r = await ejecutarTool('consultar_metrica', { metrica_clave: 'ventas_netas_sin_iva', periodo_desde: '2026/01' }, { ejecutor, alcance, empresas });
    expect(r.esError).toBe(true);
    expect(r.solicitud).toBeUndefined();
  });

  it('un desglose que la métrica no admite deja una solicitud desglose_no_admitido', async () => {
    const r = await ejecutarTool('consultar_metrica_por_dimension', { metrica_clave: 'ventas_netas_sin_iva', dimension: 'proveedor' }, { ejecutor, alcance, empresas });
    expect(r.esError).toBe(true);
    expect(r.solicitud?.tipo).toBe('desglose_no_admitido');
    expect(ejecutor.llamadas).toHaveLength(0);
  });
});

describe('Descargas autoservicio — mismas guardas, sin modelo', () => {
  const base = {
    alcances: [
      { recurso_tipo: 'empresa', recurso_clave: 'ironnetwork' },
      { recurso_tipo: 'dominio', recurso_clave: 'ventas' },
    ],
    consumibles: [
      { clave: 'ventas_netas_sin_iva', nombre_oficial: 'Ventas netas', definicion_negocio: 'd', estado: 'certificada' },
      { clave: 'saldo_cxc', nombre_oficial: 'Saldo por cobrar', definicion_negocio: 'd', estado: 'certificada' },
      { clave: 'backlog', nombre_oficial: 'Backlog', definicion_negocio: 'd', estado: 'exploratoria' },
    ],
    dominios: [
      { metrica_clave: 'ventas_netas_sin_iva', dominio: 'ventas' },
      { metrica_clave: 'saldo_cxc', dominio: 'tesoreria' },
      { metrica_clave: 'backlog', dominio: 'pedidos' },
    ],
    desglosables: [{ metrica_clave: 'ventas_netas_sin_iva', dimension: 'cliente' }],
  };

  it('rechaza parámetros fuera del contrato antes de resolver el alcance', async () => {
    const ejecutor = ejecutorPara(base);
    const r = await prepararDescarga({ ejecutor, usuarioId: 1, empresas, params: { metricas: ['ventas; drop table'], nivel: 'mensual' } });
    expect(r.ok).toBe(false);
    expect(ejecutor.llamadas).toHaveLength(0);
  });

  it('una métrica fuera del alcance (dominio no autorizado) se rechaza aunque esté certificada', async () => {
    const ejecutor = ejecutorPara(base);
    const r = await prepararDescarga({ ejecutor, usuarioId: 1, empresas, params: { metricas: ['saldo_cxc'], nivel: 'mensual' } });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('saldo_cxc');
    expect(ejecutor.llamadas.some((l) => l.sql.includes('oro.metrica_valor') && l.sql.includes('metrica_clave = $1'))).toBe(false);
  });

  it('el nivel por dimensión ejecuta SQL constante con las empresas del alcance y el tope de filas', async () => {
    const ejecutor = ejecutorPara({ ...base, datos: [{ empresa_id: 'ironnetwork', periodo: '2026-03', miembro_codigo: 'C1', miembro_nombre: 'Cliente Uno', valor: '1200.5' }] });
    const r = await prepararDescarga({
      ejecutor, usuarioId: 1, empresas,
      params: { metricas: ['ventas_netas_sin_iva'], nivel: 'mensual_dimension', dimension: 'cliente', periodo_desde: '2026-01', periodo_hasta: '2026-06' },
    });
    expect(r.ok).toBe(true);
    const consulta = ejecutor.llamadas.find((l) => l.sql.includes('oro.metrica_valor_dimension') && l.sql.includes('limit $6'));
    expect(consulta).toBeDefined();
    expect(consulta?.params).toEqual(['ventas_netas_sin_iva', 'cliente', '2026-01', '2026-06', ['ironnetwork'], TOPE_FILAS_DESCARGA]);
    expect(r.hojas[0]?.filas[0]).toEqual({ periodo: '2026-03', empresa: 'Iron Network', codigo: 'C1', miembro: 'Cliente Uno', valor: 1200.5 });
    expect(r.hojas[0]?.estado).toBe('certificada');
    expect(r.auditoria.accion).toBe('descarga_datos');
  });

  it('un desglose que la métrica no admite se rechaza sin consultar datos', async () => {
    const ejecutor = ejecutorPara(base);
    const r = await prepararDescarga({ ejecutor, usuarioId: 1, empresas, params: { metricas: ['ventas_netas_sin_iva'], nivel: 'dimension_total', dimension: 'proveedor' } });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('proveedor');
  });

  it('la antigüedad de cartera solo se descarga para los saldos de cartera', async () => {
    const ejecutor = ejecutorPara(base);
    const r = await prepararDescarga({ ejecutor, usuarioId: 1, empresas, params: { metricas: ['ventas_netas_sin_iva'], nivel: 'aging_rango' } });
    expect(r.ok).toBe(false);
  });

  it('una empresa fuera del alcance se rechaza antes de tocar los datos', async () => {
    const ejecutor = ejecutorPara(base);
    const r = await prepararDescarga({ ejecutor, usuarioId: 1, empresas: new Map([...empresas, ['cresta', 'Cresta']]), params: { metricas: ['ventas_netas_sin_iva'], nivel: 'mensual', empresa_id: 'cresta' } });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('cresta');
  });

  it('el estado exploratoria viaja en la hoja para marcarla en el archivo', async () => {
    const ejecutor = ejecutorPara({ ...base, alcances: [...base.alcances, { recurso_tipo: 'dominio', recurso_clave: 'pedidos' }], datos: [{ empresa_id: 'ironnetwork', periodo: '2026-03', valor: '10' }] });
    const r = await prepararDescarga({ ejecutor, usuarioId: 1, empresas, params: { metricas: ['backlog', 'ventas_netas_sin_iva'], nivel: 'mensual' } });
    expect(r.ok).toBe(true);
    expect(r.hojas.map((h) => h.estado)).toEqual(['exploratoria', 'certificada']);
    expect(r.hojas[0]?.filas).toEqual([{ periodo: '2026-03', valor: 10 }]);
  });
});

describe('Respuestas cortas — cinturón de longitud', () => {
  it('deja pasar un texto corto tal cual', () => {
    expect(acotarTexto('Ventas netas de octubre: 269.586, certificada.', 900)).toBe('Ventas netas de octubre: 269.586, certificada.');
  });
  it('recorta en el último fin de frase que cabe', () => {
    const largo = `${'Primera frase con dato. '.repeat(30)}Última frase que no cabe`;
    const r = acotarTexto(largo, 200);
    expect(r.length).toBeLessThanOrEqual(200);
    expect(r.endsWith('.')).toBe(true);
  });
  it('sin puntos, corta en seco y lo marca', () => {
    expect(acotarTexto('x'.repeat(50), 20)).toBe(`${'x'.repeat(20)}…`);
  });
});
