// Genera las páginas de VENTAS del reporte PBIR replicando los tableros "Histórico de Ventas" y
// "Seguimiento de Ventas" de Kraken 360 (docs/powerbi/kraken360/inventario.md).
//
// Uso:  node generar_paginas_ventas.js <ruta al .Report> [mes_actual yyyy-MM] [anio_actual]
//
// Determinista: ids sha1 fijos por (página, clave) — re-ejecutar produce archivos idénticos.
// Nunca se tocan páginas ajenas a este generador: solo se reescriben las suyas.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPORT = path.resolve(process.argv[2] || '');
if (!REPORT || !fs.existsSync(path.join(REPORT, 'definition', 'pages'))) {
  console.error('FALLO · indicá la ruta al .Report en formato PBIR (definition/pages)');
  process.exit(1);
}
const hoy = new Date();
const MES_ACTUAL = process.argv[3] || `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
const ANIO_ACTUAL = Number(process.argv[4] || hoy.getFullYear());

const VC_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json';
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json';
const PAGES_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json';

// Lienzo: 1280 × 960 — tres filas de análisis (Kraken trae más visuales de los que caben en 720).
const W = 1280, H = 960;
const FILA = [216, 464, 712]; // y de cada fila de análisis (alto 232)
const ALTO = 232;

// ---- tablas y campos del modelo (nombres del TMDL generado por generar_pbip.py) ----
const VENTAS = 'FC_Ventas';
const CAL = 'DM_Calendario';
const CLI = 'DM_Cliente';
const PROD = 'DM_Producto';
const VEND = 'DM_Vendedor';
const BOD = 'DM_Bodega';
const DIR = 'DM_Dirección de entrega';
const EMP = 'DM_Empresa';
const MONEDA = 'MD_Moneda de análisis';
const VISTA = 'MD_Vista de ventas';
const CARGA = 'FC_Estado de carga';

// Tokens neutros del tema (sin inventar colores: el resto lo pinta el tema del producto).
const GRIS_SERIE = '#c9ced6';
const TINTA_SUAVE = '#8a9099';
const BLANCO = '#ffffff';

// ---- grilla del contrato visual ----
const xCol = (n) => 24 + (n - 1) * 104;
const wCol = (n) => 104 * n - 16;

// ---- primitivas PBIR ----
const id = (...partes) => crypto.createHash('sha1').update('quilate:' + partes.join(':')).digest('hex').slice(0, 20);
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const str = (s) => lit(`'${String(s).replace(/'/g, "''")}'`);
const num = (n) => lit(`${n}D`);
const int = (n) => lit(`${n}L`);
const bool = (b) => lit(`${b}`);
const color = (hex) => ({ solid: { color: lit(`'${hex}'`) } });
const sel = (i) => ({ id: i });
const campoMedida = (t, m) => ({ Measure: { Expression: { SourceRef: { Entity: t } }, Property: m } });
const campoColumna = (t, c) => ({ Column: { Expression: { SourceRef: { Entity: t } }, Property: c } });
const proy = (campo, t, n, activa) => {
  const p = { field: campo, queryRef: `${t}.${n}`, nativeQueryRef: n };
  if (activa) p.active = true;
  return p;
};
const pMedida = (t, m) => proy(campoMedida(t, m), t, m);
const pColumna = (t, c, activa) => proy(campoColumna(t, c), t, c, activa);

let z = 0, tab = 0;
function visual(nombre, tipo, [x, y, w, h], { roles, objects, vc, extra, sync } = {}) {
  z += 100; tab += 1;
  const v = { visualType: tipo };
  if (roles) v.query = { queryState: Object.fromEntries(Object.entries(roles).map(([r, ps]) => [r, { projections: ps }])) };
  if (extra && extra.sortDefinition) { v.query = v.query || {}; v.query.sortDefinition = extra.sortDefinition; extra = { ...extra }; delete extra.sortDefinition; }
  if (extra) Object.assign(v, extra);
  if (objects) v.objects = objects;
  if (vc) v.visualContainerObjects = vc;
  v.drillFilterOtherVisuals = true;
  const c = { $schema: VC_SCHEMA, name: nombre, position: { x, y, z, height: h, width: w, tabOrder: tab }, visual: v };
  if (sync) v.syncGroup = { groupName: sync, fieldChanges: true, filterChanges: true };
  return c;
}
const vcTitulo = (texto, subtitulo) => {
  const t = (v) => (typeof v === 'string' ? str(v) : v);
  const vc = { title: [{ properties: { show: bool(true), text: t(texto) } }] };
  if (subtitulo) vc.subTitle = [{ properties: { show: bool(true), text: t(subtitulo) } }];
  return vc;
};
const vcDesnudo = {
  background: [{ properties: { show: bool(false) } }],
  border: [{ properties: { show: bool(false) } }],
  visualHeader: [{ properties: { show: bool(false) } }],
  padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
};
const ordenDesc = (t, m) => ({ sortDefinition: { sort: [{ field: campoMedida(t, m), direction: 'Descending' }], isDefaultSort: true } });
const ordenAsc = (t, c) => ({ sortDefinition: { sort: [{ field: campoColumna(t, c), direction: 'Ascending' }], isDefaultSort: true } });

// ---- fábricas de visuales ----
function banda(slug) {
  return visual(id(slug, 'chrome-banda'), 'shape', [0, 0, W, 72], {
    objects: { shape: [{ properties: { tileShape: str('rectangle') } }] }, vc: vcDesnudo,
  });
}
function tituloPagina(slug, tabla, medida) {
  return visual(id(slug, 'chrome-titulo'), 'cardVisual', [24, 8, 608, 56], {
    roles: { Data: [pMedida(tabla, medida)] },
    objects: {
      value: [{ properties: { fontSize: num(15), fontFamily: str('Segoe UI Semibold'), fontColor: color(BLANCO), horizontalAlignment: str('left') }, selector: sel('default') }],
      label: [{ properties: { show: bool(false) }, selector: sel('default') }],
      outline: [{ properties: { show: bool(false) }, selector: sel('default') }],
      fillCustom: [{ properties: { show: bool(false) } }, { properties: { show: bool(false) }, selector: sel('default') }],
      padding: [{ properties: { paddingUniform: int(0) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(0), backgroundShow: bool(false) }, selector: sel('default') }],
      spacing: [{ properties: { verticalSpacing: num(0) }, selector: sel('default') }],
    },
    vc: vcDesnudo,
  });
}
function navegador(slug) {
  return visual(id(slug, 'chrome-nav'), 'pageNavigator', [648, 20, 504, 32], {
    objects: {
      fill: [
        { properties: { show: bool(true) } },
        { properties: { show: bool(true), fillColor: color(BLANCO), transparency: num(92) }, selector: sel('default') },
        { properties: { show: bool(true), fillColor: color(BLANCO), transparency: num(75) }, selector: sel('selected') },
      ],
      text: [
        { properties: { fontColor: color(BLANCO), fontSize: num(10), fontFamily: str('Segoe UI Semibold') } },
        { properties: { fontColor: color(BLANCO), fontSize: num(10), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') },
        { properties: { fontColor: color(BLANCO), bold: bool(true) }, selector: sel('selected') },
      ],
      outline: [
        { properties: { show: bool(false) } },
        { properties: { show: bool(false) }, selector: sel('default') },
        { properties: { show: bool(false) }, selector: sel('selected') },
        { properties: { show: bool(false) }, selector: sel('hover') },
      ],
    },
    vc: vcDesnudo,
  });
}
function pie(slug) {
  return visual(id(slug, 'chrome-pie'), 'cardVisual', [24, H - 24, 1256, 24], {
    roles: { Data: [pMedida(CARGA, 'Pie de frescura')] },
    objects: {
      value: [{ properties: { fontSize: num(9), fontColor: color(TINTA_SUAVE), horizontalAlignment: str('left') }, selector: sel('default') }],
      label: [{ properties: { show: bool(false) }, selector: sel('default') }],
      outline: [{ properties: { show: bool(false) }, selector: sel('default') }],
      padding: [{ properties: { paddingUniform: int(0) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(0), backgroundShow: bool(false) }, selector: sel('default') }],
    },
    vc: vcDesnudo,
  });
}

// Segmentador. modo: Dropdown | VerticalList. seleccion: valor inicial (string o {int}).
function segmentador(slug, clave, tabla, columna, pos, { modo = 'Dropdown', seleccion, sync, busqueda = false, titulo } = {}) {
  const general = { properties: {} };
  if (seleccion !== undefined) {
    const valor = typeof seleccion === 'number' ? `${seleccion}L` : `'${seleccion}'`;
    general.properties.filter = { filter: {
      Version: 2,
      From: [{ Name: 't', Entity: tabla, Type: 0 }],
      Where: [{ Condition: { In: {
        Expressions: [{ Column: { Expression: { SourceRef: { Source: 't' } }, Property: columna } }],
        Values: [[{ Literal: { Value: valor } }]],
      } } }],
    } };
  }
  if (busqueda) general.properties.selfFilterEnabled = bool(true);
  const objects = {
    data: [{ properties: { mode: str(modo) } }],
    general: [general],
    header: [{ properties: { show: bool(Boolean(titulo)), ...(titulo ? { text: str(titulo) } : {}) } }],
  };
  return visual(id(slug, clave), 'slicer', pos, {
    roles: { Values: [pColumna(tabla, columna, true)] },
    objects,
    extra: { expansionStates: [{ roles: ['Values'], levels: [{ queryRefs: [`${tabla}.${columna}`], isCollapsed: true, isPinned: true }], root: {} }] },
    sync,
  });
}

// Tarjeta multi-KPI (una fila de valores con etiqueta), estilo tabla del piloto 00.
function kpis(slug, clave, medidas, pos, titulo) {
  return visual(id(slug, clave), 'cardVisual', pos, {
    roles: { Data: medidas.map(([t, m]) => pMedida(t, m)) },
    objects: {
      value: [{ properties: { fontSize: num(20), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') }],
      label: [{ properties: { show: bool(true), fontSize: num(10) }, selector: sel('default') }],
      outline: [{ properties: { show: bool(false) }, selector: sel('default') }],
      padding: [{ properties: { paddingUniform: int(6) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(6), style: str('Table'), customizeLines: bool(true), gridlineWidth: num(1), gridlineColor: color('#e3e6eb'), gridlineStyle: str('solid') }, selector: sel('default') }],
      spacing: [{ properties: { verticalSpacing: num(2) }, selector: sel('default') }],
    },
    vc: titulo ? vcTitulo(titulo) : { title: [{ properties: { show: bool(false) } }] },
  });
}

// Barras horizontales por categoría, orden descendente por la medida.
function barras(slug, clave, pos, tabla, columna, titulo, medida = 'Ventas netas') {
  return visual(id(slug, clave), 'barChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(VENTAS, medida)] },
    extra: ordenDesc(VENTAS, medida),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false) } }],
      labels: [{ properties: { show: bool(true), labelPosition: str('OutsideEnd') } }],
      legend: [{ properties: { show: bool(false) } }],
    },
    vc: vcTitulo(titulo),
  });
}
function dona(slug, clave, pos, tabla, columna, titulo, medida = 'Ventas netas') {
  return visual(id(slug, clave), 'donutChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(VENTAS, medida)] },
    extra: ordenDesc(VENTAS, medida),
    objects: {
      legend: [{ properties: { show: bool(false) } }],
      labels: [{ properties: { show: bool(true), labelStyle: str('Both') } }],
    },
    vc: vcTitulo(titulo),
  });
}

// ============================================================ PÁGINA 01 · HISTÓRICO DE VENTAS
function pagina01() {
  const slug = 'ventas-historico';
  z = 0; tab = 0;
  const vs = [];
  vs.push(banda(slug), tituloPagina(slug, VENTAS, 'Título de Histórico de ventas'), navegador(slug));

  // --- KPIs: año · resultado del año · moneda · vista
  vs.push(segmentador(slug, 'anio', CAL, 'anio', [xCol(1), 88, wCol(2), 112], { seleccion: ANIO_ACTUAL, sync: 'anio', titulo: 'Año' }));
  vs.push(kpis(slug, 'resultado-anio', [
    [VENTAS, 'Ventas acumuladas año'],
    [VENTAS, 'Variación acumulada vs año anterior'],
    [VENTAS, 'Documentos de venta'],
    [VENTAS, 'Clientes con venta'],
    [VENTAS, 'Productos vendidos'],
    [VENTAS, 'Ticket promedio'],
  ], [xCol(3), 88, wCol(7), 112], 'Resultado del año'));
  vs.push(segmentador(slug, 'moneda', MONEDA, 'Moneda de análisis', [xCol(10), 88, 136, 112], { sync: 'moneda', titulo: 'Moneda' }));
  vs.push(segmentador(slug, 'vista', VISTA, 'Vista de ventas', [xCol(10) + 152, 88, 144, 112], { sync: 'vista', titulo: 'Medida' }));

  // --- Fila 1: columnas mensuales (año actual vs anterior en gris) · dona sucursal
  vs.push(visual(id(slug, 'mensual'), 'clusteredColumnChart', [xCol(1), FILA[0], wCol(9), ALTO], {
    roles: {
      Category: [pColumna(CAL, 'mes_nombre_corto')],
      Y: [pMedida(VENTAS, 'Ventas año anterior'), pMedida(VENTAS, 'Ventas netas')],
      Tooltips: [pMedida(VENTAS, 'Variación vs año anterior')],
    },
    extra: ordenAsc(CAL, 'mes_nombre_corto'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false) } }],
      labels: [{ properties: { show: bool(true), labelPosition: str('OutsideEnd') } }],
      legend: [{ properties: { show: bool(true), position: str('Top') } }],
      dataPoint: [{ properties: { fill: color(GRIS_SERIE) }, selector: { metadata: `${VENTAS}.Ventas año anterior` } }],
    },
    vc: vcTitulo('Venta histórica por mes y variación año con año', 'Columna gris: mismo mes del año anterior · variación en la etiqueta y el tooltip'),
  }));
  vs.push(dona(slug, 'sucursal', [xCol(10), FILA[0], wCol(3), ALTO], BOD, 'nombre', 'Venta por sucursal'));

  // --- Fila 2: matrices año × mes (montos y variación) · dona línea
  const matriz = (clave, medida, y, h, titulo) => visual(id(slug, clave), 'pivotTable', [xCol(1), y, wCol(9), h], {
    roles: { Rows: [pColumna(CAL, 'anio')], Columns: [pColumna(CAL, 'mes_nombre_corto')], Values: [pMedida(VENTAS, medida)] },
    objects: {
      columnHeaders: [{ properties: { columnAdjustment: str('growToFit'), autoSizeColumnWidth: bool(true) } }],
      subTotals: [
        { properties: { rowSubtotals: bool(false), columnSubtotals: bool(true), columnSubtotalsLabel: str('Total') } },
        { properties: { rowSubtotals: bool(false) }, selector: sel('Row') },
        { properties: { columnSubtotals: bool(true) }, selector: sel('Column') },
      ],
    },
    vc: vcTitulo(titulo),
  });
  vs.push(matriz('matriz-montos', 'Ventas netas', FILA[1], 120, 'Venta por año y mes'));
  vs.push(matriz('matriz-variacion', 'Variación vs año anterior', FILA[1] + 128, 104, 'Variación contra el mismo mes del año anterior'));
  vs.push(dona(slug, 'linea', [xCol(10), FILA[1], wCol(3), ALTO], PROD, 'grupo_codigo', 'Venta por línea'));

  // --- Fila 3: sector · cliente top · ubicación · producto top · vendedor
  vs.push(barras(slug, 'sector', [xCol(1), FILA[2], wCol(2), ALTO], CLI, 'condicion_pago_codigo', 'Venta por sector'));
  vs.push(barras(slug, 'cliente', [xCol(3), FILA[2], wCol(3), ALTO], CLI, 'nombre', 'Venta por cliente · top'));
  vs.push(visual(id(slug, 'ubicacion'), 'azureMap', [xCol(6), FILA[2], wCol(3), ALTO], {
    roles: { Category: [pColumna(DIR, 'ciudad')], Size: [pMedida(VENTAS, 'Ventas netas')] },
    objects: { legend: [{ properties: { show: bool(false) } }] },
    vc: vcTitulo('Venta por ubicación'),
  }));
  vs.push(barras(slug, 'producto', [xCol(9), FILA[2], wCol(2), ALTO], PROD, 'nombre', 'Venta por producto · top'));
  vs.push(barras(slug, 'vendedor', [xCol(11), FILA[2], wCol(2), ALTO], VEND, 'nombre', 'Venta por vendedor'));

  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: '01 · Histórico de ventas', visuales: vs };
}

// ============================================================ PÁGINA 02 · SEGUIMIENTO DE VENTAS
function pagina02() {
  const slug = 'ventas-seguimiento';
  z = 0; tab = 0;
  const vs = [];
  vs.push(banda(slug), tituloPagina(slug, VENTAS, 'Título de Seguimiento de ventas'), navegador(slug));

  // --- KPIs: resultado del día · resultado del mes · moneda · vista
  vs.push(kpis(slug, 'resultado-dia', [[VENTAS, 'Venta del día']], [xCol(1), 88, wCol(2), 112], 'Resultado del día'));
  vs.push(kpis(slug, 'resultado-mes', [
    [VENTAS, 'Ventas netas'],
    [VENTAS, 'Variación vs año anterior'],
    [VENTAS, 'Documentos de venta'],
    [VENTAS, 'Clientes con venta'],
    [VENTAS, 'Productos vendidos'],
    [VENTAS, 'Ticket promedio'],
  ], [xCol(3), 88, wCol(7), 112], 'Resultado del período'));
  vs.push(segmentador(slug, 'moneda', MONEDA, 'Moneda de análisis', [xCol(10), 88, 136, 112], { sync: 'moneda', titulo: 'Moneda' }));
  vs.push(segmentador(slug, 'vista', VISTA, 'Vista de ventas', [xCol(10) + 152, 88, 144, 112], { sync: 'vista', titulo: 'Medida' }));

  // --- Fila 1: año-mes (lista) · vendedor · sector · cliente top · producto top
  vs.push(segmentador(slug, 'anio-mes', CAL, 'anio_mes', [xCol(1), FILA[0], wCol(2), ALTO], { modo: 'VerticalList', seleccion: MES_ACTUAL, sync: 'periodo', titulo: 'Año y mes' }));
  vs.push(barras(slug, 'vendedor', [xCol(3), FILA[0], wCol(2), ALTO], VEND, 'nombre', 'Venta por vendedor'));
  vs.push(barras(slug, 'sector', [xCol(5), FILA[0], wCol(2), ALTO], CLI, 'condicion_pago_codigo', 'Venta por sector'));
  vs.push(barras(slug, 'cliente', [xCol(7), FILA[0], wCol(3), ALTO], CLI, 'nombre', 'Venta por cliente · top'));
  vs.push(barras(slug, 'producto', [xCol(10), FILA[0], wCol(3), ALTO], PROD, 'nombre', 'Venta por producto · top'));

  // --- Fila 2: buscadores · venta del mes (acumulado diario) · ubicación · sucursal
  vs.push(segmentador(slug, 'buscar-cliente', CLI, 'nombre', [xCol(1), FILA[1], wCol(2), 108], { busqueda: true, titulo: 'Buscar cliente' }));
  vs.push(segmentador(slug, 'buscar-producto', PROD, 'nombre', [xCol(1), FILA[1] + 124, wCol(2), 108], { busqueda: true, titulo: 'Buscar producto' }));
  vs.push(visual(id(slug, 'venta-del-mes'), 'lineChart', [xCol(3), FILA[1], wCol(4), ALTO], {
    roles: {
      Category: [pColumna(CAL, 'dia')],
      Y: [pMedida(VENTAS, 'Venta acumulada del mes al día'), pMedida(VENTAS, 'Venta acumulada del mes al día año anterior')],
    },
    extra: ordenAsc(CAL, 'dia'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false) } }],
      valueAxis: [{ properties: { showAxisTitle: bool(false) } }],
      legend: [{ properties: { show: bool(true), position: str('Top') } }],
      lineStyles: [
        { properties: { lineStyle: str('dashed'), strokeWidth: num(2) }, selector: { metadata: `${VENTAS}.Venta acumulada del mes al día año anterior` } },
      ],
      dataPoint: [{ properties: { fill: color(TINTA_SUAVE) }, selector: { metadata: `${VENTAS}.Venta acumulada del mes al día año anterior` } }],
    },
    vc: vcTitulo('Venta del mes', 'Acumulado día a día · línea punteada: mismo mes del año anterior'),
  }));
  vs.push(visual(id(slug, 'ubicacion'), 'azureMap', [xCol(7), FILA[1], wCol(3), ALTO], {
    roles: { Category: [pColumna(DIR, 'ciudad')], Size: [pMedida(VENTAS, 'Ventas netas')] },
    objects: { legend: [{ properties: { show: bool(false) } }] },
    vc: vcTitulo('Venta por ubicación del cliente'),
  }));
  vs.push(barras(slug, 'sucursal', [xCol(10), FILA[1], wCol(3), ALTO], BOD, 'nombre', 'Venta por sucursal'));

  // --- Fila 3: línea · canal (grupo de cliente) · empresa
  vs.push(barras(slug, 'linea', [xCol(1), FILA[2], wCol(4), ALTO], PROD, 'grupo_codigo', 'Venta por línea'));
  vs.push(barras(slug, 'canal', [xCol(5), FILA[2], wCol(4), ALTO], CLI, 'grupo_codigo', 'Venta por canal'));
  vs.push(segmentador(slug, 'empresa', EMP, 'nombre', [xCol(9), FILA[2], wCol(4), 112], { sync: 'empresa', titulo: 'Empresa' }));

  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: '02 · Seguimiento de ventas', visuales: vs };
}

// ============================================================ escritura
const paginas = [pagina01(), pagina02()];
const pagesDir = path.join(REPORT, 'definition', 'pages');
for (const pg of paginas) {
  const dir = path.join(pagesDir, pg.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({
    $schema: PAGE_SCHEMA, name: pg.id, displayName: pg.nombre, displayOption: 'FitToPage', height: H, width: W,
  }, null, 2) + '\n');
  for (const v of pg.visuales) {
    const vdir = path.join(dir, 'visuals', v.name);
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(path.join(vdir, 'visual.json'), JSON.stringify(v, null, 2) + '\n');
  }
}
// pages.json: las páginas de este generador primero, en su orden; las demás conservan su lugar.
const pagesPath = path.join(pagesDir, 'pages.json');
const previo = fs.existsSync(pagesPath) ? JSON.parse(fs.readFileSync(pagesPath, 'utf8')) : { pageOrder: [] };
const mias = paginas.map((p) => p.id);
const otras = (previo.pageOrder || []).filter((p) => !mias.includes(p) && fs.existsSync(path.join(pagesDir, p)));
fs.writeFileSync(pagesPath, JSON.stringify({ $schema: PAGES_SCHEMA, pageOrder: [...otras, ...mias], activePageName: previo.activePageName && otras.includes(previo.activePageName) ? previo.activePageName : mias[0] }, null, 2) + '\n');

const n = paginas.reduce((a, p) => a + p.visuales.length, 0);
console.log(`OK · ${paginas.length} páginas · ${n} visuales · mes ${MES_ACTUAL} · año ${ANIO_ACTUAL} → ${pagesDir}`);
