// Genera las páginas de GESTIÓN del reporte PBIR (sesión 34): las hojas que no existen en Kraken 360
// y que explotan lo que el modelo ya calcula en Oro: resumen ejecutivo, segmentación RFM y riesgo de
// pago, concentración 80/20, tesorería y flujo de caja, pedidos y entregas, resultados contables.
//
// Uso:  node generar_paginas_gestion.js <ruta al .Report> [anio_actual]
//
// Determinista (ids sha1 por página y clave); solo reescribe sus propias páginas. El orden final de
// las hojas lo fija `ordenarPaginas` al final (Resumen primero, el resto junto a su familia).
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./pbir');
const { T, C, BANDA, FILA, ALTO, xCol, wCol, id, segmentador, kpis, ranking, dona, matriz, ejeValores, leyenda, encabezado, pie, visual, pColumna, pMedida, ordenAsc, str, num, color, meta, vcTitulo } = P;

const REPORT = P.reporteDeArgs();
const ANIO_ACTUAL = Number(process.argv[3] || new Date().getFullYear());
const V = T.VENTAS, CXC = 'FC_Cartera por cobrar', CXP = 'FC_Cartera por pagar', PAG = 'FC_Pagos recibidos', PAGE = 'FC_Pagos efectuados',
  PROY = 'FC_Proyección de caja', PED = 'FC_Pedidos', CONT = 'FC_Resultados contables', CTA = 'DM_Cuenta contable', INV = 'FC_Inventario',
  HIST = 'FC_Cartera cobrar histórico', CP = 'DM_Comportamiento de pago', RFM = T.RFM, AP = 'DM_Análisis de producto', AGING = 'DM_Antigüedad';
const MORADO = '#8e5ea2';

// Helpers genéricos (línea, columnas, combo, barrasH, pareto, cascada, panelAlertas) viven en pbir.js desde la sesión 35.
const { linea, columnas, combo, barrasH, pareto, cascada, panelAlertas } = P;
const kpi = (slug, clave, pos, titulo, medidas, sub) => kpis(slug, clave, medidas, pos, titulo, sub);

// ============================================================ 14 · RESUMEN EJECUTIVO
function paginaResumen() {
  const slug = 'resumen';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Resumen', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: ANIO_ACTUAL, sync: 'anio', titulo: 'Año' }));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(kpi(slug, 'ventas', [xCol(3), BANDA[0], wCol(4), 112], 'Ventas', [
    [V, 'Venta del mes en curso', 'Mes en curso'], [V, 'Variación del mes en curso vs mes anterior', 'vs. mes anterior al día'], [V, 'Ventas acumuladas año', 'Acumulado del año'], [V, 'Ticket promedio', 'Ticket promedio'],
  ], 'Moneda de presentación · sin IVA · el mes se compara al mismo día'));
  vs.push(kpi(slug, 'cartera', [xCol(7), BANDA[0], wCol(4), 112], 'Cartera y caja', [
    [CXC, 'Por cobrar terceros hoy', 'Por cobrar hoy'], [CXC, '% Vencido terceros hoy', '% vencido hoy'], [PAG, 'Cobros de clientes', 'Cobros del período'], [CXP, 'Posición neta hoy', 'Posición neta hoy'],
  ], 'Saldos = foto de hoy · cobros = período filtrado'));
  vs.push(kpi(slug, 'operacion', [xCol(11), BANDA[0], wCol(2), 112], 'Operación', [[PED, 'Backlog', 'Backlog'], [INV, 'Valor de inventario', 'Inventario']], 'Pendiente de entregar · existencias'));

  // Fila 1: venta mensual (actual vs año anterior) · acumulado del mes al día · alertas (2 filas)
  vs.push(P.columnasMensuales(slug, 'mensual', [xCol(1), FILA[0], wCol(5), ALTO], 'Venta por mes · año actual vs anterior'));
  vs.push(visual(id(slug, 'mes-al-dia'), 'lineChart', [xCol(6), FILA[0], wCol(3), ALTO], {
    roles: { Category: [pColumna(T.CAL, 'dia')], Y: [pMedida(V, 'Ritmo del mes en curso'), pMedida(V, 'Ritmo del mes anterior')] },
    sort: ordenAsc(T.CAL, 'dia'),
    objects: {
      categoryAxis: P.ejeCategoria('Día del mes'), valueAxis: ejeValores({ start: num(0) }), legend: leyenda(false),
      lineStyles: [P.marcadoresFinos, { properties: { strokeWidth: num(2) }, selector: meta(V, 'Ritmo del mes en curso') }, { properties: { lineStyle: str('dotted'), strokeWidth: num(2) }, selector: meta(V, 'Ritmo del mes anterior') }],
      dataPoint: [{ properties: { fill: color(C.PIZARRA) }, selector: meta(V, 'Ritmo del mes en curso') }, { properties: { fill: color(C.ACENTO) }, selector: meta(V, 'Ritmo del mes anterior') }],
    },
    vc: vcTitulo('Ritmo del mes', 'Acumulado por día · sólida: mes en curso al corte · punteada: mes anterior completo'),
  }));
  vs.push(...panelAlertas(slug, 'alertas', [xCol(9), FILA[0], wCol(4), ALTO * 2 + 16], 'Focos de atención', 'Calculados sobre datos gobernados · hoy', [
    [CXC, 'Alerta de vencido', C.ROJO], [PROY, 'Alerta de caja', MORADO], [PED, 'Alerta de backlog', C.PIZARRA], [AP, 'Alerta de quiebre', '#8a6d1f'], [V, 'Alerta de venta bajo costo', C.TINTA_SUAVE],
  ]));
  // Fila 2: aging de terceros · top clientes · top productos
  vs.push(barrasH(slug, 'aging', [xCol(1), FILA[1], wCol(3), ALTO], 'Antigüedad de la cartera · hoy', [AGING, 'rango_aging_nombre'], [[CXC, 'Por cobrar terceros hoy', C.PIZARRA]], { ordenPorColumna: true, subtitulo: 'Terceros · saldo por rango de vencimiento' }));
  vs.push(ranking(slug, 'top-clientes', [xCol(4), FILA[1], wCol(3), ALTO], T.CLI, 'nombre', 'Clientes del período · top', 'cliente', undefined, undefined, undefined, { margen: 40 }));
  vs.push(ranking(slug, 'top-productos', [xCol(7), FILA[1], wCol(2), ALTO], T.PROD, 'nombre', 'Productos del período · top', 'producto', undefined, undefined, undefined, { margen: 40 }));
  // Fila 3: proyección de caja · segmentos RFM · frescura
  vs.push(columnas(slug, 'proyeccion', [xCol(1), FILA[2], wCol(5), ALTO], 'Caja pactada por semana', 'Entradas según vencimiento de cada partida · contractual, no pronóstico', [PROY, 'semana_etiqueta'], [[PROY, 'Entradas proyectadas', C.VERDE], [PROY, 'Salidas proyectadas', C.ROJO]]));
  vs.push(barrasH(slug, 'rfm', [xCol(6), FILA[2], wCol(4), ALTO], 'Clientes por segmento · 12 meses', [RFM, 'segmento_rfm_nombre'], [[RFM, 'Venta 12m clasificada', C.PIZARRA]], { subtitulo: 'Venta de los últimos 12 meses por segmento RFM' }));
  vs.push(kpi(slug, 'frescura', [xCol(10), FILA[2], wCol(3), 112], 'Confianza del dato', [[T.CARGA, 'Dato completo hasta', 'Dato completo hasta'], [T.CARGA, 'Días desde última extracción', 'Extraído hace (días)'], [T.CARGA, 'Dominios desactualizados', 'Dominios atrasados']], 'Un tablero que no dice su fecha no sirve'));
  vs.push(kpi(slug, 'ciclo', [xCol(10), FILA[2] + 120, wCol(3), 120], 'Ciclo de efectivo', [[CXC, 'Días de cartera terceros', 'Días de cobro (DSO)'], [CXP, 'Días de pago terceros', 'Días de pago (DPO)'], [CXP, 'Ciclo de conversión de efectivo', 'Ciclo (días)']], 'Cuántos días tarda el dinero en volver'));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Resumen', visuales: vs };
}

// ============================================================ 15 · SEGMENTACIÓN Y RIESGO DE CLIENTES
function paginaSegmentacion() {
  const slug = 'clientes-segmentacion';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Segmentación', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), BANDA[0], wCol(2), 64], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(segmentador(slug, 'buscar', T.CLI, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { busqueda: true, titulo: 'Buscar cliente' }));
  vs.push(kpi(slug, 'rfm', [xCol(3), BANDA[0], wCol(7), 112], 'Segmentos RFM · últimos 12 meses', [
    [RFM, 'Clientes campeones', 'Campeones'], [RFM, 'Clientes leales', 'Leales'], [RFM, 'Clientes en riesgo', 'En riesgo'], [RFM, 'Clientes en riesgo valiosos', 'En riesgo valiosos'], [RFM, 'Clientes dormidos', 'Dormidos'], [RFM, 'Venta 12m en riesgo', 'Venta en riesgo'],
  ], 'Recencia · frecuencia · monto · «Venta en riesgo» = lo que se pierde si nadie llama'));
  vs.push(kpi(slug, 'cobro', [xCol(10), BANDA[0], wCol(3), 112], 'Riesgo de cobro · hoy', [[CP, 'Clientes en vencido crítico', 'Clientes críticos'], [CP, 'Saldo en clientes críticos', 'Saldo en críticos']], 'Revisar antes de despachar'));

  // Fila 1: venta por segmento · clientes por segmento · matriz en riesgo (2 filas)
  vs.push(barrasH(slug, 'venta-segmento', [xCol(1), FILA[0], wCol(4), ALTO], 'Venta 12 meses por segmento', [RFM, 'segmento_rfm_nombre'], [[RFM, 'Venta 12m clasificada', C.PIZARRA]]));
  vs.push(dona(slug, 'clientes-segmento', [xCol(5), FILA[0], wCol(3), ALTO], RFM, 'segmento_rfm_nombre', 'Clientes por segmento', 'Clientes activos 12m', RFM));
  vs.push(matriz(slug, 'en-riesgo', [xCol(8), FILA[0], wCol(5), ALTO * 2 + 16], 'Clientes en riesgo · a quién llamar esta semana', {
    filas: [[T.CLI, 'Cliente']],
    valores: [[RFM, 'Segmento en riesgo'], [RFM, 'Última compra en riesgo'], [RFM, 'Recencia en riesgo (días)'], [RFM, 'Compras en riesgo 12m'], [RFM, 'Venta 12m en riesgo']],
    filaTotal: true, columnaTotal: false, ordenPor: [RFM, 'Venta 12m en riesgo'], anchoFilas: 170,
  }));
  // Fila 2: saldo por perfil de pago · clientes por perfil
  vs.push(barrasH(slug, 'saldo-perfil', [xCol(1), FILA[1], wCol(4), ALTO], 'Saldo por perfil de pago', [CP, 'perfil_riesgo_nombre'], [[CP, 'Saldo corriente por perfil', C.PIZARRA], [CP, 'Saldo vencido por perfil', C.ROJO]], { subtitulo: 'Corriente vs vencido · foto al corte' }));
  vs.push(dona(slug, 'clientes-perfil', [xCol(5), FILA[1], wCol(3), ALTO], CP, 'perfil_riesgo_nombre', 'Clientes con saldo por perfil', 'Clientes por perfil de pago', CP));
  // Fila 3: matriz críticos · ABC
  vs.push(matriz(slug, 'criticos', [xCol(1), FILA[2], wCol(7), ALTO], 'Clientes en vencido crítico', {
    filas: [[T.CLI, 'Cliente']],
    valores: [[CP, 'Saldo vencido crítico'], [CP, '% Vencido del cliente (críticos)'], [CP, 'Días de mora máximos (críticos)'], [CP, 'Días desde el último pago (críticos)']],
    filaTotal: true, columnaTotal: false, ordenPor: [CP, 'Saldo vencido crítico'], anchoFilas: 200,
  }));
  vs.push(matriz(slug, 'abc', [xCol(8), FILA[2], wCol(5), ALTO], 'Clasificación ABC · últimos 12 meses', {
    filas: [[T.CLI, 'Clase']], valores: [[V, 'Clientes 12 meses'], [V, 'Ventas 12 meses']], filaTotal: true, columnaTotal: false, ordenPor: [V, 'Ventas 12 meses'],
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Segmentación', visuales: vs };
}

// ============================================================ 16 · CONCENTRACIÓN 80/20
function paginaConcentracion() {
  const slug = 'concentracion';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Concentración', 'Subtítulo de corte anual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: ANIO_ACTUAL, sync: 'anio', titulo: 'Año' }));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(kpi(slug, 'clientes', [xCol(3), BANDA[0], wCol(5), 112], 'Clientes · ¿de quién depende la venta?', [
    [V, 'Clientes para el 80% de la venta', 'Clientes = 80 % venta'], [V, '% Clientes para el 80%', '% de los clientes'], [V, '% Venta en top 10 clientes', 'Venta en top 10'], [V, 'Clientes con venta', 'Clientes con venta'],
  ], 'Venta a terceros del período · regla 80/20'));
  vs.push(kpi(slug, 'productos', [xCol(8), BANDA[0], wCol(3), 112], 'Productos', [[V, 'Productos para el 80% de la venta', 'Productos = 80 % venta'], [V, '% Productos para el 80%', '% del catálogo vendido']], 'Venta neta del período'));
  vs.push(kpi(slug, 'cartera', [xCol(11), BANDA[0], wCol(2), 112], 'Cartera · hoy', [[CXC, '% Exposición mayor deudor', 'Mayor deudor'], [CXC, '% Saldo en top 5 deudores', 'Top 5 deudores']], 'Riesgo de concentración'));

  vs.push(pareto(slug, 'pareto-clientes', [xCol(1), FILA[0], wCol(6), ALTO * 2 + 16], 'Pareto de clientes', 'Barras: venta a terceros · línea: % acumulado · referencia 80 %', [T.CLI, 'nombre'], [V, 'Ventas a terceros'], [V, '% acumulado de venta clientes']));
  vs.push(pareto(slug, 'pareto-productos', [xCol(7), FILA[0], wCol(6), ALTO * 2 + 16], 'Pareto de productos', 'Barras: venta neta · línea: % acumulado · referencia 80 %', [T.PROD, 'nombre'], [V, 'Ventas netas'], [V, '% acumulado de venta productos']));
  vs.push(matriz(slug, 'rk-clientes', [xCol(1), FILA[2], wCol(6), ALTO], 'Ranking de clientes', {
    filas: [[T.CLI, 'Cliente']], valores: [[V, 'Ranking de cliente por venta'], [V, 'Ventas a terceros'], [V, '% acumulado de venta clientes']], filaTotal: false, columnaTotal: false, ordenPor: [V, 'Ventas a terceros'], anchoFilas: 260,
  }));
  vs.push(matriz(slug, 'rk-productos', [xCol(7), FILA[2], wCol(6), ALTO], 'Ranking de productos', {
    filas: [[T.PROD, 'Producto']], valores: [[V, 'Ranking de producto por venta'], [V, 'Ventas netas'], [V, '% acumulado de venta productos']], filaTotal: false, columnaTotal: false, ordenPor: [V, 'Ventas netas'], anchoFilas: 260,
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Concentración', visuales: vs };
}

// ============================================================ 17 · TESORERÍA Y FLUJO DE CAJA
function paginaTesoreria() {
  const slug = 'tesoreria';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Tesorería', 'Subtítulo de corte anual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: ANIO_ACTUAL, sync: 'anio', titulo: 'Año' }));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(kpi(slug, 'caja', [xCol(3), BANDA[0], wCol(6), 112], 'Caja del período', [
    [PAG, 'Cobros de clientes', 'Cobros'], [PAGE, 'Pagos a proveedores', 'Pagos'], [PAGE, 'Flujo neto de caja', 'Flujo neto'], [PAG, '% Cobrado vs facturado', '% cobrado vs facturado'], [PAG, 'Clientes que pagaron', 'Clientes que pagaron'], [PAG, 'Cobro promedio', 'Cobro promedio'],
  ], 'Cobros de clientes y pagos a proveedores del período filtrado'));
  vs.push(kpi(slug, 'proximo', [xCol(9), BANDA[0], wCol(4), 112], 'Exigible y próximas 4 semanas · hoy', [
    [PROY, 'Entradas vencidas (exigible)', 'Cobrable hoy (vencido)'], [PROY, 'Entradas próximas 4 semanas', 'Entra en 4 semanas'], [PROY, 'Flujo neto próximas 4 semanas', 'Flujo neto 4 semanas'],
  ], 'Según el vencimiento pactado de cada partida'));
  // Fila 1: cobros vs pagos por mes + flujo neto · proyección semanal
  // La línea va en eje secundario y es el ACUMULADO del año: una línea «flujo neto del mes» sobre columnas «cobros» caía a la misma altura (pagos ≈ 0) y parecía un error.
  vs.push(combo(slug, 'cobros-pagos', [xCol(1), FILA[0], wCol(7), ALTO], 'Cobros, pagos y flujo neto acumulado', 'Columnas: cobros (verde) y pagos (rojo) del mes · línea ámbar: flujo neto acumulado del año (eje derecho)', [T.CAL, 'mes_nombre_corto'], [[PAG, 'Cobros de clientes', C.VERDE], [PAGE, 'Pagos a proveedores', C.ROJO]], [PAGE, 'Flujo neto acumulado año', C.ACENTO], { ejeSecundario: true }));
  vs.push(columnas(slug, 'proyeccion', [xCol(8), FILA[0], wCol(5), ALTO], 'Caja pactada por semana', 'Entradas y salidas según vencimiento · «Vencido» = exigible hoy', [PROY, 'semana_etiqueta'], [[PROY, 'Entradas proyectadas', C.VERDE], [PROY, 'Salidas proyectadas', C.ROJO]]));
  // Fila 2: tendencia de la cartera · top cobros por cliente
  vs.push(linea(slug, 'cartera-hist', [xCol(1), FILA[1], wCol(7), ALTO], 'Evolución de la cartera por cobrar', 'Saldo total y vencido en cada corte diario · ¿mejora o empeora?', [HIST, 'fecha_corte'], [[HIST, 'Saldo histórico por cobrar', C.PIZARRA], [HIST, 'Vencido histórico por cobrar', C.ROJO]]));
  vs.push(ranking(slug, 'cobros-cliente', [xCol(8), FILA[1], wCol(5), ALTO], T.CLI, 'nombre', 'Cobros por cliente · top', 'cliente', 'Cobros de clientes', undefined, PAG));
  // Fila 3: detalle de cobros · estado del cobro · acumulados
  vs.push(matriz(slug, 'detalle-cobros', [xCol(1), FILA[2], wCol(6), ALTO], 'Detalle de cobros por cliente', {
    filas: [[T.CLI, 'Cliente']], valores: [[PAG, 'Cobros de clientes'], [PAG, 'Cantidad de cobros'], [PAG, 'Cobro promedio'], [CXC, 'Saldo por cobrar']], filaTotal: true, columnaTotal: false, ordenPor: [PAG, 'Cobros de clientes'], anchoFilas: 220,
  }));
  vs.push(dona(slug, 'estado-cobro', [xCol(7), FILA[2], wCol(3), ALTO], PAG, 'Estado del cobro', 'Cobros por estado', 'Cobros de clientes', PAG));
  vs.push(kpi(slug, 'acumulados', [xCol(10), FILA[2], wCol(3), 112], 'Acumulado del año', [[PAG, 'Cobros acumulados año', 'Cobros'], [PAGE, 'Flujo neto acumulado año', 'Flujo neto']], 'Desde el 1 de enero'));
  vs.push(kpi(slug, 'pagos-acum', [xCol(10), FILA[2] + 120, wCol(3), 120], 'Pagos a proveedores', [[PAGE, 'Pagos acumulados año', 'Acumulado del año'], [PAGE, 'Proveedores pagados', 'Proveedores pagados']], 'Desde el 1 de enero'));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Tesorería', visuales: vs };
}

// ============================================================ 18 · PEDIDOS Y ENTREGAS
function paginaPedidos() {
  const slug = 'pedidos';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Pedidos', 'Subtítulo de corte anual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: ANIO_ACTUAL, sync: 'anio', titulo: 'Año' }));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(kpi(slug, 'pedidos', [xCol(3), BANDA[0], wCol(6), 112], 'Pedidos del período', [
    [PED, 'Monto pedido', 'Monto pedido'], [PED, 'Pedidos del período', 'Pedidos'], [PED, 'Clientes con pedido', 'Clientes'], [PED, 'Ticket promedio de pedido', 'Ticket de pedido'], [PED, 'Pedido sobre facturado', 'Pedido vs factura'], [PED, 'Fill rate', 'Fill rate'],
  ], 'Compromiso comercial · sin IVA'));
  vs.push(kpi(slug, 'backlog', [xCol(9), BANDA[0], wCol(4), 112], 'Backlog · pendiente de entregar', [
    [PED, 'Backlog', 'Backlog'], [PED, 'Backlog vencido', 'Vencido'], [PED, '% Backlog vencido', '% vencido'], [PED, 'Pedidos abiertos', 'Pedidos abiertos'],
  ], 'Lo prometido y aún no entregado'));
  vs.push(columnas(slug, 'pedido-vs-factura', [xCol(1), FILA[0], wCol(7), ALTO], 'Pedido vs facturado por mes', 'Columnas: monto pedido (gris) y ventas netas (pizarra)', [T.CAL, 'mes_nombre_corto'], [[PED, 'Monto pedido', C.GRIS_SERIE], [V, 'Ventas netas', C.PIZARRA]]));
  vs.push(ranking(slug, 'backlog-cliente', [xCol(8), FILA[0], wCol(5), ALTO], T.CLI, 'nombre', 'Backlog por cliente', 'cliente', 'Backlog', undefined, PED));
  vs.push(matriz(slug, 'abiertos', [xCol(1), FILA[1], wCol(8), ALTO], 'Pedidos abiertos · qué falta entregar', {
    filas: [[PED, 'Pedido']],
    valores: [[PED, 'Cliente del pedido'], [PED, 'Fecha del pedido (abiertos)'], [PED, 'Fecha de entrega (abiertos)'], [PED, 'Días de atraso de entrega'], [PED, 'Cantidad pendiente'], [PED, 'Backlog']],
    filaTotal: true, columnaTotal: false, ordenPor: [PED, 'Backlog'], anchoFilas: 80, anchoColumnas: { 'Cliente del pedido': 230 },
  }));
  vs.push(ranking(slug, 'backlog-producto', [xCol(1), FILA[2], wCol(8), ALTO], T.PROD, 'nombre', 'Backlog por producto', 'producto', 'Backlog', undefined, PED, { margen: 35 }));
  vs.push(ranking(slug, 'por-vendedor', [xCol(9), FILA[1], wCol(4), ALTO], T.VEND, 'nombre', 'Monto pedido por vendedor', 'vendedor', 'Monto pedido', undefined, PED));
  vs.push(ranking(slug, 'por-linea', [xCol(9), FILA[2], wCol(4), ALTO], T.PROD, 'grupo_nombre', 'Monto pedido por línea', 'línea', 'Monto pedido', undefined, PED));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Pedidos', visuales: vs };
}

// ============================================================ 19 · RESULTADOS CONTABLES
function paginaResultados() {
  const slug = 'resultados';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Resultados', 'Subtítulo de corte anual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: ANIO_ACTUAL, sync: 'anio', titulo: 'Año' }));
  vs.push(segmentador(slug, 'empresa', T.EMP, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { sync: 'empresa', titulo: 'Empresa' }));
  vs.push(kpi(slug, 'pyl', [xCol(3), BANDA[0], wCol(7), 112], 'Resultado según el mayor', [
    [CONT, 'Ingresos contables', 'Ingresos'], [CONT, 'Costo (contable)', 'Costo'], [CONT, 'Gasto operativo', 'Gasto operativo'], [CONT, 'Resultado contable', 'Resultado'], [CONT, '% Margen operativo', 'Margen operativo'],
  ], 'Cuentas de resultado del libro mayor · período filtrado'));
  vs.push(kpi(slug, 'control', [xCol(10), BANDA[0], wCol(3), 112], 'Control: contabilidad vs facturación', [[CONT, 'Brecha contable vs facturado', 'Brecha'], [CONT, '% Brecha contable', '% brecha']], 'Debe rondar cero: el tablero y el mayor dicen lo mismo'));
  vs.push(cascada(slug, 'puente', [xCol(1), FILA[0], wCol(5), ALTO], 'Puente del resultado', 'Ingresos − costo − gastos = resultado', [CONT, 'Naturaleza contable'], [CONT, 'Aporte al resultado']));
  vs.push(combo(slug, 'por-mes', [xCol(6), FILA[0], wCol(7), ALTO], 'Ingresos, gasto y margen operativo por mes', 'Columnas: ingresos y gasto · línea ámbar: margen operativo % (eje derecho)', [T.CAL, 'mes_nombre_corto'], [[CONT, 'Ingresos contables', C.PIZARRA], [CONT, 'Gasto operativo', C.ROJO]], [CONT, '% Margen operativo', C.ACENTO], { ejeSecundario: true }));
  vs.push(ranking(slug, 'gasto-rubro', [xCol(1), FILA[1], wCol(5), ALTO], CTA, 'Cuenta', 'Gasto por cuenta', 'cuenta', 'Gasto operativo', undefined, CONT, { margen: 40 }));
  vs.push(columnas(slug, 'contable-vs-ventas', [xCol(6), FILA[1], wCol(7), ALTO], 'Ingresos contables vs ventas netas por mes', 'Si las dos columnas coinciden, contabilidad y facturación cuadran', [T.CAL, 'mes_nombre_corto'], [[CONT, 'Ingresos contables', C.PIZARRA], [V, 'Ventas netas', C.PIZARRA_CLARA]]));
  vs.push(matriz(slug, 'cuentas', [xCol(1), FILA[2], wCol(12), ALTO], 'Detalle por cuenta contable', {
    filas: [[CTA, 'Cuenta']],
    valores: [[CONT, 'Ingresos contables'], [CONT, 'Costo (contable)'], [CONT, 'Gasto operativo'], [CONT, 'Resultado contable'], [CONT, 'Partidas contables']],
    filaTotal: true, columnaTotal: false, ordenPor: [CONT, 'Resultado contable'], anchoFilas: 330,
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Resultados', visuales: vs };
}

// ============================================================ escritura y orden
const paginas = [paginaResumen(), paginaSegmentacion(), paginaConcentracion(), paginaTesoreria(), paginaPedidos(), paginaResultados()];
P.escribirPaginas(REPORT, paginas);

// Orden: Resumen primero; Segmentación y Concentración tras «Recuperados» (familia Clientes); Tesorería tras «Cobros»;
// Pedidos y Resultados al final (familia Finanzas). Las páginas que no están en este mapa conservan su posición.
function ordenarPaginas() {
  const pagesPath = path.join(REPORT, 'definition', 'pages', 'pages.json');
  const pj = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
  const nombre = (pid) => JSON.parse(fs.readFileSync(path.join(REPORT, 'definition', 'pages', pid, 'page.json'), 'utf8')).displayName;
  const mias = Object.fromEntries(paginas.map((p) => [p.nombre, p.id]));
  let orden = pj.pageOrder.filter((pid) => !paginas.some((p) => p.id === pid));
  const insertarTras = (nombreAncla, ...ids) => {
    const i = orden.findIndex((pid) => nombre(pid) === nombreAncla);
    orden.splice(i < 0 ? orden.length : i + 1, 0, ...ids);
  };
  orden.unshift(mias['Resumen']);
  insertarTras('Recuperados', mias['Segmentación'], mias['Concentración']);
  insertarTras('Cobros', mias['Tesorería']);
  insertarTras('Por pagar', mias['Pedidos'], mias['Resultados']);
  pj.pageOrder = orden;
  pj.activePageName = mias['Resumen'];
  fs.writeFileSync(pagesPath, JSON.stringify(pj, null, 2) + '\n');
  console.log('Orden:', orden.map(nombre).join(' · '));
}
ordenarPaginas();
