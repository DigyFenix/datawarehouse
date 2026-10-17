// Genera las páginas de CLIENTES del reporte PBIR replicando el dashboard "Clientes" de Kraken 360:
// Matriz de Oportunidades · Cartera de Clientes · Clientes Nuevos · Clientes Recuperados
// (docs/powerbi/kraken360/inventario.md, capturas 03-06).
//
// Uso:  node generar_paginas_clientes.js <ruta al .Report> [anio_actual]
'use strict';
const P = require('./pbir');
const { T, C, FILA, ALTO, xCol, wCol, id, segmentador, kpis, ranking, barras, matriz, bloqueMoneda, columnasMensuales, comboMensual, columnasApiladas, encabezado, pie } = P;

const REPORT = P.reporteDeArgs();
const ANIO_ACTUAL = Number(process.argv[3] || new Date().getFullYear());
const V = T.VENTAS;

// Filtros de página comunes a Kraken: sector, sucursal, año, línea (dropdowns sin encabezado, 2 × 2).
function filtrosComerciales(slug, { conAnio = true } = {}) {
  const vs = [
    segmentador(slug, 'f-sector', T.CONDPAGO, 'nombre', [xCol(9), 88, wCol(2), 52], { sync: 'sector' }),
    segmentador(slug, 'f-sucursal', T.BOD, 'nombre', [xCol(9), 148, wCol(2), 52], { sync: 'sucursal' }),
    segmentador(slug, 'f-linea', T.PROD, 'grupo_nombre', [xCol(11), 148, wCol(2), 52], { sync: 'linea' }),
  ];
  vs.push(conAnio
    ? segmentador(slug, 'f-anio', T.CAL, 'anio', [xCol(11), 88, wCol(2), 52], { seleccion: ANIO_ACTUAL, sync: 'anio' })
    : segmentador(slug, 'f-buscar', T.CLI, 'nombre', [xCol(11), 88, wCol(2), 52], { busqueda: true }));
  return vs;
}

// ============================================================ 03 · MATRIZ DE OPORTUNIDADES
function paginaOportunidades() {
  const slug = 'clientes-oportunidades';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Matriz de oportunidades', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'vendedor', T.VEND, 'nombre', [xCol(1), 148, wCol(2), 52], { sync: 'vendedor' }));
  vs.push(kpis(slug, 'resultado-anio', [[V, 'Ventas acumuladas año'], [V, 'Variación acumulada vs año anterior']], [xCol(3), 88, wCol(3), 112], 'Resultado del año', 'Acumulado anual · vs año anterior'));
  vs.push(kpis(slug, 'resultado-mes', [[V, 'Venta del mes en curso'], [V, 'Variación del mes en curso vs año anterior']], [xCol(6), 88, wCol(3), 112], 'Resultado del mes', 'Acumulado del mes · vs año anterior'));
  vs.push(...filtrosComerciales(slug));

  // Fila 1-2: vendedor (alto) · tabla de clientes · oportunidad (toggle + 3 barras)
  vs.push(ranking(slug, 'vendedor-rk', [xCol(1), FILA[0], wCol(2), ALTO * 2 + 16], T.VEND, 'nombre', 'Venta por vendedor', 'vendedor', 'Ventas acumuladas año', 'Resto a máximo vendedor acumulado'));
  vs.push(matriz(slug, 'matriz-clientes', [xCol(3), FILA[0], wCol(7), ALTO], 'Variación venta acumulada año anterior a la fecha vs año actual por cliente', {
    filas: [[T.CLI, 'Cliente']],
    valores: [[V, 'Ventas acumuladas año anterior'], [V, 'Ventas acumuladas año'], [V, 'Diferencia acumulada vs año anterior'], [V, 'Semáforo acumulado'], [V, 'Variación acumulada vs año anterior']],
    semaforoEn: [V, 'Diferencia acumulada vs año anterior'], filaTotal: true, columnaTotal: false, ordenPor: [V, 'Diferencia acumulada vs año anterior'], anchoFilas: 240,
  }));
  vs.push(segmentador(slug, 'vista-oportunidad', T.OPORT, 'Vista', [xCol(10), FILA[0], wCol(3), 48], { seleccion: 'Atrición', unico: true }));
  const bloque = (clave, y, tabla, col, titulo) => barras(slug, clave, [xCol(10), y, wCol(3), 144], tabla, col, titulo,
    ['Venta actual', 'Faltante de venta', 'Superávit de venta'], [C.PIZARRA, C.ROJO, C.VERDE], { leyenda: true });
  vs.push(bloque('oport-linea', FILA[0] + 56, T.PROD, 'grupo_nombre', 'Línea'));
  vs.push(bloque('oport-categoria', FILA[0] + 56 + 152, T.PROD, 'tipo_producto', 'Categoría'));
  vs.push(bloque('oport-producto', FILA[0] + 56 + 304, T.PROD, 'nombre', 'Producto'));

  // Fila 2-3: buscar cliente · desglose mensual
  vs.push(segmentador(slug, 'buscar-cliente', T.CLI, 'nombre', [xCol(3), FILA[1], wCol(7), 48], { busqueda: true }));
  vs.push(columnasMensuales(slug, 'mensual', [xCol(3), FILA[1] + 56, wCol(7), ALTO * 2 - 40], 'Desglose mensual de las ventas'));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Matriz de oportunidades', visuales: vs };
}

// ============================================================ 04 · CARTERA DE CLIENTES (últimos 12 meses)
function paginaCartera() {
  const slug = 'clientes-cartera';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Cartera de clientes', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'vendedor', T.VEND, 'nombre', [xCol(1), 148, wCol(2), 52], { sync: 'vendedor' }));
  vs.push(kpis(slug, 'resultado-12m', [[V, 'Ventas 12 meses'], [V, 'Clientes 12 meses'], [V, 'Productos 12 meses']], [xCol(3), 88, wCol(6), 112], 'Resultado de los últimos 12 meses'));
  vs.push(...filtrosComerciales(slug, { conAnio: false }));

  const M12 = 'Ventas 12 meses';
  // Fila 1: vendedor 12m · frecuencia de compra · sector 12m · línea 12m
  vs.push(ranking(slug, 'vendedor-12m', [xCol(1), FILA[0], wCol(2), ALTO], T.VEND, 'nombre', 'Ventas por vendedor · últimos 12 meses', 'vendedor', M12, 'Resto a máximo vendedor 12 meses'));
  vs.push(matriz(slug, 'frecuencia', [xCol(3), FILA[0], wCol(4), ALTO], 'Frecuencia de compra · meses con compra en los últimos 12 meses', {
    filas: [[T.CLI, 'Clase']], columnas: [[T.CLI, 'Rango de meses con compra']], valores: [[V, 'Clientes 12 meses']], filaTotal: true, columnaTotal: true,
  }));
  vs.push(ranking(slug, 'sector-12m', [xCol(7), FILA[0], wCol(3), ALTO], T.CONDPAGO, 'nombre', 'Ventas por sector · últimos 12 meses', 'sector', M12, 'Resto a máximo sector 12 meses'));
  vs.push(ranking(slug, 'linea-12m', [xCol(10), FILA[0], wCol(3), ALTO], T.PROD, 'grupo_nombre', 'Ventas por línea · últimos 12 meses', 'línea', M12, 'Resto a máximo línea 12 meses'));
  // Fila 2: categoría ABC · abandono · cliente 12m (alto) · producto 12m (alto)
  vs.push(ranking(slug, 'categoria-abc', [xCol(1), FILA[1], wCol(2), ALTO], T.CLI, 'clase_abc_actual_nombre', 'Venta por categoría', 'categoría', M12, 'Resto a máximo categoría 12 meses'));
  vs.push(matriz(slug, 'abandono', [xCol(3), FILA[1], wCol(4), ALTO], 'Abandono de compra · meses consecutivos sin compra', {
    filas: [[T.CLI, 'Clase']], columnas: [[T.CLI, 'Rango de meses sin compra']], valores: [[V, 'Clientes 12 meses']], filaTotal: true, columnaTotal: true,
  }));
  vs.push(ranking(slug, 'cliente-12m', [xCol(7), FILA[1], wCol(3), ALTO * 2 + 16], T.CLI, 'nombre', 'Venta por cliente · últimos 12 meses', 'cliente', M12, 'Resto a máximo cliente 12 meses'));
  vs.push(ranking(slug, 'producto-12m', [xCol(10), FILA[1], wCol(3), ALTO * 2 + 16], T.PROD, 'nombre', 'Ventas por producto · últimos 12 meses', 'producto', M12, 'Resto a máximo producto 12 meses'));
  // Fila 3: desglose mensual 12m
  vs.push(columnasMensuales(slug, 'mensual-12m', [xCol(1), FILA[2], wCol(6), ALTO], 'Desglose mensual · últimos 12 meses', 'Ventas 12 meses', 'Ventas 12 meses año anterior', 'Variación vs año anterior', 'mes_anio_etiqueta'));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Cartera de clientes', visuales: vs };
}

// ============================================================ 05 · CLIENTES NUEVOS  /  06 · RECUPERADOS
// Las dos páginas comparten estructura; cambia el conjunto de clientes (nuevos vs recuperados).
function paginaCohorte(slug, nombre, titulo, m) {
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, titulo, 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'partida', T.PARTIDA, 'Mes de partida', [xCol(1), 148, wCol(2), 52], { seleccion: -12, unico: true, sync: 'partida' }));
  vs.push(kpis(slug, 'resultado', [
    [V, m.clientes], [V, m.retenidos], [V, m.pctRet], [V, m.noRetenidos], [V, m.pctAband], [V, m.ventaPeriodo], [V, m.ventaTotal],
  ], [xCol(3), 88, wCol(8), 112], 'Resultado de la ventana (mes de partida → corte)'));
  vs.push(segmentador(slug, 'moneda', T.MONEDA, 'Moneda de análisis', [xCol(11), 88, wCol(2), 112], { unico: true, sync: 'moneda', titulo: 'Moneda' }));

  // Fila 1: canal (lista) · venta por mes (columnas + línea de conteo) · retenidos
  vs.push(segmentador(slug, 'canal', T.CANAL, 'nombre', [xCol(1), FILA[0], wCol(2), ALTO], { modo: 'VerticalList', titulo: 'Canal', sync: 'canal' }));
  vs.push(comboMensual(slug, 'venta-mes', [xCol(3), FILA[0], wCol(6), ALTO], `${m.etiqueta} · venta por mes`, [m.ventaMes], m.clientesMes));
  vs.push(matriz(slug, 'retenidos', [xCol(9), FILA[0], wCol(4), ALTO], `${m.etiqueta} retenidos`, {
    filas: [[T.CLI, 'Cliente']], valores: [[V, m.ventaRetenidos]], filaTotal: true, columnaTotal: false, ordenPor: [V, m.ventaRetenidos], anchoFilas: 260,
  }));
  // Fila 2: buscadores · retención (primer mes vs recompra) · no retenidos
  vs.push(segmentador(slug, 'buscar-cliente', T.CLI, 'nombre', [xCol(1), FILA[1], wCol(2), 108], { busqueda: true, titulo: 'Buscar cliente' }));
  vs.push(segmentador(slug, 'buscar-producto', T.PROD, 'nombre', [xCol(1), FILA[1] + 124, wCol(2), 108], { busqueda: true, titulo: 'Buscar producto y/o SKU' }));
  vs.push(columnasApiladas(slug, 'retencion', [xCol(3), FILA[1], wCol(6), ALTO], `Retención de ${m.etiquetaMin}`, [m.ventaPrimerMes, m.ventaRecompra]));
  vs.push(matriz(slug, 'no-retenidos', [xCol(9), FILA[1], wCol(4), ALTO], `${m.etiqueta} no retenidos`, {
    filas: [[T.CLI, 'Cliente']], valores: [[V, m.ventaNoRetenidos]], filaTotal: true, columnaTotal: false, ordenPor: [V, m.ventaNoRetenidos], anchoFilas: 260,
  }));
  // Fila 3: línea · producto · vendedor
  vs.push(barras(slug, 'linea', [xCol(1), FILA[2], wCol(4), ALTO], T.PROD, 'grupo_nombre', 'Venta por línea', [m.ventaPeriodo]));
  vs.push(barras(slug, 'producto', [xCol(5), FILA[2], wCol(4), ALTO], T.PROD, 'nombre', 'Venta por producto', [m.ventaPeriodo]));
  vs.push(matriz(slug, 'vendedor', [xCol(9), FILA[2], wCol(4), ALTO], 'Vendedor', {
    filas: [[T.VEND, 'Vendedor']], valores: [[V, m.clientes], [V, m.retenidos], [V, m.ventaPeriodo]], filaTotal: true, columnaTotal: false, ordenPor: [V, m.ventaPeriodo], anchoFilas: 150,
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre, visuales: vs };
}
const NUEVOS = {
  etiqueta: 'Clientes nuevos', etiquetaMin: 'clientes nuevos',
  clientes: 'Clientes nuevos en ventana', retenidos: 'Clientes nuevos retenidos', pctRet: '% Retención de nuevos',
  noRetenidos: 'Clientes nuevos no retenidos', pctAband: '% Abandono de nuevos', ventaPeriodo: 'Ventas de clientes nuevos en ventana',
  ventaTotal: 'Ventas totales de clientes nuevos', ventaMes: 'Ventas de clientes nuevos del mes', clientesMes: 'Clientes nuevos del mes',
  ventaRetenidos: 'Ventas de nuevos retenidos', ventaNoRetenidos: 'Ventas de nuevos no retenidos',
  ventaPrimerMes: 'Venta de nuevos en su primer mes', ventaRecompra: 'Venta de nuevos en recompra',
};
const RECUPERADOS = {
  etiqueta: 'Clientes recuperados', etiquetaMin: 'clientes recuperados',
  clientes: 'Clientes recuperados en ventana', retenidos: 'Clientes recuperados retenidos', pctRet: '% Retención de recuperados',
  noRetenidos: 'Clientes recuperados no retenidos', pctAband: '% Abandono de recuperados', ventaPeriodo: 'Ventas de clientes recuperados en ventana',
  ventaTotal: 'Ventas totales de clientes recuperados', ventaMes: 'Ventas de clientes recuperados del mes', clientesMes: 'Clientes recuperados del mes',
  ventaRetenidos: 'Ventas de recuperados retenidos', ventaNoRetenidos: 'Ventas de recuperados no retenidos',
  ventaPrimerMes: 'Venta de recuperados en su mes de retorno', ventaRecompra: 'Venta de recuperados en recompra',
};

P.escribirPaginas(REPORT, [
  paginaOportunidades(),
  paginaCartera(),
  paginaCohorte('clientes-nuevos', 'Clientes nuevos', 'Título de Clientes nuevos', NUEVOS),
  paginaCohorte('clientes-recuperados', 'Clientes recuperados', 'Título de Clientes recuperados', RECUPERADOS),
]);
