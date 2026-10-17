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
const CANAL = 'DM_Canal';
const CONDPAGO = 'DM_Condición de pago';
const CARGA = 'FC_Estado de carga';

// Colores de Kraken (capturas): pizarra para la serie, gris para la referencia, panel gris-azul.
const PIZARRA = '#4f6d78';
const GRIS_SERIE = '#e1e4e6';
const PANEL = '#dde4e7';
const TINTA = '#1f2a2e';
const TINTA_SUAVE = '#6b7680';
const VERDE_CELDA = '#c6e5c9';
const ROJO_CELDA = '#f4c7c3';
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
const meta = (t, n) => ({ metadata: `${t}.${n}` });
const campoMedida = (t, m) => ({ Measure: { Expression: { SourceRef: { Entity: t } }, Property: m } });
const campoColumna = (t, c) => ({ Column: { Expression: { SourceRef: { Entity: t } }, Property: c } });
const proy = (campo, t, n, activa) => {
  const p = { field: campo, queryRef: `${t}.${n}`, nativeQueryRef: n };
  if (activa) p.active = true;
  return p;
};
const pMedida = (t, m) => proy(campoMedida(t, m), t, m);
const pColumna = (t, c, activa) => proy(campoColumna(t, c), t, c, activa);
const fx = (t, m) => ({ expr: campoMedida(t, m) });

let z = 0, tab = 0;
function visual(nombre, tipo, [x, y, w, h], { roles, objects, vc, sort, sync } = {}) {
  z += 100; tab += 1;
  const v = { visualType: tipo };
  if (roles) v.query = { queryState: Object.fromEntries(Object.entries(roles).map(([r, ps]) => [r, { projections: ps }])) };
  if (sort) { v.query = v.query || {}; v.query.sortDefinition = sort; }
  if (objects) v.objects = objects;
  if (vc) v.visualContainerObjects = vc;
  v.drillFilterOtherVisuals = true;
  if (sync) v.syncGroup = { groupName: sync, fieldChanges: true, filterChanges: true };
  return { $schema: VC_SCHEMA, name: nombre, position: { x, y, z, height: h, width: w, tabOrder: tab }, visual: v };
}
// Título centrado como Kraken.
const vcTitulo = (texto, subtitulo) => {
  const t = (v) => (typeof v === 'string' ? str(v) : v);
  const vc = { title: [{ properties: { show: bool(true), text: t(texto), alignment: str('center'), fontSize: num(12), fontColor: color(TINTA) } }] };
  if (subtitulo) vc.subTitle = [{ properties: { show: bool(true), text: t(subtitulo), alignment: str('center'), fontSize: num(9) } }];
  return vc;
};
const vcDesnudo = {
  background: [{ properties: { show: bool(false) } }],
  border: [{ properties: { show: bool(false) } }],
  visualHeader: [{ properties: { show: bool(false) } }],
  padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
};
const ordenDesc = (t, m) => ({ sort: [{ field: campoMedida(t, m), direction: 'Descending' }], isDefaultSort: true });
const ordenAsc = (t, c) => ({ sort: [{ field: campoColumna(t, c), direction: 'Ascending' }], isDefaultSort: true });

// ---- fábricas de visuales ----
// Texto de una medida, sin chrome (títulos, subtítulos y notas del encabezado).
function texto(slug, clave, tabla, medida, pos, { size = 12, bold = false, colorHex = TINTA, align = 'left' } = {}) {
  return visual(id(slug, clave), 'cardVisual', pos, {
    roles: { Data: [pMedida(tabla, medida)] },
    objects: {
      value: [{ properties: { fontSize: num(size), fontFamily: str(bold ? 'Segoe UI Semibold' : 'Segoe UI'), fontColor: color(colorHex), horizontalAlignment: str(align) }, selector: sel('default') }],
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
function textoEstatico(slug, clave, contenido, pos, { size = 9, colorHex = TINTA_SUAVE, align = 'center' } = {}) {
  return visual(id(slug, clave), 'textbox', pos, {
    objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: contenido, textStyle: { fontFamily: 'Segoe UI', fontSize: `${size}px`, color: colorHex } }], horizontalTextAlignment: align }] } }] },
    vc: vcDesnudo,
  });
}
function navegador(slug) {
  return visual(id(slug, 'chrome-nav'), 'pageNavigator', [xCol(7), 16, wCol(4), 32], {
    objects: {
      fill: [
        { properties: { show: bool(true) } },
        { properties: { show: bool(true), fillColor: color(BLANCO), transparency: num(0) }, selector: sel('default') },
        { properties: { show: bool(true), fillColor: color(PANEL), transparency: num(0) }, selector: sel('selected') },
      ],
      text: [
        { properties: { fontColor: color(TINTA), fontSize: num(10), fontFamily: str('Segoe UI Semibold') } },
        { properties: { fontColor: color(TINTA), fontSize: num(10), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') },
        { properties: { fontColor: color(TINTA), bold: bool(true) }, selector: sel('selected') },
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
// Encabezado Kraken: título grande, "al 16 oct (79%)", empresa activa; navegación a la derecha.
function encabezado(slug, medidaTitulo, medidaCorte) {
  return [
    texto(slug, 'chrome-titulo', VENTAS, medidaTitulo, [xCol(1), 8, wCol(4), 28], { size: 16, bold: true }),
    texto(slug, 'chrome-corte', VENTAS, medidaCorte, [xCol(1), 36, wCol(4), 20], { size: 12 }),
    texto(slug, 'chrome-empresa', VENTAS, 'Empresa activa', [xCol(1), 56, wCol(4), 16], { size: 10, colorHex: TINTA_SUAVE }),
    navegador(slug),
  ];
}
function pie(slug) {
  return texto(slug, 'chrome-pie', VENTAS, 'Pie de ventas', [xCol(1), H - 20, wCol(12), 20], { size: 9, colorHex: TINTA_SUAVE });
}

// Segmentador. modo: Dropdown | VerticalList | Basic (tiles con orientación horizontal).
function segmentador(slug, clave, tabla, columna, pos, { modo = 'Dropdown', seleccion, sync, busqueda = false, titulo, horizontal = false, unico = false, descendente = false } = {}) {
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
  if (horizontal) general.properties.orientation = str('1');
  const objects = {
    data: [{ properties: { mode: str(modo) } }],
    general: [general],
    header: [{ properties: { show: bool(Boolean(titulo)), ...(titulo ? { text: str(titulo), bold: bool(true) } : {}) } }],
  };
  if (unico) objects.selection = [{ properties: { strictSingleSelect: bool(true), selectAllCheckboxEnabled: bool(false) } }];
  return visual(id(slug, clave), 'slicer', pos, {
    roles: { Values: [pColumna(tabla, columna, true)] },
    sort: descendente ? { sort: [{ field: campoColumna(tabla, columna), direction: 'Descending' }], isDefaultSort: true } : undefined,
    objects,
    sync,
  });
}

// Panel de KPIs estilo Kraken: fondo gris-azul, título centrado, etiqueta arriba del valor.
function kpis(slug, clave, medidas, pos, titulo) {
  return visual(id(slug, clave), 'cardVisual', pos, {
    roles: { Data: medidas.map(([t, m]) => pMedida(t, m)) },
    objects: {
      value: [{ properties: { fontSize: num(13), fontFamily: str('Segoe UI Semibold'), fontColor: color(TINTA), horizontalAlignment: str('center'), labelDisplayUnits: str('1'), labelPrecision: int(0) }, selector: sel('default') }],
      label: [{ properties: { show: bool(true), fontSize: num(9), position: str('aboveValue'), fontColor: color(TINTA_SUAVE), horizontalAlignment: str('center') }, selector: sel('default') }],
      outline: [{ properties: { show: bool(false) }, selector: sel('default') }],
      padding: [{ properties: { paddingUniform: int(4) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(4), style: str('Table'), backgroundShow: bool(false) }, selector: sel('default') }],
      spacing: [{ properties: { verticalSpacing: num(2) }, selector: sel('default') }],
    },
    vc: {
      ...vcTitulo(titulo, 'Resultados en moneda de presentación · sin IVA'),
      background: [{ properties: { show: bool(true), color: color(PANEL), transparency: num(0) } }],
    },
  });
}

// Ranking Kraken: barra pizarra + "resto hasta el máximo" en gris apilado detrás.
function ranking(slug, clave, pos, tabla, columna, titulo, dim) {
  const resto = `Resto a máximo ${dim}`;
  return visual(id(slug, clave), 'barChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(VENTAS, 'Ventas netas'), pMedida(VENTAS, resto)] },
    sort: ordenDesc(VENTAS, 'Ventas netas'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(8), maxMarginFactor: num(45) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [
        { properties: { show: bool(true), showAll: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0) } },
        { properties: { showSeries: bool(true), labelPosition: str('InsideEnd') }, selector: meta(VENTAS, 'Ventas netas') },
        { properties: { showSeries: bool(false) }, selector: meta(VENTAS, resto) },
      ],
      dataPoint: [
        { properties: { fill: color(PIZARRA) }, selector: meta(VENTAS, 'Ventas netas') },
        { properties: { fill: color(GRIS_SERIE) }, selector: meta(VENTAS, resto) },
      ],
      legend: [{ properties: { show: bool(false) } }],
    },
    vc: vcTitulo(titulo),
  });
}
function dona(slug, clave, pos, tabla, columna, titulo) {
  return visual(id(slug, clave), 'donutChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(VENTAS, 'Ventas netas')] },
    sort: ordenDesc(VENTAS, 'Ventas netas'),
    objects: {
      legend: [{ properties: { show: bool(false) } }],
      labels: [{ properties: { show: bool(true), labelStyle: str('Both'), fontSize: num(9) } }],
    },
    vc: vcTitulo(titulo),
  });
}
function mapa(slug, clave, pos, titulo) {
  return visual(id(slug, clave), 'azureMap', pos, {
    roles: { Category: [pColumna(DIR, 'ciudad')], Size: [pMedida(VENTAS, 'Ventas netas')] },
    objects: {
      legend: [{ properties: { show: bool(false) } }],
      bubbleLayer: [{ properties: { fillColor: color(PIZARRA) } }],
    },
    vc: vcTitulo(titulo),
  });
}
// Semáforo de celdas: rojo bajo cero, blanco en cero, verde arriba — sobre la variación a/a.
const semaforo = (medidaMostrada) => [{
  properties: { backColor: { solid: { color: { expr: { FillRule: {
    Input: campoMedida(VENTAS, 'Variación vs año anterior'),
    FillRule: { linearGradient3: {
      min: { color: { Literal: { Value: `'${ROJO_CELDA}'` } } },
      mid: { color: { Literal: { Value: `'${BLANCO}'` } }, value: { Literal: { Value: '0D' } } },
      max: { color: { Literal: { Value: `'${VERDE_CELDA}'` } } },
      nullColoringStrategy: { strategy: { Literal: { Value: "'asZero'" } } },
    } },
  } } } } } },
  selector: meta(VENTAS, medidaMostrada),
}];
function matriz(slug, clave, medida, pos, titulo, conSemaforo = true) {
  return visual(id(slug, clave), 'pivotTable', pos, {
    roles: { Rows: [pColumna(CAL, 'anio')], Columns: [pColumna(CAL, 'mes_nombre_corto')], Values: [pMedida(VENTAS, medida)] },
    objects: {
      columnHeaders: [{ properties: { columnAdjustment: str('growToFit'), autoSizeColumnWidth: bool(true), fontSize: num(9), bold: bool(true) } }],
      rowHeaders: [{ properties: { fontSize: num(9), bold: bool(true) } }],
      // El semáforo colorea por la variación a/a: solo donde la medida mostrada ES la variación (un Input distinto al proyectado invalida la consulta del visual).
      values: [{ properties: { fontSize: num(9) } }, ...(conSemaforo ? semaforo(medida) : [])],
      subTotals: [
        { properties: { rowSubtotals: bool(false), columnSubtotals: bool(true), columnSubtotalsLabel: str('Total'), bold: bool(true) } },
        { properties: { rowSubtotals: bool(false) }, selector: sel('Row') },
        { properties: { columnSubtotals: bool(true) }, selector: sel('Column') },
      ],
      grid: [{ properties: { rowPadding: num(2) } }],
    },
    vc: vcTitulo(titulo),
  });
}
// Bloque "Moneda" de Kraken: tiles de moneda + desplegable de medida + nota.
function bloqueMoneda(slug) {
  return [
    segmentador(slug, 'moneda', MONEDA, 'Moneda de análisis', [xCol(10), 88, wCol(3), 76], { unico: true, sync: 'moneda', titulo: 'Moneda' }),
    segmentador(slug, 'vista', VISTA, 'Vista de ventas', [xCol(10), 166, wCol(3), 48], { sync: 'vista' }),
  ];
}

// ============================================================ PÁGINA 01 · HISTÓRICO DE VENTAS
function pagina01() {
  const slug = 'ventas-historico';
  z = 0; tab = 0;
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Histórico de ventas', 'Subtítulo de corte anual'));

  // --- KPIs: empresa + año · resultado del año · moneda
  vs.push(segmentador(slug, 'empresa', EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'anio', CAL, 'anio', [xCol(1), 148, wCol(2), 52], { seleccion: ANIO_ACTUAL, sync: 'anio' }));
  vs.push(kpis(slug, 'resultado-anio', [
    [VENTAS, 'Ventas acumuladas año'],
    [VENTAS, 'Variación acumulada vs año anterior'],
    [VENTAS, 'Documentos de venta'],
    [VENTAS, 'Clientes con venta'],
    [VENTAS, 'Productos vendidos'],
    [VENTAS, 'Ticket promedio'],
  ], [xCol(3), 88, wCol(7), 112], 'Resultado del año'));
  vs.push(...bloqueMoneda(slug));

  // --- Fila 1: columnas mensuales (año actual vs anterior en gris) · dona sucursal
  vs.push(visual(id(slug, 'mensual'), 'clusteredColumnChart', [xCol(1), FILA[0], wCol(9), ALTO], {
    roles: {
      Category: [pColumna(CAL, 'mes_nombre_corto')],
      Y: [pMedida(VENTAS, 'Ventas año anterior'), pMedida(VENTAS, 'Ventas netas')],
      Tooltips: [pMedida(VENTAS, 'Variación vs año anterior')],
    },
    sort: ordenAsc(CAL, 'mes_nombre_corto'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(10) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [
        { properties: { show: bool(true), showAll: bool(true), fontSize: num(9), labelPosition: str('OutsideEnd'), labelDisplayUnits: str('1'), labelPrecision: int(0) } },
        { properties: { showSeries: bool(true), color: color(PIZARRA) }, selector: meta(VENTAS, 'Ventas netas') },
        { properties: { showSeries: bool(false) }, selector: meta(VENTAS, 'Ventas año anterior') },
      ],
      legend: [{ properties: { show: bool(false) } }],
      dataPoint: [
        { properties: { fill: color(GRIS_SERIE) }, selector: meta(VENTAS, 'Ventas año anterior') },
        { properties: { fill: color(PIZARRA) }, selector: meta(VENTAS, 'Ventas netas') },
      ],
    },
    vc: vcTitulo('Venta histórica por mes y variación año con año'),
  }));
  vs.push(dona(slug, 'sucursal', [xCol(10), FILA[0], wCol(3), ALTO], BOD, 'nombre', 'Venta por sucursal'));

  // --- Fila 2: matrices año × mes (montos y variación) · dona canal
  vs.push(matriz(slug, 'matriz-montos', 'Ventas netas', [xCol(1), FILA[1], wCol(9), 120], 'Venta por año y mes', false));
  vs.push(matriz(slug, 'matriz-variacion', 'Variación vs año anterior', [xCol(1), FILA[1] + 128, wCol(9), 104], 'Variación contra el mismo mes del año anterior'));
  vs.push(dona(slug, 'canal', [xCol(10), FILA[1], wCol(3), ALTO], CANAL, 'nombre', 'Venta por canal'));

  // --- Fila 3: sector · cliente top · ubicación · línea · producto top · vendedor
  vs.push(ranking(slug, 'sector', [xCol(1), FILA[2], wCol(2), ALTO], CONDPAGO, 'nombre', 'Venta por sector', 'sector'));
  vs.push(ranking(slug, 'cliente', [xCol(3), FILA[2], wCol(2), ALTO], CLI, 'nombre', 'Venta por cliente · top 100', 'cliente'));
  vs.push(mapa(slug, 'ubicacion', [xCol(5), FILA[2], wCol(2), ALTO], 'Venta por ubicación'));
  vs.push(ranking(slug, 'linea', [xCol(7), FILA[2], wCol(2), ALTO], PROD, 'grupo_nombre', 'Venta por línea', 'línea'));
  vs.push(ranking(slug, 'producto', [xCol(9), FILA[2], wCol(2), ALTO], PROD, 'nombre', 'Venta por producto · top 100', 'producto'));
  vs.push(ranking(slug, 'vendedor', [xCol(11), FILA[2], wCol(2), ALTO], VEND, 'nombre', 'Venta por vendedor', 'vendedor'));

  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Histórico de ventas', visuales: vs };
}

// ============================================================ PÁGINA 02 · SEGUIMIENTO DE VENTAS
function pagina02() {
  const slug = 'ventas-seguimiento';
  z = 0; tab = 0;
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Seguimiento de ventas', 'Subtítulo de corte mensual'));

  // --- KPIs: resultado del día · resultado del período · moneda
  vs.push(kpis(slug, 'resultado-dia', [[VENTAS, 'Venta del día']], [xCol(1), 88, wCol(2), 112], 'Resultado del día'));
  vs.push(kpis(slug, 'resultado-mes', [
    [VENTAS, 'Ventas netas'],
    [VENTAS, 'Variación vs año anterior'],
    [VENTAS, 'Documentos de venta'],
    [VENTAS, 'Clientes con venta'],
    [VENTAS, 'Productos vendidos'],
    [VENTAS, 'Ticket promedio'],
  ], [xCol(3), 88, wCol(7), 112], 'Resultado'));
  vs.push(...bloqueMoneda(slug));

  // --- Fila 1: año-mes (lista) + empresa · vendedor · sector · cliente top · producto top
  vs.push(segmentador(slug, 'anio-mes', CAL, 'anio_mes', [xCol(1), FILA[0], wCol(2), 148], { modo: 'VerticalList', seleccion: MES_ACTUAL, sync: 'periodo', titulo: 'Año y mes', unico: true, descendente: true }));
  vs.push(segmentador(slug, 'empresa', EMP, 'nombre', [xCol(1), FILA[0] + 156, wCol(2), 76], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(ranking(slug, 'vendedor', [xCol(3), FILA[0], wCol(2), ALTO], VEND, 'nombre', 'Venta por vendedor', 'vendedor'));
  vs.push(ranking(slug, 'sector', [xCol(5), FILA[0], wCol(2), ALTO], CONDPAGO, 'nombre', 'Venta por sector', 'sector'));
  vs.push(ranking(slug, 'cliente', [xCol(7), FILA[0], wCol(3), ALTO], CLI, 'nombre', 'Venta por cliente · top 100', 'cliente'));
  vs.push(ranking(slug, 'producto', [xCol(10), FILA[0], wCol(3), ALTO], PROD, 'nombre', 'Venta por producto · top 100', 'producto'));

  // --- Fila 2: buscadores · venta del mes (acumulado diario) · ubicación · sucursal
  vs.push(segmentador(slug, 'buscar-cliente', CLI, 'nombre', [xCol(1), FILA[1], wCol(2), 108], { busqueda: true, titulo: 'Buscar cliente' }));
  vs.push(segmentador(slug, 'buscar-producto', PROD, 'nombre', [xCol(1), FILA[1] + 124, wCol(2), 108], { busqueda: true, titulo: 'Buscar producto y/o SKU' }));
  vs.push(visual(id(slug, 'venta-del-mes'), 'lineChart', [xCol(3), FILA[1], wCol(4), ALTO], {
    roles: {
      Category: [pColumna(CAL, 'dia')],
      Y: [pMedida(VENTAS, 'Venta acumulada del mes al día'), pMedida(VENTAS, 'Venta acumulada del mes al día año anterior')],
    },
    sort: ordenAsc(CAL, 'dia'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(9) } }],
      lineStyles: [
        { properties: { strokeWidth: num(2) }, selector: meta(VENTAS, 'Venta acumulada del mes al día') },
        { properties: { lineStyle: str('dotted'), strokeWidth: num(2) }, selector: meta(VENTAS, 'Venta acumulada del mes al día año anterior') },
      ],
      dataPoint: [
        { properties: { fill: color(PIZARRA) }, selector: meta(VENTAS, 'Venta acumulada del mes al día') },
        { properties: { fill: color('#9fb4bb') }, selector: meta(VENTAS, 'Venta acumulada del mes al día año anterior') },
      ],
    },
    vc: vcTitulo('Venta del mes'),
  }));
  vs.push(mapa(slug, 'ubicacion', [xCol(7), FILA[1], wCol(3), ALTO], 'Venta por ubicación del cliente'));
  vs.push(ranking(slug, 'sucursal', [xCol(10), FILA[1], wCol(3), ALTO], BOD, 'nombre', 'Venta por sucursal', 'sucursal'));

  // --- Fila 3: canal · línea
  vs.push(ranking(slug, 'canal', [xCol(1), FILA[2], wCol(6), ALTO], CANAL, 'nombre', 'Venta por canal', 'canal'));
  vs.push(ranking(slug, 'linea', [xCol(7), FILA[2], wCol(6), ALTO], PROD, 'grupo_nombre', 'Venta por línea', 'línea'));

  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Seguimiento de ventas', visuales: vs };
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
