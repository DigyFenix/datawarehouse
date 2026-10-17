// Genera las páginas de INVENTARIOS del reporte PBIR replicando el dashboard "Inventarios" de
// Kraken 360: Existencias · Costo · Análisis (docs/powerbi/kraken360/inventario.md, capturas 07-09).
//
// Uso:  node generar_paginas_inventario.js <ruta al .Report>
'use strict';
const P = require('./pbir');
const { T, C, FILA, ALTO, xCol, wCol, id, segmentador, kpis, ranking, dona, matriz, comboMensual, encabezado, pie, visual, pColumna, pMedida, ordenAsc, str, num, bool, color, meta, vcTitulo } = P;

const REPORT = P.reporteDeArgs();
const V = T.VENTAS, INV = 'FC_Inventario', ANAL = 'DM_Análisis de producto', LEAD = 'MD_Lead time';

// Filtros Kraken del dashboard: línea, bodega, buscar producto, moneda.
function filtrosInventario(slug, col = 7) {
  return [
    segmentador(slug, 'f-linea', T.PROD, 'grupo_nombre', [xCol(col), 88, wCol(2), 52], { sync: 'linea' }),
    segmentador(slug, 'f-bodega', T.BOD, 'nombre', [xCol(col), 148, wCol(2), 52], { sync: 'bodega' }),
    segmentador(slug, 'f-buscar', T.PROD, 'nombre', [xCol(col + 2), 88, wCol(2), 52], { busqueda: true }),
    segmentador(slug, 'moneda', T.MONEDA, 'Moneda de análisis', [xCol(col + 4), 88, wCol(2), 112], { unico: true, sync: 'moneda', titulo: 'Moneda' }),
  ];
}
// Ranking por bodega / línea con fantasma, sobre una medida de inventario.
const rkInv = (slug, clave, pos, tabla, col, titulo, medida, resto) => ranking(slug, clave, pos, tabla, col, titulo, '', medida, resto);
// Tendencia mensual de unidades vendidas con línea punteada del promedio (12 meses).
function tendenciaUnidades(slug, pos, titulo = 'Tendencia mensual de unidades vendidas · últimos 12 meses') {
  return comboMensual(slug, 'tendencia-unidades', pos, titulo, ['Unidades vendidas 12 meses'], 'Promedio mensual de unidades 12 meses');
}
const matrizProductos = (slug, pos, titulo, valores) => matriz(slug, 'matriz-productos', pos, titulo, {
  filas: [[T.PROD, 'Línea'], [T.PROD, 'Producto']], valores, filaTotal: true, columnaTotal: false, anchoFilas: 230,
});

// ============================================================ 07 · EXISTENCIAS
function paginaExistencias() {
  const slug = 'inventario-existencias';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Existencias de inventario', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(kpis(slug, 'existencias', [[INV, 'Unidades en existencia']], [xCol(3), 88, wCol(4), 112], 'Existencias', 'Unidades al último corte del inventario'));
  vs.push(...filtrosInventario(slug));
  vs.push(matrizProductos(slug, [xCol(1), FILA[0], wCol(5), ALTO * 3 + 32], 'Existencias y precio de venta por línea y producto',
    [[INV, 'Unidades en existencia'], [V, 'Precio de lista'], [V, 'Precio promedio de venta 12 meses']]));
  vs.push(rkInv(slug, 'bodega', [xCol(6), FILA[0], wCol(4), ALTO * 2 + 16], T.BOD, 'nombre', 'Distribución de las existencias por bodega', 'Unidades en existencia', 'Resto a máximo bodega existencias'));
  vs.push(dona(slug, 'sucursal', [xCol(10), FILA[0], wCol(3), ALTO], T.BOD, 'nombre', 'Distribución de las existencias por sucursal', 'Unidades en existencia'));
  vs.push(rkInv(slug, 'linea', [xCol(10), FILA[1], wCol(3), ALTO], T.PROD, 'grupo_nombre', 'Distribución de las existencias por línea', 'Unidades en existencia', 'Resto a máximo línea existencias'));
  vs.push(tendenciaUnidades(slug, [xCol(6), FILA[2], wCol(7), ALTO]));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Existencias de inventario', visuales: vs };
}

// ============================================================ 08 · COSTO
function paginaCosto() {
  const slug = 'inventario-costo';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Costo del inventario', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(kpis(slug, 'costo', [[INV, 'Valor de inventario'], [V, 'Costo desplazado promedio mensual'], [V, 'Meses de inventario al costo']], [xCol(3), 88, wCol(4), 112], 'Costo del inventario', 'Costo de las existencias · costo desplazado promedio mensual · meses de inventario'));
  vs.push(...filtrosInventario(slug));
  vs.push(matrizProductos(slug, [xCol(1), FILA[0], wCol(5), ALTO * 3 + 32], 'Costo de las existencias por producto',
    [[INV, 'Unidades en existencia'], [INV, 'Costo promedio ponderado'], [INV, 'Valor de inventario'], [V, 'Costo desplazado 12 meses'], [V, 'Meses de inventario al costo']]));
  vs.push(rkInv(slug, 'bodega', [xCol(6), FILA[0], wCol(4), ALTO * 2 + 16], T.BOD, 'nombre', 'Costo de las existencias por bodega', 'Valor de inventario', 'Resto a máximo bodega valor'));
  vs.push(dona(slug, 'sucursal', [xCol(10), FILA[0], wCol(3), ALTO], T.BOD, 'nombre', 'Costo de las existencias por sucursal', 'Valor de inventario'));
  vs.push(rkInv(slug, 'linea', [xCol(10), FILA[1], wCol(3), ALTO], T.PROD, 'grupo_nombre', 'Costo de las existencias por línea', 'Valor de inventario', 'Resto a máximo línea valor'));
  vs.push(tendenciaUnidades(slug, [xCol(6), FILA[2], wCol(7), ALTO]));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Costo del inventario', visuales: vs };
}

// ============================================================ 09 · ANÁLISIS
function paginaAnalisis() {
  const slug = 'inventario-analisis';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Análisis de inventario', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'lead-time', LEAD, 'Lead time', [xCol(1), 148, wCol(2), 52], { seleccion: 15, unico: true, sync: 'leadtime' }));
  vs.push(kpis(slug, 'kpis', [[INV, 'Unidades en existencia'], [V, 'Productos con sugerencia de compra'], [V, 'Lead time (días)']], [xCol(3), 88, wCol(4), 112], 'Análisis de inventario', 'Existencias · productos con sugerencia de compra · lead time del segmentador'));
  vs.push(...filtrosInventario(slug));
  vs.push(rkInv(slug, 'linea', [xCol(1), FILA[0], wCol(3), ALTO], T.PROD, 'grupo_nombre', 'Existencias por línea', 'Unidades en existencia', 'Resto a máximo línea existencias'));
  vs.push(rkInv(slug, 'bodega', [xCol(1), FILA[1], wCol(3), ALTO], T.BOD, 'nombre', 'Existencias por bodega', 'Unidades en existencia', 'Resto a máximo bodega existencias'));
  vs.push(dona(slug, 'sucursal', [xCol(1), FILA[2], wCol(3), ALTO], T.BOD, 'nombre', 'Existencias por sucursal', 'Unidades en existencia'));
  vs.push(matriz(slug, 'analisis', [xCol(4), FILA[0], wCol(9), ALTO * 2 + 16], 'Análisis del inventario', {
    filas: [[T.PROD, 'Producto']],
    valores: [[V, 'Consumo mínimo mensual'], [V, 'Consumo promedio mensual'], [V, 'Consumo máximo mensual'], [V, 'Lead time (días)'], [V, 'Stock mínimo'], [V, 'Punto de pedido'], [V, 'Stock máximo'], [V, 'Semáforo de existencias'], [INV, 'Unidades en existencia'], [V, 'Sugerencia de compra'], [V, 'Monto de sugerencia de compra']],
    filaTotal: false, columnaTotal: false, ordenPor: [V, 'Sugerencia de compra'], anchoFilas: 220,
  }));
  vs.push(visual(id(slug, 'tendencia-24'), 'lineChart', [xCol(4), FILA[2], wCol(9), ALTO], {
    roles: { Category: [pColumna(T.CAL, 'mes_anio_etiqueta')], Y: [pMedida(V, 'Unidades vendidas 24 meses')] },
    sort: ordenAsc(T.CAL, 'mes_anio_etiqueta'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1'), labelPrecision: num(0) } }],
      legend: [{ properties: { show: bool(false) } }],
      lineStyles: [{ properties: { strokeWidth: num(2), showMarker: bool(true) } }],
      dataPoint: [{ properties: { fill: color(C.PIZARRA) } }, { properties: { fill: color(C.PIZARRA) }, selector: meta(V, 'Unidades vendidas 24 meses') }],
    },
    vc: vcTitulo('Tendencia mensual de unidades vendidas · últimos 24 meses'),
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Análisis de inventario', visuales: vs };
}

P.escribirPaginas(REPORT, [paginaExistencias(), paginaCosto(), paginaAnalisis()]);
