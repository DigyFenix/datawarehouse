// Genera la página 00 · Inicio de PulsoCresta en PBIR (piloto del flujo con CLI + Desktop Bridge).
// GUIDs fijos: re-ejecutar produce exactamente los mismos archivos (idempotente).
'use strict';
const fs = require('fs');
const path = require('path');

const REPORT = 'C:/Claudews/datawarehouse/organizaciones/grupocresta/powerbi/PulsoCresta.Report';
const PAGE_ID = '7c8a4f50e7243aa4fd4d'; // GUID de la 00 en la ola retirada (f01c0cd) — estable
const PAGE_DIR = path.join(REPORT, 'definition/pages', PAGE_ID);
const VC_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json';
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json';

const ESTADO_CARGA = 'FC_Estado de carga';

// ---- helpers de codificación PBIR ----
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const str = (s) => lit(`'${s}'`);
const num = (n) => lit(`${n}D`);
const int = (n) => lit(`${n}L`);
const boolLit = (b) => lit(`${b}`);
const color = (hex) => ({ solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } } });
const measure = (table, name) => ({
  field: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: name } },
  queryRef: `${table}.${name}`,
  nativeQueryRef: name,
});
const column = (table, name) => ({
  field: { Column: { Expression: { SourceRef: { Entity: table } }, Property: name } },
  queryRef: `${table}.${name}`,
  nativeQueryRef: name,
});
const sel = (id) => ({ id });

// VCO comunes: sin fondo/borde/padding (elementos de chrome)
const vcoDesnudo = {
  background: [{ properties: { show: boolLit(false) } }],
  border: [{ properties: { show: boolLit(false) } }],
  visualHeader: [{ properties: { show: boolLit(false) } }],
  padding: [{ properties: { top: num(0), bottom: num(0), left: num(0), right: num(0) } }],
};

let z = 0;
const nextZ = () => (z += 100);

function visual(id, pos, visualDef) {
  const zi = nextZ();
  return {
    id,
    json: {
      $schema: VC_SCHEMA,
      name: id,
      position: { x: pos[0], y: pos[1], z: zi, height: pos[3], width: pos[2], tabOrder: zi },
      visual: visualDef,
    },
  };
}

// textbox dinámico: una medida como único text run
function textboxMedida(id, pos, table, measureName, style, align) {
  const runId = `run_${id}`;
  return visual(id, pos, {
    visualType: 'textbox',
    objects: {
      general: [{
        properties: {
          paragraphs: [{
            textRuns: [{
              value: { propertyIdentifier: { objectName: 'values', propertyName: 'expr' }, selector: sel(runId) },
              textStyle: style,
            }],
            horizontalTextAlignment: align,
          }],
        },
      }],
      values: [{
        properties: { expr: { expr: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: measureName } } } },
        selector: sel(runId),
      }],
    },
    visualContainerObjects: vcoDesnudo,
  });
}

// tarjeta de alerta: una medida, accent bar de estado a la izquierda
function tarjetaAlerta(id, pos, table, measureName, accentHex) {
  return visual(id, pos, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [measure(table, measureName)] } } },
    objects: {
      value: [{ properties: { fontSize: num(16), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') }],
      label: [{ properties: { show: boolLit(true), fontSize: num(10) }, selector: sel('default') }],
      outline: [{ properties: { show: boolLit(false) }, selector: sel('default') }],
      accentBar: [{
        properties: {
          show: boolLit(true),
          position: str('Left'),
          width: num(4),
          color: color(accentHex),
        },
        selector: sel('default'),
      }],
      padding: [{ properties: { paddingUniform: int(4) }, selector: sel('default') }],
      layout: [{ properties: { paddingUniform: int(0) }, selector: sel('default') }],
      spacing: [{ properties: { verticalSpacing: num(2) }, selector: sel('default') }],
    },
    visualContainerObjects: {
      title: [{ properties: { show: boolLit(false) } }],
      padding: [{ properties: { top: num(4), bottom: num(4), left: num(4), right: num(4) } }],
    },
  });
}

// botón de navegación (la acción se cablea cuando exista la página destino)
function botonNav(id, pos, texto) {
  return visual(id, pos, {
    visualType: 'actionButton',
    objects: {
      text: [{
        properties: {
          show: boolLit(true),
          text: str(texto),
          fontSize: num(13),
          fontFamily: str('Segoe UI Semibold'),
          fontColor: color('#0043af'),
          horizontalAlignment: str('center'),
          verticalAlignment: str('middle'),
        },
        selector: sel('default'),
      }],
      outline: [
        { properties: { show: boolLit(false) } },
        { properties: { show: boolLit(false) }, selector: sel('default') },
        { properties: { show: boolLit(false) }, selector: sel('hover') },
      ],
      fill: [
        { properties: { show: boolLit(true) } },
        { properties: { show: boolLit(true), fillColor: color('#FFFFFF'), transparency: num(0) }, selector: sel('default') },
      ],
    },
  });
}

const visuales = [];

// 1 · banda de encabezado (el tema pinta el shape con el azul de marca)
visuales.push(visual('e5b0a1d4c3f2019887a0', [0, 0, 1280, 72], {
  visualType: 'shape',
  objects: {
    shape: [{ properties: { tileShape: str('rectangle') } }],
  },
  visualContainerObjects: vcoDesnudo,
}));

// 2 · título de página: tarjeta de la medida 'Título de Inicio', transparente sobre la banda
visuales.push(visual('a1b2c3d4e5f601728394', [24, 8, 608, 56], {
  visualType: 'cardVisual',
  query: { queryState: { Data: { projections: [measure(ESTADO_CARGA, 'Título de Inicio')] } } },
  objects: {
    value: [{
      properties: {
        fontSize: num(15),
        fontFamily: str('Segoe UI Semibold'),
        fontColor: color('#FFFFFF'),
        horizontalAlignment: str('left'),
      },
      selector: sel('default'),
    }],
    label: [{ properties: { show: boolLit(false) }, selector: sel('default') }],
    outline: [{ properties: { show: boolLit(false) }, selector: sel('default') }],
    fillCustom: [
      { properties: { show: boolLit(false) } },
      { properties: { show: boolLit(false) }, selector: sel('default') },
    ],
    padding: [{ properties: { paddingUniform: int(0) }, selector: sel('default') }],
    layout: [{
      properties: { paddingUniform: int(0), backgroundShow: boolLit(false) },
      selector: sel('default'),
    }],
    spacing: [{ properties: { verticalSpacing: num(0) }, selector: sel('default') }],
  },
  visualContainerObjects: vcoDesnudo,
}));

// 3 · navegador de páginas (tinta blanca sobre azul)
visuales.push(visual('0f1e2d3c4b5a69788796', [648, 20, 504, 32], {
  visualType: 'pageNavigator',
  objects: {
    fill: [
      { properties: { show: boolLit(true) } },
      { properties: { show: boolLit(true), fillColor: color('#FFFFFF'), transparency: num(92) }, selector: sel('default') },
      { properties: { show: boolLit(true), fillColor: color('#FFFFFF'), transparency: num(75) }, selector: sel('selected') },
    ],
    text: [
      { properties: { fontColor: color('#FFFFFF'), fontSize: num(10), fontFamily: str('Segoe UI Semibold') } },
      { properties: { fontColor: color('#FFFFFF'), fontSize: num(10), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') },
      { properties: { fontColor: color('#FFFFFF'), bold: boolLit(true) }, selector: sel('selected') },
    ],
    outline: [
      { properties: { show: boolLit(false) } },
      { properties: { show: boolLit(false) }, selector: sel('default') },
      { properties: { show: boolLit(false) }, selector: sel('selected') },
      { properties: { show: boolLit(false) }, selector: sel('hover') },
    ],
  },
  visualContainerObjects: vcoDesnudo,
}));

// 4 · KPIs de frescura: una multi-card con los 3 relojes
visuales.push(visual('9a8b7c6d5e4f30211203', [24, 88, 1256, 112], {
  visualType: 'cardVisual',
  query: {
    queryState: {
      Data: {
        projections: [
          measure(ESTADO_CARGA, 'Dato completo hasta'),
          measure(ESTADO_CARGA, 'Días desde última extracción'),
          measure(ESTADO_CARGA, 'Dominios desactualizados'),
        ],
      },
    },
  },
  objects: {
    value: [{ properties: { fontSize: num(24), fontFamily: str('Segoe UI Semibold') }, selector: sel('default') }],
    label: [{ properties: { show: boolLit(true), fontSize: num(10) }, selector: sel('default') }],
    outline: [{ properties: { show: boolLit(false) }, selector: sel('default') }],
    padding: [{ properties: { paddingUniform: int(8) }, selector: sel('default') }],
    layout: [{
      properties: {
        paddingUniform: int(8),
        style: str('Table'),
        customizeLines: boolLit(true),
        gridlineWidth: num(1),
        gridlineColor: color('#e3e6eb'),
        gridlineStyle: str('solid'),
      },
      selector: sel('default'),
    }],
    spacing: [{ properties: { verticalSpacing: num(2) }, selector: sel('default') }],
  },
  visualContainerObjects: {
    title: [{ properties: { show: boolLit(false) } }],
    padding: [{ properties: { top: num(8), bottom: num(8), left: num(8), right: num(8) } }],
  },
}));

// 5 · seis botones de navegación (grid 3×2 de 400×112)
const botones = [
  ['1a2b3c4d5e6f70819203', [24, 216], '01 · Dirección'],
  ['2b3c4d5e6f708192031a', [440, 216], '02 · Ventas · ritmo y drivers'],
  ['3c4d5e6f708192031a2b', [856, 216], '03 · Rentabilidad · fugas de margen'],
  ['4d5e6f708192031a2b3c', [24, 336], '05 · Productos · quiebre'],
  ['5e6f708192031a2b3c4d', [440, 336], '07 · Pedidos · cumplimiento'],
  ['6f708192031a2b3c4d5e', [856, 336], '09 · Cartera y cobranza'],
];
for (const [id, [bx, by], texto] of botones) {
  visuales.push(botonNav(id, [bx, by, 400, 112], texto));
}

// 6 · tabla de frescura por dominio (sin subtotales: el MAX global es el defecto D1)
visuales.push(visual('7a8192031b2c3d4e5f60', [24, 464, 608, 232], {
  visualType: 'pivotTable',
  query: {
    queryState: {
      Rows: { projections: [column(ESTADO_CARGA, 'dominio_nombre')] },
      Values: {
        projections: [
          measure(ESTADO_CARGA, 'Último dato del ERP'),
          measure(ESTADO_CARGA, 'Días desde última extracción'),
        ],
      },
    },
  },
  objects: {
    columnHeaders: [{
      properties: {
        columnAdjustment: str('growToFit'),
        autoSizeColumnWidth: boolLit(true),
      },
    }],
    subTotals: [
      { properties: { rowSubtotals: boolLit(false), columnSubtotals: boolLit(false) } },
      { properties: { rowSubtotals: boolLit(false) }, selector: sel('Row') },
      { properties: { columnSubtotals: boolLit(false) }, selector: sel('Column') },
    ],
  },
  visualContainerObjects: {
    stylePreset: [{ properties: { name: str('None') } }],
    title: [{ properties: { show: boolLit(true), text: str('¿Hasta cuándo llega cada dominio?') } }],
    subTitle: [{ properties: { show: boolLit(true), text: str('Máximo por dominio · el KPI global usa el dominio más rezagado') } }],
  },
}));

// 7-9 · tarjetas de alerta (colores de estado del contrato visual §2.5)
visuales.push(tarjetaAlerta('81920a1b2c3d4e5f6071', [648, 464, 632, 72], 'DM_Análisis de producto', 'Venta anual en riesgo por quiebre', '#d51c29'));
visuales.push(tarjetaAlerta('920a1b2c3d4e5f607182', [648, 544, 632, 72], 'FC_Cartera por cobrar', 'Vencido terceros hoy', '#d51c29'));
visuales.push(tarjetaAlerta('a0b1c2d3e4f506172839', [648, 624, 632, 72], 'FC_Pedidos', 'Backlog vencido', '#eb6834'));

// 10 · pie de frescura (medida 'Pie de frescura')
visuales.push(textboxMedida('b1c2d3e4f50617283940', [24, 700, 1256, 20], ESTADO_CARGA, 'Pie de frescura',
  { fontFamily: 'Segoe UI', fontSize: '10px', color: '#5b6472' }, 'left'));

// ---- escritura ----
fs.mkdirSync(path.join(PAGE_DIR, 'visuals'), { recursive: true });

fs.writeFileSync(path.join(PAGE_DIR, 'page.json'), JSON.stringify({
  $schema: PAGE_SCHEMA,
  name: PAGE_ID,
  displayName: '00 · Inicio',
  displayOption: 'FitToPage',
  height: 720,
  width: 1280,
}, null, 2) + '\n');

for (const v of visuales) {
  const dir = path.join(PAGE_DIR, 'visuals', v.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'visual.json'), JSON.stringify(v.json, null, 2) + '\n');
}

// pages.json: la 00 es la única página; la página vacía placeholder se retira
const pagesPath = path.join(REPORT, 'definition/pages/pages.json');
const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
pages.pageOrder = [PAGE_ID];
pages.activePageName = PAGE_ID;
fs.writeFileSync(pagesPath, JSON.stringify(pages, null, 2) + '\n');

const vacia = path.join(REPORT, 'definition/pages/68daa5275525aa7c47c9');
if (fs.existsSync(vacia)) fs.rmSync(vacia, { recursive: true });

console.log(`Página 00 escrita: ${visuales.length} visuales en ${PAGE_DIR}`);
