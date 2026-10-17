// Genera las páginas de VENTAS del reporte PBIR replicando los tableros "Histórico de Ventas" y
// "Seguimiento de Ventas" de Kraken 360 (docs/powerbi/kraken360/inventario.md).
//
// Uso:  node generar_paginas_ventas.js <ruta al .Report> [mes_actual yyyy-MM] [anio_actual]
//
// Determinista: ids sha1 fijos por (página, clave) — re-ejecutar produce archivos idénticos.
// Solo reescribe sus propias páginas; las demás conservan su lugar en pages.json.
'use strict';
const P = require('./pbir');
const { T, C, FILA, ALTO, xCol, wCol, id, segmentador, kpis, ranking, dona, mapa, matriz, bloqueMoneda, columnasMensuales, encabezado, pie, visual, pColumna, pMedida, ordenAsc, str, num, bool, color, meta, vcTitulo } = P;

const REPORT = P.reporteDeArgs();
const hoy = new Date();
const MES_ACTUAL = process.argv[3] || `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
const ANIO_ACTUAL = Number(process.argv[4] || hoy.getFullYear());

// ============================================================ PÁGINA 01 · HISTÓRICO DE VENTAS
function pagina01() {
  const slug = 'ventas-historico';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Histórico de ventas', 'Subtítulo de corte anual'));

  // --- KPIs: empresa + año · resultado del año · moneda
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), 148, wCol(2), 52], { seleccion: ANIO_ACTUAL, sync: 'anio' }));
  vs.push(kpis(slug, 'resultado-anio', [
    [T.VENTAS, 'Ventas acumuladas año'],
    [T.VENTAS, 'Variación acumulada vs año anterior'],
    [T.VENTAS, 'Documentos de venta'],
    [T.VENTAS, 'Clientes con venta'],
    [T.VENTAS, 'Productos vendidos'],
    [T.VENTAS, 'Ticket promedio'],
  ], [xCol(3), 88, wCol(7), 112], 'Resultado del año'));
  vs.push(...bloqueMoneda(slug));

  // --- Fila 1: columnas mensuales · dona sucursal
  vs.push(columnasMensuales(slug, 'mensual', [xCol(1), FILA[0], wCol(9), ALTO], 'Venta histórica por mes y variación año con año'));
  vs.push(dona(slug, 'sucursal', [xCol(10), FILA[0], wCol(3), ALTO], T.BOD, 'nombre', 'Venta por sucursal'));

  // --- Fila 2: matrices año × mes (montos y variación) · dona canal
  vs.push(matriz(slug, 'matriz-montos', [xCol(1), FILA[1], wCol(9), 120], 'Venta por año y mes',
    { filas: [[T.CAL, 'Año']], columnas: [[T.CAL, 'mes_nombre_corto']], valores: [[T.VENTAS, 'Ventas netas']] }));
  vs.push(matriz(slug, 'matriz-variacion', [xCol(1), FILA[1] + 128, wCol(9), 104], 'Variación contra el mismo mes del año anterior',
    { filas: [[T.CAL, 'Año']], columnas: [[T.CAL, 'mes_nombre_corto']], valores: [[T.VENTAS, 'Variación vs año anterior']], semaforoEn: [T.VENTAS, 'Variación vs año anterior'] }));
  vs.push(dona(slug, 'canal', [xCol(10), FILA[1], wCol(3), ALTO], T.CANAL, 'nombre', 'Venta por canal'));

  // --- Fila 3: sector · cliente top · ubicación · línea · producto top · vendedor
  vs.push(ranking(slug, 'sector', [xCol(1), FILA[2], wCol(2), ALTO], T.CONDPAGO, 'nombre', 'Venta por sector', 'sector'));
  vs.push(ranking(slug, 'cliente', [xCol(3), FILA[2], wCol(2), ALTO], T.CLI, 'nombre', 'Venta por cliente · top 100', 'cliente'));
  vs.push(mapa(slug, 'ubicacion', [xCol(5), FILA[2], wCol(2), ALTO], 'Venta por ubicación'));
  vs.push(ranking(slug, 'linea', [xCol(7), FILA[2], wCol(2), ALTO], T.PROD, 'grupo_nombre', 'Venta por línea', 'línea'));
  vs.push(ranking(slug, 'producto', [xCol(9), FILA[2], wCol(2), ALTO], T.PROD, 'nombre', 'Venta por producto · top 100', 'producto'));
  vs.push(ranking(slug, 'vendedor', [xCol(11), FILA[2], wCol(2), ALTO], T.VEND, 'nombre', 'Venta por vendedor', 'vendedor'));

  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Histórico de ventas', visuales: vs };
}

// ============================================================ PÁGINA 02 · SEGUIMIENTO DE VENTAS
function pagina02() {
  const slug = 'ventas-seguimiento';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Seguimiento de ventas', 'Subtítulo de corte mensual'));

  vs.push(kpis(slug, 'resultado-dia', [[T.VENTAS, 'Venta del día']], [xCol(1), 88, wCol(2), 112], 'Resultado del día'));
  vs.push(kpis(slug, 'resultado-mes', [
    [T.VENTAS, 'Ventas netas'],
    [T.VENTAS, 'Variación vs año anterior'],
    [T.VENTAS, 'Documentos de venta'],
    [T.VENTAS, 'Clientes con venta'],
    [T.VENTAS, 'Productos vendidos'],
    [T.VENTAS, 'Ticket promedio'],
  ], [xCol(3), 88, wCol(7), 112], 'Resultado'));
  vs.push(...bloqueMoneda(slug));

  // --- Fila 1: año-mes (lista) + empresa · vendedor · sector · cliente top · producto top
  vs.push(segmentador(slug, 'anio-mes', T.CAL, 'anio_mes', [xCol(1), FILA[0], wCol(2), 148], { modo: 'VerticalList', seleccion: MES_ACTUAL, sync: 'periodo', titulo: 'Año y mes', unico: true, descendente: true }));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), FILA[0] + 156, wCol(2), 76], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(ranking(slug, 'vendedor', [xCol(3), FILA[0], wCol(2), ALTO], T.VEND, 'nombre', 'Venta por vendedor', 'vendedor'));
  vs.push(ranking(slug, 'sector', [xCol(5), FILA[0], wCol(2), ALTO], T.CONDPAGO, 'nombre', 'Venta por sector', 'sector'));
  vs.push(ranking(slug, 'cliente', [xCol(7), FILA[0], wCol(3), ALTO], T.CLI, 'nombre', 'Venta por cliente · top 100', 'cliente'));
  vs.push(ranking(slug, 'producto', [xCol(10), FILA[0], wCol(3), ALTO], T.PROD, 'nombre', 'Venta por producto · top 100', 'producto'));

  // --- Fila 2: buscadores · venta del mes (acumulado diario) · ubicación · sucursal
  vs.push(segmentador(slug, 'buscar-cliente', T.CLI, 'nombre', [xCol(1), FILA[1], wCol(2), 108], { busqueda: true, titulo: 'Buscar cliente' }));
  vs.push(segmentador(slug, 'buscar-producto', T.PROD, 'nombre', [xCol(1), FILA[1] + 124, wCol(2), 108], { busqueda: true, titulo: 'Buscar producto y/o SKU' }));
  vs.push(visual(id(slug, 'venta-del-mes'), 'lineChart', [xCol(3), FILA[1], wCol(4), ALTO], {
    roles: {
      Category: [pColumna(T.CAL, 'dia')],
      Y: [pMedida(T.VENTAS, 'Venta acumulada del mes al día'), pMedida(T.VENTAS, 'Venta acumulada del mes al día año anterior')],
    },
    sort: ordenAsc(T.CAL, 'dia'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(9) } }],
      lineStyles: [
        { properties: { strokeWidth: num(2) }, selector: meta(T.VENTAS, 'Venta acumulada del mes al día') },
        { properties: { lineStyle: str('dotted'), strokeWidth: num(2) }, selector: meta(T.VENTAS, 'Venta acumulada del mes al día año anterior') },
      ],
      dataPoint: [
        { properties: { fill: color(C.PIZARRA) }, selector: meta(T.VENTAS, 'Venta acumulada del mes al día') },
        { properties: { fill: color(C.PIZARRA_CLARA) }, selector: meta(T.VENTAS, 'Venta acumulada del mes al día año anterior') },
      ],
    },
    vc: vcTitulo('Venta del mes'),
  }));
  vs.push(mapa(slug, 'ubicacion', [xCol(7), FILA[1], wCol(3), ALTO], 'Venta por ubicación del cliente'));
  vs.push(ranking(slug, 'sucursal', [xCol(10), FILA[1], wCol(3), ALTO], T.BOD, 'nombre', 'Venta por sucursal', 'sucursal'));

  // --- Fila 3: canal · línea
  vs.push(ranking(slug, 'canal', [xCol(1), FILA[2], wCol(6), ALTO], T.CANAL, 'nombre', 'Venta por canal', 'canal'));
  vs.push(ranking(slug, 'linea', [xCol(7), FILA[2], wCol(6), ALTO], T.PROD, 'grupo_nombre', 'Venta por línea', 'línea'));

  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Seguimiento de ventas', visuales: vs };
}

P.escribirPaginas(REPORT, [pagina01(), pagina02()]);
