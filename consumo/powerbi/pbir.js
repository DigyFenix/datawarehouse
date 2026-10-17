// Helpers PBIR compartidos por los generadores de páginas (ventas, clientes, …).
// Patrón verificado en render (sesión 28): ids sha1 deterministas, visualContainer 2.11.0,
// sortDefinition DENTRO de query, apilado = barChart, color condicional solo sobre la medida
// proyectada, dropdown ≥ 48 px (76 con encabezado).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VC_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json';
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json';
const PAGES_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json';

// Lienzo 1280 × 960: tres filas de análisis de 232 px (Kraken trae más visuales de los que caben en 720).
const W = 1280, H = 960;
const FILA = [216, 464, 712];
const ALTO = 232;

// ---- tablas del modelo (nombres del TMDL que emite generar_pbip.py) ----
const T = {
  VENTAS: 'FC_Ventas', CAL: 'DM_Calendario', CLI: 'DM_Cliente', PROD: 'DM_Producto', VEND: 'DM_Vendedor',
  BOD: 'DM_Bodega', DIR: 'DM_Dirección de entrega', EMP: 'DM_Empresa', MONEDA: 'MD_Moneda de análisis',
  VISTA: 'MD_Vista de ventas', CARGA: 'FC_Estado de carga', CANAL: 'DM_Canal', CONDPAGO: 'DM_Condición de pago',
  ABC: 'DM_Clasificación ABC', RFM: 'DM_Clasificación RFM', PARTIDA: 'MD_Mes de partida', OPORT: 'MD_Vista de oportunidad',
};

// Colores de Kraken (capturas): pizarra, gris de referencia, panel gris-azul, rojo/verde de estado.
const C = {
  PIZARRA: '#4f6d78', GRIS_SERIE: '#e1e4e6', PANEL: '#dde4e7', TINTA: '#1f2a2e', TINTA_SUAVE: '#6b7680',
  VERDE_CELDA: '#c6e5c9', ROJO_CELDA: '#f4c7c3', ROJO: '#d9534f', VERDE: '#2f9e44', PIZARRA_CLARA: '#9fb4bb', BLANCO: '#ffffff',
};

// ---- grilla ----
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
const ordenDesc = (t, m) => ({ sort: [{ field: campoMedida(t, m), direction: 'Descending' }], isDefaultSort: true });
const ordenAsc = (t, c) => ({ sort: [{ field: campoColumna(t, c), direction: 'Ascending' }], isDefaultSort: true });

let z = 0, tab = 0;
const reiniciar = () => { z = 0; tab = 0; };
function visual(nombre, tipo, [x, y, w, h], { roles, objects, vc, sort, sync, filtros } = {}) {
  z += 100; tab += 1;
  const v = { visualType: tipo };
  if (roles) v.query = { queryState: Object.fromEntries(Object.entries(roles).map(([r, ps]) => [r, { projections: ps }])) };
  if (sort) { v.query = v.query || {}; v.query.sortDefinition = sort; }
  if (objects) v.objects = objects;
  if (vc) v.visualContainerObjects = vc;
  v.drillFilterOtherVisuals = true;
  if (sync) v.syncGroup = { groupName: sync, fieldChanges: true, filterChanges: true };
  const c = { $schema: VC_SCHEMA, name: nombre, position: { x, y, z, height: h, width: w, tabOrder: tab }, visual: v };
  if (filtros) c.filterConfig = { filters: filtros };
  return c;
}
const vcTitulo = (texto, subtitulo) => {
  const t = (v) => (typeof v === 'string' ? str(v) : v);
  const vc = { title: [{ properties: { show: bool(true), text: t(texto), alignment: str('center'), fontSize: num(12), fontColor: color(C.TINTA) } }] };
  if (subtitulo) vc.subTitle = [{ properties: { show: bool(true), text: t(subtitulo), alignment: str('center'), fontSize: num(9) } }];
  return vc;
};
const vcDesnudo = {
  background: [{ properties: { show: bool(false) } }],
  border: [{ properties: { show: bool(false) } }],
  visualHeader: [{ properties: { show: bool(false) } }],
  padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
};

// ---- fábricas ----
function texto(slug, clave, tabla, medida, pos, { size = 12, bold = false, colorHex = C.TINTA, align = 'left' } = {}) {
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
function textoEstatico(slug, clave, contenido, pos, { size = 9, colorHex = C.TINTA_SUAVE, align = 'center' } = {}) {
  return visual(id(slug, clave), 'textbox', pos, {
    objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: contenido, textStyle: { fontFamily: 'Segoe UI', fontSize: `${size}px`, color: colorHex } }], horizontalTextAlignment: align }] } }] },
    vc: vcDesnudo,
  });
}
function navegador(slug) {
  return visual(id(slug, 'chrome-nav'), 'pageNavigator', [xCol(6), 16, wCol(5), 32], {
    objects: {
      fill: [
        { properties: { show: bool(true) } },
        { properties: { show: bool(true), fillColor: color(C.BLANCO), transparency: num(0) }, selector: sel('default') },
        { properties: { show: bool(true), fillColor: color(C.PANEL), transparency: num(0) }, selector: sel('selected') },
      ],
      text: [
        { properties: { fontColor: color(C.TINTA), fontSize: num(9), fontFamily: str('Segoe UI Semibold') } },
        { properties: { fontColor: color(C.TINTA), fontSize: num(9), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') },
        { properties: { fontColor: color(C.TINTA), bold: bool(true) }, selector: sel('selected') },
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
// Encabezado Kraken: título, "al 16 oct (79%)", empresa activa, navegación.
function encabezado(slug, medidaTitulo, medidaCorte) {
  return [
    texto(slug, 'chrome-titulo', T.VENTAS, medidaTitulo, [xCol(1), 8, wCol(4), 28], { size: 16, bold: true }),
    texto(slug, 'chrome-corte', T.VENTAS, medidaCorte, [xCol(1), 36, wCol(4), 20], { size: 12 }),
    texto(slug, 'chrome-empresa', T.VENTAS, 'Empresa activa', [xCol(1), 56, wCol(4), 16], { size: 10, colorHex: C.TINTA_SUAVE }),
    navegador(slug),
  ];
}
function pie(slug) {
  return texto(slug, 'chrome-pie', T.VENTAS, 'Pie de ventas', [xCol(1), H - 20, wCol(12), 20], { size: 9, colorHex: C.TINTA_SUAVE });
}

// Segmentador. modo: Dropdown | VerticalList. seleccion: valor inicial (string | number).
function segmentador(slug, clave, tabla, columna, pos, { modo = 'Dropdown', seleccion, sync, busqueda = false, titulo, unico = false, descendente = false } = {}) {
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
function kpis(slug, clave, medidas, pos, titulo, subtitulo = 'Resultados en moneda de presentación · sin IVA') {
  return visual(id(slug, clave), 'cardVisual', pos, {
    roles: { Data: medidas.map(([t, m]) => pMedida(t, m)) },
    objects: {
      value: [{ properties: { fontSize: num(13), fontFamily: str('Segoe UI Semibold'), fontColor: color(C.TINTA), horizontalAlignment: str('center'), labelDisplayUnits: str('1'), labelPrecision: int(0) }, selector: sel('default') }],
      label: [{ properties: { show: bool(true), fontSize: num(8), position: str('aboveValue'), fontColor: color(C.TINTA_SUAVE), horizontalAlignment: str('center') }, selector: sel('default') }],
      outline: [{ properties: { show: bool(false) }, selector: sel('default') }],
      padding: [{ properties: { paddingUniform: int(4) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(4), style: str('Table'), backgroundShow: bool(false) }, selector: sel('default') }],
      spacing: [{ properties: { verticalSpacing: num(2) }, selector: sel('default') }],
    },
    vc: {
      ...vcTitulo(titulo, subtitulo),
      background: [{ properties: { show: bool(true), color: color(C.PANEL), transparency: num(0) } }],
    },
  });
}

// Ranking Kraken: barra pizarra + "resto hasta el máximo" en gris apilado detrás (barChart = apilado).
function ranking(slug, clave, pos, tabla, columna, titulo, dim, medida = 'Ventas netas', resto = `Resto a máximo ${dim}`) {
  return visual(id(slug, clave), 'barChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(T.VENTAS, medida), pMedida(T.VENTAS, resto)] },
    sort: ordenDesc(T.VENTAS, medida),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(8), maxMarginFactor: num(45) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [
        { properties: { show: bool(true), showAll: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0) } },
        { properties: { showSeries: bool(true), labelPosition: str('InsideEnd') }, selector: meta(T.VENTAS, medida) },
        { properties: { showSeries: bool(false) }, selector: meta(T.VENTAS, resto) },
      ],
      dataPoint: [
        { properties: { fill: color(C.PIZARRA) }, selector: meta(T.VENTAS, medida) },
        { properties: { fill: color(C.GRIS_SERIE) }, selector: meta(T.VENTAS, resto) },
      ],
      legend: [{ properties: { show: bool(false) } }],
    },
    vc: vcTitulo(titulo),
  });
}
// Barras simples (sin fantasma) por categoría, orden descendente.
function barras(slug, clave, pos, tabla, columna, titulo, medidas, colores = [C.PIZARRA, C.ROJO, C.VERDE], { apilado = true, leyenda = false } = {}) {
  return visual(id(slug, clave), apilado ? 'barChart' : 'clusteredBarChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: medidas.map((m) => pMedida(T.VENTAS, m)) },
    sort: ordenDesc(T.VENTAS, medidas[0]),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(8), maxMarginFactor: num(45) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0) } }],
      dataPoint: [{ properties: { fill: color(colores[0] || C.PIZARRA) } }, ...medidas.map((m, i) => ({ properties: { fill: color(colores[i] || C.PIZARRA) }, selector: meta(T.VENTAS, m) }))],
      legend: [{ properties: { show: bool(leyenda), position: str('Top'), fontSize: num(8) } }],
    },
    vc: vcTitulo(titulo),
  });
}
function dona(slug, clave, pos, tabla, columna, titulo, medida = 'Ventas netas') {
  return visual(id(slug, clave), 'donutChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(T.VENTAS, medida)] },
    sort: ordenDesc(T.VENTAS, medida),
    objects: {
      legend: [{ properties: { show: bool(false) } }],
      labels: [{ properties: { show: bool(true), labelStyle: str('Both'), fontSize: num(9) } }],
    },
    vc: vcTitulo(titulo),
  });
}
function mapa(slug, clave, pos, titulo, medida = 'Ventas netas') {
  return visual(id(slug, clave), 'azureMap', pos, {
    roles: { Category: [pColumna(T.DIR, 'ciudad')], Size: [pMedida(T.VENTAS, medida)] },
    objects: { legend: [{ properties: { show: bool(false) } }], bubbleLayer: [{ properties: { fillColor: color(C.PIZARRA) } }] },
    vc: vcTitulo(titulo),
  });
}
// Semáforo de celdas: rojo bajo cero, blanco en cero, verde arriba — SOLO sobre la medida mostrada.
const semaforo = (medida, tabla = T.VENTAS) => [{
  properties: { backColor: { solid: { color: { expr: { FillRule: {
    Input: campoMedida(tabla, medida),
    FillRule: { linearGradient3: {
      min: { color: { Literal: { Value: `'${C.ROJO_CELDA}'` } } },
      mid: { color: { Literal: { Value: `'${C.BLANCO}'` } }, value: { Literal: { Value: '0D' } } },
      max: { color: { Literal: { Value: `'${C.VERDE_CELDA}'` } } },
      nullColoringStrategy: { strategy: { Literal: { Value: "'asZero'" } } },
    } },
  } } } } } },
  selector: meta(tabla, medida),
}];
const subtotalesMatriz = ({ filaTotal = false, columnaTotal = true } = {}) => [
  { properties: { rowSubtotals: bool(filaTotal), columnSubtotals: bool(columnaTotal), columnSubtotalsLabel: str('Total'), rowSubtotalsLabel: str('Total'), bold: bool(true) } },
  { properties: { rowSubtotals: bool(filaTotal) }, selector: sel('Row') },
  { properties: { columnSubtotals: bool(columnaTotal) }, selector: sel('Column') },
];
// Matriz genérica: filas (columna), columnas (opcional), valores (medidas [tabla, medida]).
function matriz(slug, clave, pos, titulo, { filas, columnas, valores, semaforoEn, filaTotal = false, columnaTotal = true, ordenPor, anchoFilas }) {
  const roles = { Rows: filas.map(([t, c]) => pColumna(t, c)), Values: valores.map(([t, m]) => pMedida(t, m)) };
  if (columnas) roles.Columns = columnas.map(([t, c]) => pColumna(t, c));
  return visual(id(slug, clave), 'pivotTable', pos, {
    roles,
    sort: ordenPor ? ordenDesc(ordenPor[0], ordenPor[1]) : undefined,
    objects: {
      columnHeaders: [{ properties: { columnAdjustment: str('growToFit'), autoSizeColumnWidth: bool(false), fontSize: num(9), bold: bool(true) } }],
      rowHeaders: [{ properties: { fontSize: num(9) } }],
      values: [{ properties: { fontSize: num(9) } }, ...(semaforoEn ? semaforo(semaforoEn[1], semaforoEn[0]) : [])],
      subTotals: subtotalesMatriz({ filaTotal, columnaTotal }),
      grid: [{ properties: { rowPadding: num(2) } }],
      // Ancho fijo del encabezado de fila: con autoajuste el nombre del cliente se come todo el ancho y los valores quedan detrás del scroll.
      ...(anchoFilas ? { columnWidth: [{ properties: { value: num(anchoFilas) }, selector: meta(filas[0][0], filas[0][1]) }] } : {}),
    },
    vc: vcTitulo(titulo),
  });
}
// Bloque "Moneda" de Kraken: moneda + medida.
function bloqueMoneda(slug, col = 10, ancho = 3) {
  return [
    segmentador(slug, 'moneda', T.MONEDA, 'Moneda de análisis', [xCol(col), 88, wCol(ancho), 76], { unico: true, sync: 'moneda', titulo: 'Moneda' }),
    segmentador(slug, 'vista', T.VISTA, 'Vista de ventas', [xCol(col), 166, wCol(ancho), 48], { sync: 'vista' }),
  ];
}
// Columnas mensuales estilo Kraken: año anterior en gris detrás, año actual en pizarra con etiqueta.
function columnasMensuales(slug, clave, pos, titulo, actual = 'Ventas netas', anterior = 'Ventas año anterior', tooltip = 'Variación vs año anterior', columna = 'mes_nombre_corto') {
  return visual(id(slug, clave), 'clusteredColumnChart', pos, {
    roles: {
      Category: [pColumna(T.CAL, columna)],
      Y: [pMedida(T.VENTAS, anterior), pMedida(T.VENTAS, actual)],
      Tooltips: [pMedida(T.VENTAS, tooltip)],
    },
    sort: ordenAsc(T.CAL, columna),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(10) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [
        { properties: { show: bool(true), showAll: bool(true), fontSize: num(9), labelPosition: str('OutsideEnd'), labelDisplayUnits: str('1'), labelPrecision: int(0) } },
        { properties: { showSeries: bool(true), color: color(C.PIZARRA) }, selector: meta(T.VENTAS, actual) },
        { properties: { showSeries: bool(false) }, selector: meta(T.VENTAS, anterior) },
      ],
      legend: [{ properties: { show: bool(false) } }],
      dataPoint: [
        { properties: { fill: color(C.GRIS_SERIE) }, selector: meta(T.VENTAS, anterior) },
        { properties: { fill: color(C.PIZARRA) }, selector: meta(T.VENTAS, actual) },
      ],
    },
    vc: vcTitulo(titulo),
  });
}
// Columnas + línea (eje secundario) por mes del calendario.
function comboMensual(slug, clave, pos, titulo, columnas, linea, columna = 'mes_anio_etiqueta') {
  return visual(id(slug, clave), 'lineClusteredColumnComboChart', pos, {
    roles: {
      Category: [pColumna(T.CAL, columna)],
      Y: columnas.map((m) => pMedida(T.VENTAS, m)),
      Y2: [pMedida(T.VENTAS, linea)],
    },
    sort: ordenAsc(T.CAL, columna),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false), secShow: bool(false) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(9) } }],
      dataPoint: [
        ...columnas.map((m, i) => ({ properties: { fill: color(i === 0 ? C.PIZARRA : C.PIZARRA_CLARA) }, selector: meta(T.VENTAS, m) })),
        { properties: { fill: color(C.PIZARRA_CLARA) }, selector: meta(T.VENTAS, linea) },
      ],
    },
    vc: vcTitulo(titulo),
  });
}
// Columnas apiladas por mes (dos medidas).
function columnasApiladas(slug, clave, pos, titulo, medidas, colores = [C.PIZARRA, C.PIZARRA_CLARA], columna = 'mes_anio_etiqueta') {
  return visual(id(slug, clave), 'columnChart', pos, {
    roles: { Category: [pColumna(T.CAL, columna)], Y: medidas.map((m) => pMedida(T.VENTAS, m)) },
    sort: ordenAsc(T.CAL, columna),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [{ properties: { show: bool(false) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(9) } }],
      dataPoint: medidas.map((m, i) => ({ properties: { fill: color(colores[i] || C.PIZARRA) }, selector: meta(T.VENTAS, m) })),
    },
    vc: vcTitulo(titulo),
  });
}

// ---- escritura de páginas ----
function escribirPaginas(REPORT, paginas) {
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
  // pages.json: conserva el orden de las páginas existentes; las nuevas van al final en su orden.
  const pagesPath = path.join(pagesDir, 'pages.json');
  const previo = fs.existsSync(pagesPath) ? JSON.parse(fs.readFileSync(pagesPath, 'utf8')) : { pageOrder: [] };
  const mias = paginas.map((p) => p.id);
  const otras = (previo.pageOrder || []).filter((p) => fs.existsSync(path.join(pagesDir, p)));
  const orden = [...otras.filter((p) => !mias.includes(p) || true)];
  for (const m of mias) if (!orden.includes(m)) orden.push(m);
  const activa = previo.activePageName && orden.includes(previo.activePageName) ? previo.activePageName : orden[0];
  fs.writeFileSync(pagesPath, JSON.stringify({ $schema: PAGES_SCHEMA, pageOrder: orden, activePageName: activa }, null, 2) + '\n');
  const n = paginas.reduce((a, p) => a + p.visuales.length, 0);
  console.log(`OK · ${paginas.length} páginas · ${n} visuales → ${pagesDir}`);
}
function reporteDeArgs() {
  const REPORT = path.resolve(process.argv[2] || '');
  if (!REPORT || !fs.existsSync(path.join(REPORT, 'definition', 'pages'))) {
    console.error('FALLO · indicá la ruta al .Report en formato PBIR (definition/pages)');
    process.exit(1);
  }
  return REPORT;
}

module.exports = {
  W, H, FILA, ALTO, T, C, xCol, wCol, id, lit, str, num, int, bool, color, sel, meta, campoMedida, campoColumna,
  pMedida, pColumna, fx, ordenDesc, ordenAsc, visual, reiniciar, vcTitulo, vcDesnudo, texto, textoEstatico, navegador,
  encabezado, pie, segmentador, kpis, ranking, barras, dona, mapa, semaforo, subtotalesMatriz, matriz, bloqueMoneda,
  columnasMensuales, comboMensual, columnasApiladas, escribirPaginas, reporteDeArgs,
};
