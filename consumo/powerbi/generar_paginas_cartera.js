// Genera las páginas de CARTERA Y UTILIDAD del reporte PBIR replicando Kraken 360:
// Cuentas por cobrar · Análisis de utilidad · Recuperación y cobros · Cuentas por pagar
// (docs/powerbi/kraken360/inventario.md, capturas 10-12; la de CxP la pidió Edwin como espejo de CxC).
//
// Uso:  node generar_paginas_cartera.js <ruta al .Report> [anio_actual]
'use strict';
const P = require('./pbir');
const { T, C, FILA, ALTO, xCol, wCol, id, segmentador, kpis, barras, dona, matriz, encabezado, pie, visual, pColumna, pMedida, ordenAsc, ordenDesc, str, num, bool, color, meta, vcTitulo } = P;

const REPORT = P.reporteDeArgs();
const ANIO_ACTUAL = Number(process.argv[3] || new Date().getFullYear());
const V = T.VENTAS, PROV = 'DM_Proveedor';

// Barras apiladas "no vencido / vencido" por categoría (azul-pizarra / rojo).
function saldoApilado(slug, clave, pos, tabla, col, titulo, [noVencido, vencido], tablaMedida) {
  return visual(id(slug, clave), 'barChart', pos, {
    roles: { Category: [pColumna(tabla, col)], Y: [pMedida(tablaMedida, noVencido), pMedida(tablaMedida, vencido)] },
    sort: ordenDesc(tablaMedida, noVencido),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(8), maxMarginFactor: num(45) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1000'), labelPrecision: num(0) } }],
      dataPoint: [
        { properties: { fill: color(C.PIZARRA) }, selector: meta(tablaMedida, noVencido) },
        { properties: { fill: color(C.ROJO) }, selector: meta(tablaMedida, vencido) },
      ],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(8) } }],
    },
    vc: vcTitulo(titulo),
  });
}
const kpiSaldo = (slug, clave, pos, titulo, medidas, tablaMedida, sub) => kpis(slug, clave, medidas.map((m) => [tablaMedida, m]), pos, titulo, sub);

// ============================================================ CARTERA (CxC y CxP comparten forma)
function paginaCartera(cfg) {
  const { slug, nombre, titulo, F, DIM, dimCol, dimAlias, m } = cfg;
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, titulo, 'Subtítulo de corte mensual', F));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'estado', F, 'Estado', [xCol(1), 148, wCol(2), 52], { sync: slug + '-estado' }));
  vs.push(kpiSaldo(slug, 'saldo-total', [xCol(3), 88, wCol(2), 112], 'Saldo total', [m.saldo], F, 'Partidas abiertas al corte'));
  vs.push(kpiSaldo(slug, 'saldo-no-vencido', [xCol(5), 88, wCol(2), 112], 'Saldo no vencido', [m.noVencido, m.pctNoVencido], F, 'Aún no vence'));
  vs.push(kpiSaldo(slug, 'saldo-vencido', [xCol(7), 88, wCol(2), 112], 'Saldo vencido', [m.vencido, m.pctVencido], F, 'Pasó su vencimiento'));
  vs.push(segmentador(slug, 'buscar', DIM, dimCol, [xCol(9), 88, wCol(2), 52], { busqueda: true }));
  vs.push(segmentador(slug, 'buscar-doc', F, 'documento_origen', [xCol(9), 148, wCol(2), 52], { busqueda: true }));
  vs.push(segmentador(slug, 'moneda', T.MONEDA, 'Moneda de análisis', [xCol(11), 88, wCol(2), 112], { unico: true, sync: 'moneda', titulo: 'Moneda' }));

  // Fila 1-2: matriz socio × rangos de vencimiento · saldo por socio (apilado)
  vs.push(matriz(slug, 'matriz-rangos', [xCol(1), FILA[0], wCol(9), ALTO * 2 + 16], 'Saldos por estado y rangos de antigüedad', {
    filas: [[DIM, dimAlias]], columnas: [[F, 'Rango de vencimiento']], valores: [[F, m.saldo]], filaTotal: true, columnaTotal: true, anchoFilas: 220, ordenPor: [F, m.saldo],
  }));
  vs.push(saldoApilado(slug, 'por-socio', [xCol(10), FILA[0], wCol(3), ALTO * 2 + 16], DIM, dimAlias, `Saldo por ${cfg.socio}`, [m.noVencido, m.vencido], F));
  // Fila 3: sector · detalle de saldos · límite de crédito (solo CxC) · empresa
  if (cfg.conSector) vs.push(saldoApilado(slug, 'por-sector', [xCol(1), FILA[2], wCol(2), ALTO], T.CLI, 'Sector', 'Saldo por sector', [m.noVencido, m.vencido], F));
  vs.push(matriz(slug, 'detalle', [xCol(cfg.conSector ? 3 : 1), FILA[2], wCol(cfg.conSector ? 5 : 7), ALTO], 'Detalle de saldos', {
    filas: [[F, 'documento_origen']],
    valores: [[F, m.fecha], [F, m.diasCredito], [F, m.diasTrans], [F, m.estado], [F, m.rango], [F, m.saldo]],
    filaTotal: true, columnaTotal: false, ordenPor: [F, m.saldo], anchoFilas: 140,
  }));
  if (cfg.conSector) {
    vs.push(matriz(slug, 'limite-credito', [xCol(8), FILA[2], wCol(3), ALTO], 'Límite de crédito por cliente', {
      filas: [[T.CLI, 'Cliente']], valores: [[F, 'Límite de crédito'], [F, '% Límite utilizado']], filaTotal: true, columnaTotal: false, ordenPor: [F, '% Límite utilizado'], anchoFilas: 150,
    }));
  }
  vs.push(saldoApilado(slug, 'por-empresa', [xCol(cfg.conSector ? 11 : 8), FILA[2], wCol(cfg.conSector ? 2 : 5), ALTO], T.EMP, 'nombre', 'Saldo por sucursal', [m.noVencido, m.vencido], F));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre, visuales: vs };
}
const CXC = {
  slug: 'cartera-cobrar', nombre: 'Cuentas por cobrar', titulo: 'Título de Cuentas por cobrar', F: 'FC_Cartera por cobrar',
  DIM: T.CLI, dimCol: 'nombre', dimAlias: 'Cliente', socio: 'cliente', conSector: true,
  m: { saldo: 'Saldo por cobrar', noVencido: 'Saldo corriente', pctNoVencido: '% No vencido', vencido: 'Saldo vencido', pctVencido: '% Vencido',
       fecha: 'Fecha de factura', diasCredito: 'Días de crédito de la partida', diasTrans: 'Días transcurridos de la partida', estado: 'Estado de la partida', rango: 'Rango de la partida' },
};
const CXPc = {
  slug: 'cartera-pagar', nombre: 'Cuentas por pagar', titulo: 'Título de Cuentas por pagar', F: 'FC_Cartera por pagar',
  DIM: PROV, dimCol: 'nombre', dimAlias: 'Proveedor', socio: 'proveedor', conSector: false,
  m: { saldo: 'Saldo por pagar', noVencido: 'Por pagar no vencido', pctNoVencido: '% Por pagar no vencido', vencido: 'Por pagar vencido', pctVencido: '% Por pagar vencido',
       fecha: 'Fecha de factura por pagar', diasCredito: 'Días de crédito de la partida por pagar', diasTrans: 'Días transcurridos de la partida por pagar', estado: 'Estado de la partida por pagar', rango: 'Rango de la partida por pagar' },
};

// ============================================================ UTILIDAD
function paginaUtilidad() {
  const slug = 'utilidad';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Utilidad', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), 148, wCol(2), 52], { seleccion: ANIO_ACTUAL, sync: 'anio' }));
  vs.push(kpis(slug, 'resultado', [[V, 'Costo de lo vendido'], [V, 'Ganancia'], [V, 'Ventas netas'], [V, '% Margen']], [xCol(3), 88, wCol(5), 112], 'Resultado', 'Costo · ganancia · resultado (venta) · margen %'));
  vs.push(segmentador(slug, 'f-linea', T.PROD, 'grupo_nombre', [xCol(8), 88, wCol(2), 52], { sync: 'linea' }));
  vs.push(segmentador(slug, 'f-sector', T.CLI, 'Sector', [xCol(8), 148, wCol(2), 52], { sync: 'sector' }));
  vs.push(segmentador(slug, 'f-buscar-cliente', T.CLI, 'nombre', [xCol(10), 88, wCol(3), 52], { busqueda: true }));
  vs.push(segmentador(slug, 'f-buscar-producto', T.PROD, 'nombre', [xCol(10), 148, wCol(3), 52], { busqueda: true }));

  const CG = ['Costo de lo vendido', 'Ganancia'];
  const colores = [C.GRIS_SERIE, C.PIZARRA];
  // Fila 1: mes (lista) · sector · cliente · por mes (apiladas + margen)
  vs.push(segmentador(slug, 'mes', T.CAL, 'mes_nombre_corto', [xCol(1), FILA[0], wCol(2), ALTO], { modo: 'VerticalList', titulo: 'Mes', sync: 'mes' }));
  vs.push(barras(slug, 'sector', [xCol(3), FILA[0], wCol(2), ALTO], T.CLI, 'Sector', 'Costo y ganancia por sector', CG, colores, { leyenda: true }));
  vs.push(barras(slug, 'cliente', [xCol(5), FILA[0], wCol(3), ALTO], T.CLI, 'nombre', 'Análisis de utilidades por cliente', CG, colores, { leyenda: true }));
  vs.push(visual(id(slug, 'por-mes'), 'lineStackedColumnComboChart', [xCol(8), FILA[0], wCol(5), ALTO], {
    roles: { Category: [pColumna(T.CAL, 'mes_nombre_corto')], Y: [pMedida(V, 'Costo de lo vendido'), pMedida(V, 'Ganancia')], Y2: [pMedida(V, '% Margen')] },
    sort: ordenAsc(T.CAL, 'mes_nombre_corto'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1000'), labelPrecision: num(0) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(8) } }],
      dataPoint: [
        { properties: { fill: color(C.GRIS_SERIE) }, selector: meta(V, 'Costo de lo vendido') },
        { properties: { fill: color(C.PIZARRA) }, selector: meta(V, 'Ganancia') },
        { properties: { fill: color(C.TINTA) }, selector: meta(V, '% Margen') },
      ],
      lineStyles: [{ properties: { lineStyle: str('dotted'), strokeWidth: num(2) }, selector: meta(V, '% Margen') }],
    },
    vc: vcTitulo('Análisis de utilidades por mes'),
  }));
  // Fila 2-3: vendedor (alto) · línea · detalle de ventas
  vs.push(barras(slug, 'vendedor', [xCol(1), FILA[1], wCol(3), ALTO * 2 + 16], T.VEND, 'nombre', 'Análisis de utilidades por vendedor', CG, colores, { leyenda: true }));
  vs.push(barras(slug, 'linea', [xCol(4), FILA[1], wCol(3), ALTO], T.PROD, 'grupo_nombre', 'Costo y ganancia por línea', CG, colores, { leyenda: true }));
  vs.push(matriz(slug, 'detalle', [xCol(7), FILA[1], wCol(6), ALTO * 2 + 16], 'Detalle de ventas', {
    filas: [[T.PROD, 'Producto']],
    valores: [[V, 'Unidades vendidas'], [V, 'Precio promedio unidad'], [V, 'Ventas netas'], [V, 'Costo de lo vendido'], [V, 'Ganancia'], [V, '% Margen']],
    filaTotal: true, columnaTotal: false, ordenPor: [V, 'Ventas netas'], anchoFilas: 200,
  }));
  vs.push(dona(slug, 'linea-dona', [xCol(4), FILA[2], wCol(3), ALTO], T.PROD, 'tipo_producto', 'Ganancia por categoría', 'Ganancia'));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Análisis de utilidad', visuales: vs };
}

// ============================================================ RECUPERACIÓN Y COBROS
function paginaCobros() {
  const slug = 'cobros';
  const F = CXC.F;
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Cobros', 'Subtítulo de corte mensual', F));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), 88, wCol(2), 52], { sync: 'empresa' }));
  vs.push(segmentador(slug, 'buscar', T.CLI, 'nombre', [xCol(1), 148, wCol(2), 52], { busqueda: true }));
  vs.push(kpiSaldo(slug, 'dias-aut', [xCol(3), 88, wCol(2), 112], 'Días autorizados', ['Días autorizados'], F, 'Crédito pactado promedio'));
  vs.push(kpiSaldo(slug, 'dias-prom', [xCol(5), 88, wCol(2), 112], 'Días promedio', ['Días promedio de cartera'], F, 'Antigüedad ponderada por saldo'));
  vs.push(kpiSaldo(slug, 'sobregiro', [xCol(7), 88, wCol(2), 112], 'Sobregiro actual en días', ['Sobregiro en días'], F, 'Promedio − autorizado'));
  vs.push(kpiSaldo(slug, 'saldo', [xCol(9), 88, wCol(2), 112], 'Saldo', ['Saldo por cobrar'], F, 'Partidas abiertas al corte'));
  vs.push(segmentador(slug, 'moneda', T.MONEDA, 'Moneda de análisis', [xCol(11), 88, wCol(2), 112], { unico: true, sync: 'moneda', titulo: 'Moneda' }));

  // Columna 1-3: tabla cliente (sobregiro, saldo)
  vs.push(matriz(slug, 'clientes', [xCol(1), FILA[0], wCol(3), ALTO * 3 + 32], 'Sobregiro y saldo por cliente', {
    filas: [[T.CLI, 'Cliente']], valores: [[F, 'Sobregiro en días'], [F, 'Saldo por cobrar']], filaTotal: true, columnaTotal: false, ordenPor: [F, 'Saldo por cobrar'], anchoFilas: 160,
  }));
  // Columna 4-9: cargos, abonos y saldos · totales · días de crédito por mes
  vs.push(visual(id(slug, 'cargos-abonos'), 'lineClusteredColumnComboChart', [xCol(4), FILA[0], wCol(6), ALTO], {
    roles: { Category: [pColumna(T.CAL, 'mes_anio_etiqueta')], Y: [pMedida(V, 'Cargos del mes'), pMedida(V, 'Abonos del mes')], Y2: [pMedida(F, 'Saldo al cierre del mes')] },
    sort: ordenAsc(T.CAL, 'mes_anio_etiqueta'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false), secShow: bool(false) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8), labelDisplayUnits: str('1000'), labelPrecision: num(0) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(8) } }],
      dataPoint: [
        { properties: { fill: color(C.ROJO) }, selector: meta(V, 'Cargos del mes') },
        { properties: { fill: color(C.VERDE) }, selector: meta(V, 'Abonos del mes') },
        { properties: { fill: color('#8e5ea2') }, selector: meta(F, 'Saldo al cierre del mes') },
      ],
    },
    vc: vcTitulo('Cargos, abonos y saldos mensuales', 'Últimos 12 meses · cargos = facturación con IVA · abonos = cobros de clientes · saldo = cartera al último corte del mes'),
  }));
  vs.push(kpis(slug, 'totales', [[V, 'Cargos totales 12 meses'], [V, 'Abonos totales 12 meses'], [V, 'Cargos menos abonos 12 meses']], [xCol(4), FILA[1], wCol(6), 104], 'Totales de los últimos 12 meses', 'Cargos · abonos · cargos − abonos (recuperación total = abonos)'));
  vs.push(visual(id(slug, 'dias-credito'), 'lineChart', [xCol(4), FILA[1] + 112, wCol(6), ALTO * 2 - 96], {
    roles: { Category: [pColumna(T.CAL, 'mes_anio_etiqueta')], Y: [pMedida(F, 'Días autorizados'), pMedida(F, 'Días promedio de cartera')] },
    sort: ordenAsc(T.CAL, 'mes_anio_etiqueta'),
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      valueAxis: [{ properties: { showAxisTitle: bool(false), fontSize: num(9) } }],
      labels: [{ properties: { show: bool(true), fontSize: num(8) } }],
      legend: [{ properties: { show: bool(true), position: str('Top'), fontSize: num(8) } }],
      lineStyles: [{ properties: { strokeWidth: num(2), showMarker: bool(true) } }],
      dataPoint: [
        { properties: { fill: color(C.PIZARRA) }, selector: meta(F, 'Días autorizados') },
        { properties: { fill: color(C.ROJO) }, selector: meta(F, 'Días promedio de cartera') },
      ],
    },
    vc: vcTitulo('Días de crédito autorizado y días promedio', 'Por mes del documento de las partidas abiertas'),
  }));
  // Columna 10-12: donas saldo vigente / vencido por rango
  vs.push(dona(slug, 'vigente', [xCol(10), FILA[0], wCol(3), ALTO + 112], F, 'Rango de vencimiento', 'Saldo vigente', 'Saldo corriente', F));
  vs.push(dona(slug, 'vencido', [xCol(10), FILA[1] + 120, wCol(3), ALTO * 2 - 104], F, 'Rango de vencimiento', 'Saldo vencido', 'Saldo vencido', F));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Recuperación y cobros', visuales: vs };
}

P.escribirPaginas(REPORT, [paginaCartera(CXC), paginaUtilidad(), paginaCobros(), paginaCartera(CXPc)]);
