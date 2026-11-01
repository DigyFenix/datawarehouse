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

// Lienzo 1280 × 960 (Kraken trae más visuales de los que caben en 720). Sin navegador de páginas
// (sesión 30): encabezado de 56 px, franja de filtros/KPIs de dos renglones de 64 px y tres filas de análisis de 240 px.
const W = 1280, H = 960;
const BANDA = [64, 128];
const FILA = [192, 448, 704];
const ALTO = 240;
// Pie de 16 px en y = 944: la fila 3 termina en 704 + 240 = 944 (antes el pie en 940 la pisaba 4 px en las 23 hojas).
const PIE = { y: H - 16, alto: 16 };

// ---- tablas del modelo (nombres del TMDL que emite generar_pbip.py) ----
const T = {
  VENTAS: 'FC_Ventas', CAL: 'DM_Calendario', CLI: 'DM_Cliente', PROD: 'DM_Producto', VEND: 'DM_Vendedor',
  BOD: 'DM_Bodega', DIR: 'DM_Dirección de entrega', EMP: 'DM_Empresa', MONEDA: 'MD_Moneda de análisis',
  VISTA: 'MD_Vista de ventas', CARGA: 'FC_Estado de carga', CANAL: 'DM_Canal', CONDPAGO: 'DM_Condición de pago',
  ABC: 'DM_Clasificación ABC', RFM: 'DM_Clasificación RFM', PARTIDA: 'MD_Mes de partida', OPORT: 'MD_Vista de oportunidad',
};

// Paleta del tema «Quilate · Azul profundo» (sesión 35): azul petróleo como color de marca, acento ámbar
// para la serie secundaria (líneas en eje derecho, referencias), verde/rojo de estado más sobrios que los de
// Kraken, y neutros fríos para paneles, grilla y encabezados. Las claves se conservan (PIZARRA sigue siendo
// «el color principal») para que los generadores no cambien; solo cambian los valores.
const C = {
  PIZARRA: '#2b4c6f', GRIS_SERIE: '#dfe5ec', PANEL: '#edf2f7', TINTA: '#172532', TINTA_SUAVE: '#64748b',
  VERDE_CELDA: '#cdeedd', ROJO_CELDA: '#f8d0d6', ROJO: '#d3455b', VERDE: '#2a9d6a', PIZARRA_CLARA: '#8fa9c4', BLANCO: '#ffffff',
  ACENTO: '#e0a526', ACENTO_SUAVE: '#f3d58a',
  FILA_ALT: '#f5f8fb', GRILLA: '#e2e8f0', ENCABEZADO: '#e9eff5',
  // Morado de la paleta del tema (dataColors[9]): serie terciaria (saldo, caja). Antes '#8e5ea2' suelto en dos hojas.
  MORADO: '#a06cb5',
  // Variantes OSCURAS para TEXTO (auditoría §6, contraste ≥ 4.5:1 sobre blanco): el ámbar (2.19:1) y el pizarra claro
  // (2.43:1) sirven para rellenos y líneas, nunca para letras. `colorTexto()` hace la traducción.
  ACENTO_TEXTO: '#b9781a', PIZARRA_TEXTO: '#4a6fa5',
};
// Color con que se ESCRIBE una serie: el mismo de su relleno salvo los claros, que pasan a su variante oscura.
const colorTexto = (hex) => ({
  [C.ACENTO]: C.ACENTO_TEXTO, [C.ACENTO_SUAVE]: C.ACENTO_TEXTO, [C.PIZARRA_CLARA]: C.PIZARRA_TEXTO, [C.GRIS_SERIE]: C.TINTA_SUAVE,
}[hex] || hex);

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
// Títulos a la izquierda (sesión 29): lectura más limpia y profesional que el centrado de Kraken.
const vcTitulo = (texto, subtitulo) => {
  const t = (v) => (typeof v === 'string' ? str(v) : v);
  const vc = { title: [{ properties: { show: bool(true), text: t(texto), alignment: str('left'), fontSize: num(11), fontColor: color(C.TINTA) } }] };
  if (subtitulo) vc.subTitle = [{ properties: { show: bool(true), text: t(subtitulo), alignment: str('left'), fontSize: num(9), fontColor: color(C.TINTA_SUAVE) } }];
  return vc;
};
const vcDesnudo = {
  background: [{ properties: { show: bool(false) } }],
  border: [{ properties: { show: bool(false) } }],
  // El tema (sesión 35) pone sombra a todo visual; un texto suelto con sombra parece una tarjeta flotante.
  dropShadow: [{ properties: { show: bool(false) } }],
  visualHeader: [{ properties: { show: bool(false) } }],
  padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
};

// ---- ejes y leyendas (sesión 29, pulido): texto gris suave, grilla fina, sin títulos de eje ----
const ejeCat = (extra = {}) => [{ properties: { showAxisTitle: bool(false), fontSize: num(9), labelColor: color(C.TINTA_SUAVE), ...extra } }];
const ejeValOculto = [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }];
const ejeValGrilla = (extra = {}) => [{ properties: { show: bool(true), showAxisTitle: bool(false), fontSize: num(8), labelColor: color(C.TINTA_SUAVE), labelDisplayUnits: str('1'), labelPrecision: int(0), gridlineShow: bool(true), gridlineColor: color(C.GRILLA), gridlineThickness: num(1), start: num(0), ...extra } }];
const leyenda = (show = true, position = 'Top') => [{ properties: { show: bool(show), position: str(position), fontSize: num(8), labelColor: color(C.TINTA_SUAVE), showTitle: bool(false) } }];

// ---- etiquetas de barras y columnas (decisión de Edwin, sesión 29) ----
// Fondo blanco casi sólido (transparencia 5 %) y texto del color de su serie, para distinguir
// varios valores entre sí. `series`: [[tabla, medida, hex]]; `extra`: propiedades base adicionales.
const FONDO_ETIQUETA = { enableBackground: bool(true), backgroundColor: color(C.BLANCO), backgroundTransparency: num(5) };
// En barras APILADAS Power BI dibuja la etiqueta dentro de su segmento: con fondo blanco parecía partir la barra, así que ahí va sin fondo (`fondo: false`).
function etiquetasBarra(series, extra = {}, { fondo = true } = {}) {
  const base = { show: bool(true), showAll: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0), ...(fondo ? FONDO_ETIQUETA : { enableBackground: bool(false), color: color(C.BLANCO) }), ...extra };
  if (!fondo) return [{ properties: base }];
  if (series.length === 1) base.color = color(colorTexto(series[0][2]));
  return [{ properties: base }, ...(series.length > 1 ? series.map(([t, m, hex]) => ({ properties: { showSeries: bool(true), color: color(colorTexto(hex)) }, selector: meta(t, m) })) : [])];
}

// ---- fábricas ----
function texto(slug, clave, tabla, medida, pos, { size = 12, bold = false, colorHex = C.TINTA, align = 'left' } = {}) {
  return visual(id(slug, clave), 'cardVisual', pos, {
    roles: { Data: [pMedida(tabla, medida)] },
    objects: {
      value: [{ properties: { fontSize: num(size), fontFamily: str(bold ? 'Segoe UI Semibold' : 'Segoe UI'), fontColor: color(colorTexto(colorHex)), horizontalAlignment: str(align) }, selector: sel('default') }],
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
    objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: contenido, textStyle: { fontFamily: 'Segoe UI', fontSize: `${size}px`, color: colorTexto(colorHex) } }], horizontalTextAlignment: align }] } }] },
    vc: vcDesnudo,
  });
}
// Encabezado Kraken: título y "al 16 oct (79%)" a la izquierda, empresa activa arriba a la derecha.
// Sin navegador de páginas (decisión de Edwin, sesión 30): se navega con las pestañas de Power BI y el espacio pasa al análisis.
function encabezado(slug, medidaTitulo, medidaCorte, tablaTitulo = T.VENTAS) {
  return [
    texto(slug, 'chrome-titulo', tablaTitulo, medidaTitulo, [xCol(1), 8, wCol(6), 28], { size: 16, bold: true }),
    texto(slug, 'chrome-corte', T.VENTAS, medidaCorte, [xCol(1), 36, wCol(6), 20], { size: 12 }),
    texto(slug, 'chrome-empresa', T.VENTAS, 'Empresa activa', [xCol(7), 14, wCol(6), 20], { size: 10, colorHex: C.TINTA_SUAVE, align: 'right' }),
  ];
}
function pie(slug) {
  return texto(slug, 'chrome-pie', T.VENTAS, 'Pie de ventas', [xCol(1), PIE.y, wCol(12), PIE.alto], { size: 8, colorHex: C.TINTA_SUAVE });
}

// Segmentador. modo: Dropdown | VerticalList. seleccion: valor inicial (string | number).
// busqueda: por defecto activa en todo desplegable de texto (decisión de Edwin, sesión 29); se apaga en listas cortas (año, moneda, vista, estado).
function segmentador(slug, clave, tabla, columna, pos, { modo = 'Dropdown', seleccion, sync, busqueda, titulo, unico = false, descendente = false } = {}) {
  if (busqueda === undefined) busqueda = modo === 'Dropdown' && !unico && typeof seleccion !== 'number';
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
  // Estilo de campo de formulario (sesión 30, «se ven muy básicos»): tarjeta blanca redondeada, rótulo en
  // mayúsculas pizarra y desplegable relleno gris-azul; las listas verticales quedan sobre blanco.
  // (Un subrayado de acento con items.outlineStyle + general.outlineColor no se renderiza en el desplegable.)
  const lista = modo !== 'Dropdown';
  const objects = {
    data: [{ properties: { mode: str(modo) } }],
    general: [general],
    header: [{ properties: { show: bool(Boolean(titulo)), ...(titulo ? { text: str(titulo.toUpperCase()), bold: bool(false), fontFamily: str('Segoe UI Semibold'), textSize: num(8), fontColor: color(C.PIZARRA), background: color(C.BLANCO), outlineStyle: str('None') } : {}) } }],
    items: [{ properties: { textSize: num(10), fontColor: color(C.TINTA), background: color(lista ? C.BLANCO : C.FILA_ALT) } }],
  };
  objects.selection = [{ properties: unico
    ? { strictSingleSelect: bool(true), selectAllCheckboxEnabled: bool(false) }
    // singleSelect false = varios valores con clic simple, sin Ctrl (en la web nadie sabe del Ctrl; pedido de Edwin, sesión 32).
    : { singleSelect: bool(false), selectAllCheckboxEnabled: bool(true) } }];
  return visual(id(slug, clave), 'slicer', pos, {
    roles: { Values: [pColumna(tabla, columna, true)] },
    sort: descendente ? { sort: [{ field: campoColumna(tabla, columna), direction: 'Descending' }], isDefaultSort: true } : undefined,
    objects,
    // Relleno 2/2: rótulo (28) + desplegable (32) + 4 = 64 px, la altura estándar de un segmentador con rótulo.
    vc: {
      padding: [{ properties: { top: num(2), bottom: num(2), left: num(8), right: num(8) } }],
      background: [{ properties: { show: bool(true), color: color(C.BLANCO), transparency: num(0) } }],
      border: [{ properties: { show: bool(true), color: color(C.GRILLA), radius: num(8) } }],
    },
    sync,
  });
}

// Panel de KPIs (rediseño sesión 37, pedido de Edwin: «más profesional, más elegante»): tarjeta blanca
// del tema, SIN la caja blanca que la tarjeta nueva dibuja por defecto alrededor de cada valor (fillCustom
// apagado) — era eso lo que se veía «básico» —, rótulo gris de 8 pt arriba, cifra de 14 pt en semibold,
// todo alineado a la izquierda como una ficha editorial.
// medidas: [tabla, medida, rótulo?] — el rótulo corto evita que el nombre de la medida se corte a 8 pt.
function kpis(slug, clave, medidas, pos, titulo, subtitulo = 'Moneda de presentación · sin IVA') {
  return visual(id(slug, clave), 'cardVisual', pos, {
    roles: { Data: medidas.map(([t, m]) => pMedida(t, m)) },
    objects: {
      value: [{ properties: { fontSize: num(14), fontFamily: str('Segoe UI Semibold'), fontColor: color(C.TINTA), horizontalAlignment: str('left'), labelDisplayUnits: str('1'), labelPrecision: int(0) }, selector: sel('default') }],
      label: [
        { properties: { show: bool(true), fontSize: num(8), fontFamily: str('Segoe UI'), position: str('aboveValue'), fontColor: color(C.TINTA_SUAVE), horizontalAlignment: str('left'), textWrap: bool(true) }, selector: sel('default') },
        ...medidas.filter(([, , r]) => r).map(([t, m, r]) => ({ properties: { text: str(r) }, selector: meta(t, m) })),
      ],
      outline: [{ properties: { show: bool(false) }, selector: sel('default') }],
      fillCustom: [{ properties: { show: bool(false) } }, { properties: { show: bool(false) }, selector: sel('default') }],
      padding: [{ properties: { paddingUniform: int(4) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(4), style: str('Table'), backgroundShow: bool(false) }, selector: sel('default') }],
      spacing: [{ properties: { verticalSpacing: num(4) }, selector: sel('default') }],
    },
    vc: {
      ...vcTitulo(titulo, subtitulo),
      background: [{ properties: { show: bool(true), color: color(C.BLANCO), transparency: num(0) } }],
    },
  });
}

// Ranking: barra simple con el monto fuera del extremo. (Sesión 29: se retiró la barra fantasma
// "resto a máximo" apilada detrás — Power BI oculta toda etiqueta que no cabe en su segmento apilado,
// así que las barras cortas quedaban sin monto. El parámetro `resto` se conserva por compatibilidad.)
// Información sobre herramientas de los rankings de cliente y producto (auditoría §6): al pasar sobre la barra,
// el contexto que el monto solo no da. Solo cuando la barra mide ventas (las medidas viven en FC_Ventas).
const TOOLTIPS_RANKING = {
  [T.CLI]: ['Documentos de venta', 'Ticket promedio', 'Variación vs año anterior'],
  [T.PROD]: ['Unidades vendidas', 'Precio promedio unidad', 'Variación vs año anterior'],
};
function ranking(slug, clave, pos, tabla, columna, titulo, dim, medida = 'Ventas netas', resto = `Resto a máximo ${dim}`, tablaMedida = T.VENTAS, { margen = 45 } = {}) {
  void resto;
  const tips = tablaMedida === T.VENTAS ? (TOOLTIPS_RANKING[tabla] || []).filter((m) => m !== medida) : [];
  return visual(id(slug, clave), 'barChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(tablaMedida, medida)], ...(tips.length ? { Tooltips: tips.map((m) => pMedida(T.VENTAS, m)) } : {}) },
    sort: ordenDesc(tablaMedida, medida),
    objects: {
      categoryAxis: ejeCat({ fontSize: num(8), maxMarginFactor: num(margen) }),
      valueAxis: ejeValOculto,
      // OutsideEnd sin desborde: Power BI acorta las barras para que el monto completo quepa dentro del visual
      // (con desborde, el monto de la barra más larga se salía del visual; con Auto, lo recortaba dentro de la barra).
      labels: etiquetasBarra([[tablaMedida, medida, C.PIZARRA]], { labelPosition: str('OutsideEnd'), labelOverflow: bool(false) }),
      dataPoint: [{ properties: { fill: color(C.PIZARRA) } }, { properties: { fill: color(C.PIZARRA) }, selector: meta(tablaMedida, medida) }],
      legend: leyenda(false),
    },
    vc: vcTitulo(titulo),
  });
}
// Barras simples (sin fantasma) por categoría, orden descendente.
function barras(slug, clave, pos, tabla, columna, titulo, medidas, colores = [C.PIZARRA, C.ROJO, C.VERDE], { apilado = true, leyenda: conLeyenda = false } = {}) {
  return visual(id(slug, clave), apilado ? 'barChart' : 'clusteredBarChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: medidas.map((m) => pMedida(T.VENTAS, m)) },
    sort: ordenDesc(T.VENTAS, medidas[0]),
    objects: {
      categoryAxis: ejeCat({ fontSize: num(8), maxMarginFactor: num(45) }),
      valueAxis: ejeValOculto,
      // OutsideEnd: con fondo blanco, la etiqueta centrada partía la barra en dos.
      labels: etiquetasBarra(medidas.map((m, i) => [T.VENTAS, m, colores[i] || C.PIZARRA]), apilado ? {} : { labelPosition: str('OutsideEnd'), labelOverflow: bool(true) }, { fondo: !apilado }),
      dataPoint: [{ properties: { fill: color(colores[0] || C.PIZARRA) } }, ...medidas.map((m, i) => ({ properties: { fill: color(colores[i] || C.PIZARRA) }, selector: meta(T.VENTAS, m) }))],
      legend: leyenda(conLeyenda),
    },
    vc: vcTitulo(titulo),
  });
}
function dona(slug, clave, pos, tabla, columna, titulo, medida = 'Ventas netas', tablaMedida = T.VENTAS) {
  return visual(id(slug, clave), 'donutChart', pos, {
    roles: { Category: [pColumna(tabla, columna)], Y: [pMedida(tablaMedida, medida)] },
    sort: ordenDesc(tablaMedida, medida),
    objects: {
      // Nombres en leyenda inferior y solo el monto en el gajo: con "Both" los nombres largos se recortaban ("Vence e… Q 24,267").
      legend: leyenda(true, 'Bottom'),
      labels: [{ properties: { show: bool(true), labelStyle: str('Data'), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0), color: color(C.TINTA) } }],
      dataPoint: [{ properties: { borderShow: bool(true), borderColor: color(C.BLANCO), borderSize: num(2) } }],
    },
    vc: vcTitulo(titulo),
  });
}
function mapa(slug, clave, pos, titulo, medida = 'Ventas netas') {
  return visual(id(slug, clave), 'azureMap', pos, {
    roles: { Category: [pColumna(T.DIR, 'ciudad')], Size: [pMedida(T.VENTAS, medida)] },
    objects: {
      legend: [{ properties: { show: bool(false) } }],
      bubbleLayer: [{ properties: { fillColor: color(C.PIZARRA) } }],
      // Sin selector de estilo ni botones de zoom: tapaban el mapa en 2 columnas.
      mapControls: [{ properties: { showNavigationControls: bool(false), showStylePicker: bool(false), showSelectionControl: bool(false), autoZoom: bool(true) } }],
    },
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
// Mapa de calor de celdas (gradiente sobre la medida indicada). PENDIENTE (sesión 35): Desktop no pinta el FillRule
// escrito desde PBIR (probado linearGradient2 y 3, con y sin fondos fijos); la matriz queda sin color hasta aclararlo.
const calor = (medida, tabla = T.VENTAS) => [{
  properties: { backColor: { solid: { color: { expr: { FillRule: {
    Input: campoMedida(tabla, medida),
    FillRule: { linearGradient2: {
      min: { color: { Literal: { Value: `'${C.BLANCO.toUpperCase()}'` } } },
      max: { color: { Literal: { Value: `'${C.ACENTO.toUpperCase()}'` } } },
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
// anchoColumnas: { 'medida': px } fija el ancho de columnas de valores concretas (p. ej. una medida de nombre largo en una matriz angosta).
function matriz(slug, clave, pos, titulo, { filas, columnas, valores, semaforoEn, calorEn, filaTotal = false, columnaTotal = true, ordenPor, anchoFilas, anchoColumnas, expandir }) {
  const roles = { Rows: filas.map(([t, c]) => pColumna(t, c)), Values: valores.map(([t, m]) => pMedida(t, m)) };
  if (columnas) roles.Columns = columnas.map(([t, c]) => pColumna(t, c));
  const v = visual(id(slug, clave), 'pivotTable', pos, {
    roles,
    sort: ordenPor ? ordenDesc(ordenPor[0], ordenPor[1]) : undefined,
    objects: {
      // Estilo de tabla (sesión 29): encabezados discretos (8 pt, gris, sin negrita, solo línea inferior),
      // bandas alternas, grilla horizontal fina sin verticales, totales en negrita sobre fondo panel.
      // Sin ancho fijo de filas, las columnas crecen hasta llenar el visual (las matrices chicas dejaban medio panel vacío).
      columnHeaders: [{ properties: { columnAdjustment: str('growToFit'), autoSizeColumnWidth: bool(!anchoFilas), autoExpand: bool(true), fontSize: num(8), bold: bool(false), fontColor: color(C.TINTA_SUAVE), backColor: color(C.BLANCO), outlineStyle: str('BottomOnly'), outlineColor: color(C.PIZARRA_CLARA), outlineWeight: num(1), wordWrap: bool(true) } }],
      rowHeaders: [{ properties: { fontSize: num(9), bold: bool(false), wordWrap: bool(false), fontColor: color(C.TINTA), backColor: color(C.BLANCO), outlineStyle: str('None') } }],
      values: [
        // Con formato condicional (semáforo / calor) no se fijan fondos: un fondo estático pisa la regla de color.
        { properties: { fontSize: num(9), fontColorPrimary: color(C.TINTA), fontColorSecondary: color(C.TINTA), ...((semaforoEn || calorEn) ? {} : { backColorPrimary: color(C.BLANCO), backColorSecondary: color(C.FILA_ALT) }), outlineStyle: str('None') } },
        ...(semaforoEn ? semaforo(semaforoEn[1], semaforoEn[0]) : []),
        ...(calorEn ? calor(calorEn[1], calorEn[0]) : []),
      ],
      subTotals: [
        ...subtotalesMatriz({ filaTotal, columnaTotal }),
        { properties: { fontSize: num(9), fontColor: color(C.TINTA), backColor: color(C.ENCABEZADO), applyToHeaders: bool(true) } },
      ],
      grid: [{ properties: { rowPadding: num(3), gridVertical: bool(false), gridHorizontal: bool(true), gridHorizontalColor: color(C.GRILLA), gridHorizontalWeight: num(1), outlineColor: color(C.GRILLA), outlineWeight: num(1), textSize: num(9) } }],
      // Ancho fijo del encabezado de fila: con autoajuste el nombre del cliente se come todo el ancho y los valores quedan detrás del scroll.
      ...((anchoFilas || anchoColumnas) ? { columnWidth: [
        ...(anchoFilas ? [{ properties: { value: num(anchoFilas) }, selector: meta(filas[0][0], filas[0][1]) }] : []),
        ...Object.entries(anchoColumnas || {}).map(([m, px]) => ({ properties: { value: num(px) }, selector: meta((valores.find(([, v]) => v === m) || [T.VENTAS])[0], m) })),
      ] } : {}),
    },
    // stylePreset None: el preset por defecto pisa cualquier color de fila/encabezado puesto en objects.
    vc: { ...vcTitulo(titulo), stylePreset: [{ properties: { name: str('None') } }] },
  });
  // Columnas jerárquicas (p. ej. Estado › Rango): `expandir` lista los valores del primer nivel que se
  // abren de entrada (Desktop exige los nodos en root.children).
  if (columnas && columnas.length > 1 && expandir) {
    v.visual.expansionStates = [{
      roles: ['Columns'],
      // Formato tal como lo escribe Desktop: isCollapsed:true en todos los niveles (= solo nodos concretos abiertos).
      levels: columnas.map(([t, c], i) => (i < columnas.length - 1
        ? { queryRefs: [`${t}.${c}`], isCollapsed: false, isPinned: true, identityKeys: [campoColumna(t, c)] }
        : { queryRefs: [`${t}.${c}`], isCollapsed: false, isPinned: true })),
      root: { children: expandir.map((valor) => ({ identityValues: [{ Literal: { Value: `'${valor}'` } }], isToggled: true })) },
    }];
  }
  return v;
}
// Eje de valores visible: montos completos, nunca "0.3 mill.".
const ejeValores = (extra = {}) => [{ properties: { showAxisTitle: bool(false), fontSize: num(8), labelColor: color(C.TINTA_SUAVE), labelDisplayUnits: str('1'), labelPrecision: int(0), gridlineColor: color(C.GRILLA), gridlineThickness: num(1), ...extra } }];
// Eje de categorías con título explícito (p. ej. «Día del mes») cuando el valor solo no se entiende.
const ejeCategoria = (titulo, extra = {}) => [{ properties: { showAxisTitle: bool(Boolean(titulo)), ...(titulo ? { titleText: str(titulo), titleFontSize: num(9), titleColor: color(C.TINTA_SUAVE) } : {}), fontSize: num(9), labelColor: color(C.TINTA_SUAVE), ...extra } }];
// Marcadores para TODA gráfica de líneas (entrada base de lineStyles; los selectores por serie se agregan después).
const marcadores = { properties: { showMarker: bool(true), markerShape: str('circle'), markerSize: num(4), strokeWidth: num(2) } };
// Series diarias (30+ puntos): marcador más pequeño para que la línea no se vea como un collar.
const marcadoresFinos = { properties: { showMarker: bool(true), markerShape: str('circle'), markerSize: num(2), strokeWidth: num(2) } };
// Bloque "Moneda" de Kraken: moneda + medida.
function bloqueMoneda(slug, col = 10, ancho = 3) {
  return [
    segmentador(slug, 'moneda', T.MONEDA, 'Moneda de análisis', [xCol(col), BANDA[0], wCol(ancho), 64], { unico: true, seleccion: 'Quetzales (local)', sync: 'moneda', titulo: 'Moneda' }),
    segmentador(slug, 'vista', T.VISTA, 'Vista de ventas', [xCol(col), BANDA[1], wCol(ancho), 64], { sync: 'vista', titulo: 'Vista', busqueda: false }),
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
      categoryAxis: ejeCat({ innerPadding: int(35) }),
      valueAxis: ejeValGrilla(),
      labels: [
        // Columnas verticales: monto completo a 8 pt con desborde permitido (decisión de Edwin: nunca unidades automáticas).
        ...etiquetasBarra([[T.VENTAS, actual, C.PIZARRA], [T.VENTAS, anterior, C.TINTA_SUAVE]], { labelPosition: str('OutsideEnd'), labelOverflow: bool(true) }),
        { properties: { showSeries: bool(false) }, selector: meta(T.VENTAS, anterior) },
      ],
      legend: leyenda(false),
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
      categoryAxis: ejeCat({ innerPadding: int(35) }),
      valueAxis: ejeValGrilla({ secShow: bool(false) }),
      labels: [
        ...etiquetasBarra(columnas.map((m, i) => [T.VENTAS, m, i === 0 ? C.PIZARRA : C.PIZARRA_CLARA])),
        // La línea (promedio / conteo) no lleva etiqueta: ensucia las columnas.
        { properties: { show: bool(false), showSeries: bool(false) }, selector: meta(T.VENTAS, linea) },
      ],
      legend: leyenda(true),
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
      categoryAxis: ejeCat({ innerPadding: int(35) }),
      valueAxis: ejeValGrilla(),
      // Sin etiquetas: en apilado Power BI recorta todo monto que no cabe en su segmento ("Q 34..."); el detalle va en el tooltip.
      labels: [{ properties: { show: bool(false) } }],
      legend: leyenda(true),
      dataPoint: medidas.map((m, i) => ({ properties: { fill: color(colores[i] || C.PIZARRA) }, selector: meta(T.VENTAS, m) })),
    },
    vc: vcTitulo(titulo),
  });
}


// ---- helpers genéricos con tablas explícitas (sesión 34, movidos aquí en la 35 para compartirlos) ----
// Línea: series = [[tabla, medida, hex, punteada?]]; categoría = [tabla, columna].
function linea(slug, clave, pos, titulo, subtitulo, [tCat, cCat], series, { etiquetas = false, finos = false, tituloEje, filtros } = {}) {
  return visual(id(slug, clave), 'lineChart', pos, {
    filtros,
    roles: { Category: [pColumna(tCat, cCat)], Y: series.map(([t, m]) => pMedida(t, m)) },
    sort: ordenAsc(tCat, cCat),
    objects: {
      categoryAxis: tituloEje ? ejeCategoria(tituloEje) : ejeCat(),
      valueAxis: ejeValores({ start: num(0) }),
      labels: [{ properties: { show: bool(etiquetas), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0), color: color(C.TINTA_SUAVE) } }],
      legend: leyenda(series.length > 1),
      lineStyles: [finos ? marcadoresFinos : marcadores, ...series.filter(([, , , p]) => p).map(([t, m]) => ({ properties: { lineStyle: str('dotted'), strokeWidth: num(2) }, selector: meta(t, m) }))],
      dataPoint: series.map(([t, m, hex]) => ({ properties: { fill: color(hex) }, selector: meta(t, m) })),
    },
    vc: vcTitulo(titulo, subtitulo),
  });
}
// Columnas agrupadas (o apiladas) con tablas explícitas: series = [[tabla, medida, hex]].
function columnas(slug, clave, pos, titulo, subtitulo, [tCat, cCat], series, { apilado = false, etiquetas = true } = {}) {
  return visual(id(slug, clave), apilado ? 'columnChart' : 'clusteredColumnChart', pos, {
    roles: { Category: [pColumna(tCat, cCat)], Y: series.map(([t, m]) => pMedida(t, m)) },
    sort: ordenAsc(tCat, cCat),
    objects: {
      categoryAxis: ejeCat({ innerPadding: int(35) }),
      valueAxis: ejeValGrilla(),
      labels: etiquetas && !apilado ? etiquetasBarra(series, { labelPosition: str('OutsideEnd'), labelOverflow: bool(true) }) : [{ properties: { show: bool(false) } }],
      legend: leyenda(series.length > 1),
      dataPoint: series.map(([t, m, hex]) => ({ properties: { fill: color(hex) }, selector: meta(t, m) })),
    },
    vc: vcTitulo(titulo, subtitulo),
  });
}
// Columnas + línea en eje secundario. `ejeSecundario: true` muestra el eje derecho con su propia escala:
// obligatorio cuando la línea no es de la misma magnitud que las columnas (acumulados, porcentajes). Sin él,
// una línea «flujo neto» sobre columnas «cobros» cae exactamente a la altura de las columnas y parece un error.
function combo(slug, clave, pos, titulo, subtitulo, [tCat, cCat], columnasSeries, [tL, mL, hexL], { etiquetaLinea = false, ejeSecundario = false } = {}) {
  return visual(id(slug, clave), 'lineClusteredColumnComboChart', pos, {
    roles: { Category: [pColumna(tCat, cCat)], Y: columnasSeries.map(([t, m]) => pMedida(t, m)), Y2: [pMedida(tL, mL)] },
    sort: ordenAsc(tCat, cCat),
    objects: {
      categoryAxis: ejeCat({ innerPadding: int(35) }),
      valueAxis: ejeValGrilla({ secShow: bool(ejeSecundario), secStart: num(0), secFontSize: num(8), secLabelColor: color(C.TINTA_SUAVE), secShowAxisTitle: bool(false), secLabelDisplayUnits: str('1'), secLabelPrecision: int(0), secGridlineShow: bool(false) }),
      labels: [...etiquetasBarra(columnasSeries), { properties: { show: bool(etiquetaLinea), showSeries: bool(etiquetaLinea) }, selector: meta(tL, mL) }],
      legend: leyenda(true),
      dataPoint: [...columnasSeries.map(([t, m, hex]) => ({ properties: { fill: color(hex) }, selector: meta(t, m) })), { properties: { fill: color(hexL) }, selector: meta(tL, mL) }],
      lineStyles: [marcadores],
    },
    vc: vcTitulo(titulo, subtitulo),
  });
}
// Barras horizontales con tablas explícitas (apiladas por defecto), orden por la primera serie.
function barrasH(slug, clave, pos, titulo, [tCat, cCat], series, { apilado = true, ordenPorColumna = false, subtitulo, margen = 45 } = {}) {
  return visual(id(slug, clave), apilado ? 'barChart' : 'clusteredBarChart', pos, {
    roles: { Category: [pColumna(tCat, cCat)], Y: series.map(([t, m]) => pMedida(t, m)) },
    sort: ordenPorColumna ? ordenAsc(tCat, cCat) : ordenDesc(series[0][0], series[0][1]),
    objects: {
      categoryAxis: ejeCat({ fontSize: num(8), maxMarginFactor: num(margen) }),
      valueAxis: ejeValOculto,
      labels: etiquetasBarra(series, apilado && series.length > 1 ? {} : { labelPosition: str('OutsideEnd'), labelOverflow: bool(false) }, { fondo: !(apilado && series.length > 1) }),
      dataPoint: [{ properties: { fill: color(series[0][2]) } }, ...series.map(([t, m, hex]) => ({ properties: { fill: color(hex) }, selector: meta(t, m) }))],
      legend: leyenda(series.length > 1),
    },
    vc: vcTitulo(titulo, subtitulo),
  });
}
// Pareto: barras del monto por categoría + línea del % acumulado en eje secundario (0-100 %) + referencia 80 %.
function pareto(slug, clave, pos, titulo, subtitulo, [tCat, cCat], [tM, monto], [tP, pct]) {
  return visual(id(slug, clave), 'lineClusteredColumnComboChart', pos, {
    roles: { Category: [pColumna(tCat, cCat)], Y: [pMedida(tM, monto)], Y2: [pMedida(tP, pct), pMedida(T.VENTAS, 'Referencia 80 %')] },
    sort: ordenDesc(tM, monto),
    objects: {
      // 8 pt: a 7 pt los nombres del eje no se leían (auditoría §6).
      categoryAxis: ejeCat({ innerPadding: int(20), fontSize: num(8), preferredCategoryWidth: num(16) }),
      valueAxis: ejeValGrilla({ secShow: bool(true), secStart: num(0), secEnd: num(1), secFontSize: num(8), secLabelColor: color(C.TINTA_SUAVE), secShowAxisTitle: bool(false) }),
      labels: [{ properties: { show: bool(false) } }],
      legend: leyenda(true),
      dataPoint: [{ properties: { fill: color(C.PIZARRA) }, selector: meta(tM, monto) }, { properties: { fill: color(C.ACENTO) }, selector: meta(tP, pct) }, { properties: { fill: color(C.TINTA_SUAVE) }, selector: meta(T.VENTAS, 'Referencia 80 %') }],
      lineStyles: [{ properties: { showMarker: bool(true), markerShape: str('circle'), markerSize: num(3), strokeWidth: num(2) } }, { properties: { showMarker: bool(false), lineStyle: str('dashed'), strokeWidth: num(1) }, selector: meta(T.VENTAS, 'Referencia 80 %') }],
    },
    vc: vcTitulo(titulo, subtitulo),
  });
}
// Cascada (puente): categoría → aporte; el total lo dibuja Power BI.
function cascada(slug, clave, pos, titulo, subtitulo, [tCat, cCat], [tM, m]) {
  return visual(id(slug, clave), 'waterfallChart', pos, {
    roles: { Category: [pColumna(tCat, cCat)], Y: [pMedida(tM, m)] },
    sort: ordenDesc(tM, m),
    objects: {
      categoryAxis: ejeCat(),
      valueAxis: ejeValGrilla(),
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: int(0), color: color(C.TINTA) } }],
      legend: leyenda(false),
      sentimentColors: [{ properties: { increaseFill: color(C.VERDE), decreaseFill: color(C.ROJO), totalFill: color(C.PIZARRA) } }],
    },
    vc: vcTitulo(titulo, subtitulo),
  });
}
// Panel de alertas narrativas: tarjeta gris-azul con título y una línea por medida (texto completo).
function panelAlertas(slug, clave, pos, titulo, subtitulo, alertas) {
  const [x, y, w, h] = pos;
  const vs = [visual(id(slug, clave), 'textbox', pos, {
    objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: titulo, textStyle: { fontFamily: 'Segoe UI Semibold', fontSize: '11pt', color: C.TINTA } }] }, { textRuns: [{ value: subtitulo, textStyle: { fontFamily: 'Segoe UI', fontSize: '9pt', color: C.TINTA_SUAVE } }] }] } }] },
    vc: { background: [{ properties: { show: bool(true), color: color(C.PANEL), transparency: num(0) } }], border: [{ properties: { show: bool(false) } }], visualHeader: [{ properties: { show: bool(false) } }], padding: [{ properties: { top: num(8), bottom: num(8), left: num(12), right: num(12) } }] },
  })];
  const alto = Math.floor((h - 56) / alertas.length);
  alertas.forEach(([tabla, medida, hex], i) => {
    vs.push(texto(slug, `${clave}-texto-${i}`, tabla, medida, [x + 12, y + 52 + i * alto, w - 24, alto], { size: 9, colorHex: hex || C.TINTA, align: 'left' }));
  });
  return vs;
}

// Panel de focos de atención (rediseño sesión 37): un panel gris suave y, dentro, una fila blanca por foco
// con barra de color a la izquierda, la CIFRA grande (16 pt, del color del foco) y el DETALLE en gris de 9 pt.
// Cada foco son dos medidas de texto (…· cifra / …· detalle) para que el número se lea de un vistazo y la
// explicación no compita con él. Las filas y la barra son textboxes con fondo (patrón ya verificado en render).
// focos: [[tabla, medidaCifra, medidaDetalle, hex, hojaDestino?]] — la hoja destino se escribe a la derecha de la
// cifra («Ver hoja Por cobrar →»): un foco que no dice dónde mirar obliga a buscar entre 23 pestañas.
function panelFocos(slug, clave, pos, titulo, subtitulo, focos) {
  const [x, y, w, h] = pos;
  const fondo = (hex) => ({
    background: [{ properties: { show: bool(true), color: color(hex), transparency: num(0) } }],
    border: [{ properties: { show: bool(false) } }],
    dropShadow: [{ properties: { show: bool(false) } }],
    visualHeader: [{ properties: { show: bool(false) } }],
    padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
  });
  const caja = (clv, hex, posicion) => visual(id(slug, clv), 'textbox', posicion, {
    objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: '' }] }] } }] },
    vc: fondo(hex),
  });
  const vs = [visual(id(slug, clave), 'textbox', pos, {
    objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: titulo, textStyle: { fontFamily: 'Segoe UI Semibold', fontSize: '11pt', color: C.TINTA } }] }, { textRuns: [{ value: subtitulo, textStyle: { fontFamily: 'Segoe UI', fontSize: '9pt', color: C.TINTA_SUAVE } }] }] } }] },
    vc: { ...fondo(C.PANEL), padding: [{ properties: { top: num(10), bottom: num(8), left: num(14), right: num(14) } }] },
  })];
  const margen = 12, cabecera = 54, sep = 8;
  const altoFila = Math.floor((h - cabecera - margen - sep * (focos.length - 1)) / focos.length);
  focos.forEach(([tabla, cifra, detalle, hex, destino], i) => {
    const fy = y + cabecera + i * (altoFila + sep);
    const anchoDestino = destino ? 132 : 0;
    vs.push(caja(`${clave}-fila-${i}`, C.BLANCO, [x + margen, fy, w - margen * 2, altoFila]));
    vs.push(caja(`${clave}-barra-${i}`, hex, [x + margen, fy, 5, altoFila]));
    vs.push(texto(slug, `${clave}-cifra-${i}`, tabla, cifra, [x + margen + 16, fy + 8, w - margen * 2 - 24 - anchoDestino, Math.floor(altoFila * 0.5)], { size: 16, bold: true, colorHex: hex, align: 'left' }));
    if (destino) vs.push(textoEstatico(slug, `${clave}-destino-${i}`, `Ver hoja ${destino} →`, [x + w - margen - 8 - anchoDestino, fy + 12, anchoDestino, 16], { size: 8, colorHex: C.PIZARRA_TEXTO, align: 'right' }));
    vs.push(texto(slug, `${clave}-detalle-${i}`, tabla, detalle, [x + margen + 16, fy + Math.floor(altoFila * 0.5) + 6, w - margen * 2 - 24, altoFila - Math.floor(altoFila * 0.5) - 10], { size: 9, colorHex: C.TINTA_SUAVE, align: 'left' }));
  });
  return vs;
}

// Filtro a nivel de visual: columna = literal (p. ej. es_pasado = true). `valor` ya formateado como literal DAX/PBIR ('true', 2026L, "'texto'").
function filtroVisual(tabla, columna, valor) {
  return {
    name: id('filtro', tabla, columna, String(valor)),
    field: campoColumna(tabla, columna),
    type: 'Categorical',
    filter: { Version: 2, From: [{ Name: 'f', Entity: tabla, Type: 0 }], Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: columna } }], Values: [[{ Literal: { Value: String(valor) } }]] } } }] },
  };
}

// ---- escritura de páginas ----
function escribirPaginas(REPORT, paginas) {
  const pagesDir = path.join(REPORT, 'definition', 'pages');
  for (const pg of paginas) {
    const dir = path.join(pagesDir, pg.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true });
    // Lienzo blanco (Edwin, sesión 30, desde Desktop): ThemeDataColor 0 = blanco del tema, tal como lo escribe Desktop.
    const blanco = { color: { solid: { color: { expr: { ThemeDataColor: { ColorId: 0, Percent: 0 } } } } } };
    fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({
      $schema: PAGE_SCHEMA, name: pg.id, displayName: pg.nombre, displayOption: 'FitToPage', height: H, width: W,
      objects: { background: [{ properties: blanco }] },
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
  W, H, BANDA, FILA, ALTO, PIE, T, C, colorTexto, xCol, wCol, id, lit, str, num, int, bool, color, sel, meta, campoMedida, campoColumna,
  pMedida, pColumna, fx, ordenDesc, ordenAsc, visual, reiniciar, vcTitulo, vcDesnudo, texto, textoEstatico,
  encabezado, pie, segmentador, kpis, ranking, barras, dona, mapa, semaforo, subtotalesMatriz, matriz, marcadores, marcadoresFinos, ejeValores, ejeCategoria, ejeCat, ejeValOculto, ejeValGrilla, leyenda, etiquetasBarra, bloqueMoneda,
  columnasMensuales, comboMensual, columnasApiladas, escribirPaginas, reporteDeArgs,
  calor, linea, columnas, combo, barrasH, pareto, cascada, panelAlertas, panelFocos, filtroVisual,
};

// Paleta compartida con el validador (validar_reporte.py la lee de paleta.json): un solo lugar define los
// colores; el validador acusa todo hex que no esté aquí ni en el tema, y todo TEXTO con un color claro.
function exportarPaleta(ruta = path.join(__dirname, 'paleta.json')) {
  const claros = [C.ACENTO, C.ACENTO_SUAVE, C.PIZARRA_CLARA, C.GRIS_SERIE];
  fs.writeFileSync(ruta, JSON.stringify({ colores: C, prohibidosEnTexto: claros, lienzo: { W, H }, pie: PIE }, null, 2) + '\n');
  return ruta;
}
module.exports.exportarPaleta = exportarPaleta;
if (require.main === module && process.argv[2] === '--paleta') console.log('OK · paleta →', exportarPaleta());
