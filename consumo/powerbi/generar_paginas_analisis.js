// Genera las páginas de ANÁLISIS del reporte PBIR (sesión 35): hojas que explotan tablas de Oro que
// ninguna réplica de Kraken 360 ni las hojas de gestión usaban a fondo — vendedores, venta diaria,
// análisis de producto (inventario muerto / quiebres / ABC) y compras con proveedores.
//
// Uso:  node generar_paginas_analisis.js <ruta al .Report>
//
// Determinista (ids sha1 por página y clave); solo reescribe sus propias páginas. El orden final de las
// hojas lo fija `ordenarPaginas` al final (cada hoja junto a su familia). Correr DESPUÉS de
// generar_paginas_gestion.js (que también ordena): ambos respetan las páginas que no son suyas.
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./pbir');
const { T, C, BANDA, FILA, ALTO, xCol, wCol, id, segmentador, kpis, ranking, dona, matriz, encabezado, pie, linea, columnas, barrasH, pareto, filtroVisual } = P;

const REPORT = P.reporteDeArgs();
const V = T.VENTAS, PED = 'FC_Pedidos', INV = 'FC_Inventario', AP = 'DM_Análisis de producto', VD = 'FC_Venta diaria',
  COMP = 'FC_Compras', PROV = 'DM_Proveedor', CXP = 'FC_Cartera por pagar', PAGE = 'FC_Pagos efectuados';
const kpi = (slug, clave, pos, titulo, medidas, sub) => kpis(slug, clave, medidas, pos, titulo, sub);

// ============================================================ 20 · VENDEDORES
function paginaVendedores() {
  const slug = 'vendedores';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Vendedores', 'Subtítulo de corte anual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio_selector', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: 'Año actual', sync: 'anio', titulo: 'Año', busqueda: false, descendente: true }));
  vs.push(segmentador(slug, 'vendedor', T.VEND, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { busqueda: true, titulo: 'Vendedor' }));
  vs.push(kpi(slug, 'equipo', [xCol(3), BANDA[0], wCol(7), 112], 'Equipo comercial · período filtrado', [
    [V, 'Ventas netas', 'Ventas netas'], [V, 'Clientes con venta', 'Clientes'], [V, 'Venta promedio por cliente', 'Venta por cliente'], [V, 'Documentos de venta', 'Facturas'], [V, 'Ticket promedio', 'Ticket promedio'], [V, 'Productos vendidos', 'Productos vendidos'],
  ], 'Moneda de presentación · sin IVA · elegí un vendedor para ver su ficha'));
  vs.push(kpi(slug, 'pedidos', [xCol(10), BANDA[0], wCol(3), 112], 'Pedidos', [[PED, 'Monto pedido', 'Monto pedido'], [PED, 'Backlog', 'Backlog'], [PED, 'Fill rate', 'Fill rate']], 'Compromiso y entregas pendientes'));
  // Fila 1: venta y margen por vendedor · mapa de calor mensual
  vs.push(barrasH(slug, 'venta-margen', [xCol(1), FILA[0], wCol(5), ALTO], 'Facturado y pedido por vendedor', [T.VEND, 'nombre'], [[V, 'Ventas netas', C.PIZARRA], [PED, 'Monto pedido', C.PIZARRA_CLARA]], { apilado: false, subtitulo: 'Azul: venta neta facturada · claro: monto pedido' }));
  vs.push(matriz(slug, 'calor-mensual', [xCol(6), FILA[0], wCol(7), ALTO], 'Venta mensual por vendedor · mapa de calor', {
    filas: [[T.VEND, 'Vendedor']], columnas: [[T.CAL, 'Mes corto']], valores: [[V, 'Ventas netas']], calorEn: [V, 'Ventas netas'], filaTotal: true, columnaTotal: true, anchoFilas: 150,
  }));
  // Fila 2: ficha del vendedor · participación
  vs.push(matriz(slug, 'ficha', [xCol(1), FILA[1], wCol(8), ALTO], 'Ficha por vendedor', {
    filas: [[T.VEND, 'Vendedor']],
    valores: [[V, 'Ventas netas'], [V, 'Participación del vendedor'], [V, 'Clientes con venta'], [V, 'Venta promedio por cliente'], [V, 'Documentos de venta'], [V, 'Ticket promedio'], [V, 'Productos vendidos'], [PED, 'Monto pedido'], [PED, 'Backlog']],
    filaTotal: true, columnaTotal: false, ordenPor: [V, 'Ventas netas'], anchoFilas: 150,
  }));
  vs.push(dona(slug, 'participacion', [xCol(9), FILA[1], wCol(4), ALTO], T.VEND, 'nombre', 'Participación en la venta', 'Ventas netas'));
  // Fila 3: clientes atendidos · ticket · tendencia
  vs.push(barrasH(slug, 'clientes', [xCol(1), FILA[2], wCol(3), ALTO], 'Clientes atendidos', [T.VEND, 'nombre'], [[V, 'Clientes con venta', C.PIZARRA]], { subtitulo: 'Clientes con al menos una factura' }));
  vs.push(barrasH(slug, 'ticket', [xCol(4), FILA[2], wCol(3), ALTO], 'Ticket promedio por vendedor', [T.VEND, 'nombre'], [[V, 'Ticket promedio', C.PIZARRA_CLARA]], { subtitulo: 'Venta neta ÷ facturas' }));
  vs.push(linea(slug, 'tendencia', [xCol(7), FILA[2], wCol(6), ALTO], 'Tendencia mensual', 'Venta facturada y monto pedido por mes · del vendedor filtrado o de todo el equipo', [T.CAL, 'Mes corto'], [[V, 'Ventas netas', C.PIZARRA], [PED, 'Monto pedido', C.ACENTO]]));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Vendedores', visuales: vs };
}

// ============================================================ 21 · PULSO DIARIO
function paginaPulso() {
  const slug = 'pulso';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Pulso', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio_selector', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: 'Año actual', sync: 'anio', titulo: 'Año', busqueda: false, descendente: true }));
  vs.push(segmentador(slug, 'mes', T.CAL, 'mes_nombre_corto', [xCol(1), BANDA[1], wCol(2), 64], { titulo: 'Mes', busqueda: false, sync: 'mes' }));
  vs.push(kpi(slug, 'ritmo', [xCol(3), BANDA[0], wCol(7), 112], 'Ritmo de la venta · período filtrado', [
    [VD, 'Venta diaria neta', 'Venta del período'], [VD, 'Venta promedio día operado', 'Promedio por día operado'], [VD, 'Venta por día hábil', 'Por día hábil'], [VD, 'Días con venta', 'Días con venta'], [VD, 'Días sin venta', 'Días sin venta'], [VD, 'Clientes activos por día', 'Clientes por día'],
  ], 'Serie diaria de Oro · sin IVA · un día sin factura cuenta como día sin venta'));
  vs.push(kpi(slug, 'proyeccion', [xCol(10), BANDA[0], wCol(3), 112], 'Proyección · elegí un mes', [[VD, 'Proyección de cierre de mes', 'Cierre proyectado'], [VD, 'Índice de estacionalidad', 'Índice estacional']], 'Ritmo por día hábil × días hábiles del mes'));
  // Fila 1: serie diaria con medias móviles
  vs.push(linea(slug, 'serie', [xCol(1), FILA[0], wCol(12), ALTO], 'Venta diaria y medias móviles', 'Puntos: venta de cada día · azul: media móvil 7 días · ámbar: media móvil 30 días', [T.CAL, 'fecha'],
    [[VD, 'Venta diaria neta', C.PIZARRA_CLARA], [VD, 'Venta media móvil 7d', C.PIZARRA], [VD, 'Venta media móvil 30d', C.ACENTO]], { finos: true, filtros: [filtroVisual(T.CAL, 'es_pasado', 'true')] }));
  // Fila 2: mapa de calor día de la semana × mes · promedio por día de la semana
  vs.push(matriz(slug, 'calor', [xCol(1), FILA[1], wCol(8), ALTO], 'Mapa de calor · día de la semana × mes', {
    filas: [[T.CAL, 'Día']], columnas: [[T.CAL, 'Mes corto']], valores: [[VD, 'Venta diaria neta']], calorEn: [VD, 'Venta diaria neta'], filaTotal: true, columnaTotal: true, anchoFilas: 60,
  }));
  vs.push(barrasH(slug, 'dia-semana', [xCol(9), FILA[1], wCol(4), ALTO], 'Promedio por día de la semana', [T.CAL, 'dia_semana_corto'], [[VD, 'Venta promedio día operado', C.PIZARRA]], { ordenPorColumna: true, subtitulo: 'Solo días con venta' }));
  // Fila 3: venta por semana · estacionalidad por mes
  vs.push(columnas(slug, 'semanal', [xCol(1), FILA[2], wCol(7), ALTO], 'Venta por semana', 'Semana ISO · sin etiquetas: el detalle está en la información sobre herramientas', [T.CAL, 'anio_semana'], [[VD, 'Venta diaria neta', C.PIZARRA]], { etiquetas: false }));
  vs.push(matriz(slug, 'estacionalidad', [xCol(8), FILA[2], wCol(5), ALTO], 'Estacionalidad por mes', {
    filas: [[T.CAL, 'Mes corto']], valores: [[VD, 'Venta diaria neta'], [VD, 'Índice de estacionalidad'], [VD, 'Días con venta'], [VD, 'Clientes activos por día']], calorEn: [VD, 'Índice de estacionalidad'], filaTotal: false, columnaTotal: false, anchoFilas: 50,
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Pulso', visuales: vs };
}

// ============================================================ 22 · SALUD DEL INVENTARIO
function paginaSaludInventario() {
  const slug = 'salud-inventario';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Salud de inventario', 'Subtítulo de corte mensual'));
  vs.push(segmentador(slug, 'linea', T.PROD, 'grupo_nombre', [xCol(1), BANDA[0], wCol(2), 64], { titulo: 'Línea' }));
  vs.push(segmentador(slug, 'buscar', T.PROD, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { busqueda: true, titulo: 'Buscar producto' }));
  vs.push(kpi(slug, 'muerto', [xCol(3), BANDA[0], wCol(7), 112], 'Inventario muerto y quiebres · foto al corte', [
    [INV, 'Valor de inventario', 'Inventario'], [AP, 'Valor de inventario ocioso', 'Ocioso'], [AP, '% Inventario ocioso', '% ocioso'], [AP, 'Valor sin rotación comercial', 'Sin rotación'], [AP, 'Productos en quiebre', 'En quiebre'], [AP, 'Venta anual en riesgo por quiebre', 'Venta en riesgo'],
  ], 'Ocioso = con existencia y sin venta en 12 meses · quiebre = vende y no tiene stock'));
  vs.push(kpi(slug, 'rotacion', [xCol(10), BANDA[0], wCol(3), 112], 'Existencias', [[INV, 'Unidades en existencia', 'Unidades'], [INV, 'Productos con existencia', 'Productos con stock'], [AP, 'Cobertura promedio en días', 'Cobertura (días)']], 'Cobertura = días que alcanza el stock al ritmo de venta'));
  // Fila 1: inventario por estado · venta e inventario por clase ABC · productos por estado
  vs.push(barrasH(slug, 'por-estado', [xCol(1), FILA[0], wCol(4), ALTO], 'Inventario por estado del producto', [AP, 'estado_producto'], [[AP, 'Inventario analizado', C.PIZARRA]], { subtitulo: 'Valor al costo · un valor negativo es stock negativo en el ERP (vendido sin existencia registrada)' }));
  vs.push(barrasH(slug, 'abc', [xCol(5), FILA[0], wCol(4), ALTO], 'Venta 12 meses e inventario por clase ABC', [AP, 'clase_abc_producto_nombre'], [[AP, 'Venta 12 meses analizada', C.PIZARRA], [AP, 'Inventario analizado', C.ACENTO]], { apilado: false, ordenPorColumna: true, subtitulo: 'Azul: venta · ámbar: inventario · ¿el stock está donde se vende?' }));
  vs.push(dona(slug, 'productos-estado', [xCol(9), FILA[0], wCol(4), ALTO], AP, 'estado_producto', 'Productos por estado', 'Productos analizados', AP));
  // Fila 2: quiebres · ociosos
  vs.push(matriz(slug, 'quiebres', [xCol(1), FILA[1], wCol(7), ALTO], 'Productos en quiebre · qué se deja de vender', {
    filas: [[T.PROD, 'Producto']], valores: [[AP, 'Venta anual en riesgo por quiebre'], [AP, 'Unidades 12 meses (quiebre)'], [AP, 'Margen 12 meses (quiebre)'], [AP, 'Días sin venta (quiebre)']],
    filaTotal: true, columnaTotal: false, ordenPor: [AP, 'Venta anual en riesgo por quiebre'], anchoFilas: 260,
  }));
  vs.push(matriz(slug, 'ociosos', [xCol(8), FILA[1], wCol(5), ALTO], 'Inventario ocioso · qué está parado', {
    filas: [[T.PROD, 'Producto']], valores: [[AP, 'Valor de inventario ocioso'], [AP, 'Unidades ociosas'], [AP, 'Días sin venta (ocioso)']],
    filaTotal: true, columnaTotal: false, ordenPor: [AP, 'Valor de inventario ocioso'], anchoFilas: 200,
  }));
  // Fila 3: por línea
  vs.push(barrasH(slug, 'linea-valor', [xCol(1), FILA[2], wCol(5), ALTO], 'Inventario por línea · total y ocioso', [T.PROD, 'grupo_nombre'], [[INV, 'Valor de inventario', C.PIZARRA], [AP, 'Valor de inventario ocioso', C.ROJO]], { apilado: false }));
  vs.push(matriz(slug, 'linea-ficha', [xCol(6), FILA[2], wCol(7), ALTO], 'Rotación y cobertura por línea', {
    filas: [[T.PROD, 'Línea']], valores: [[INV, 'Valor de inventario'], [INV, 'Unidades en existencia'], [AP, 'Venta 12 meses analizada'], [AP, 'Cobertura promedio en días'], [AP, 'Productos en quiebre'], [AP, 'Productos ociosos']],
    filaTotal: true, columnaTotal: false, ordenPor: [INV, 'Valor de inventario'], anchoFilas: 160,
  }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Salud', visuales: vs };
}

// ============================================================ 23 · COMPRAS Y PROVEEDORES
function paginaCompras() {
  const slug = 'compras';
  P.reiniciar();
  const vs = [];
  vs.push(...encabezado(slug, 'Título de Compras', 'Subtítulo de corte anual'));
  vs.push(segmentador(slug, 'anio', T.CAL, 'anio_selector', [xCol(1), BANDA[0], wCol(2), 64], { seleccion: 'Año actual', sync: 'anio', titulo: 'Año', busqueda: false, descendente: true }));
  vs.push(segmentador(slug, 'proveedor', PROV, 'nombre', [xCol(1), BANDA[1], wCol(2), 64], { busqueda: true, titulo: 'Proveedor' }));
  vs.push(kpi(slug, 'compras', [xCol(3), BANDA[0], wCol(7), 112], 'Compras del período', [
    [COMP, 'Compras netas', 'Compras netas'], [COMP, 'Documentos de compra', 'Facturas'], [COMP, 'Proveedores con compra', 'Proveedores'], [COMP, 'Compra promedio por documento', 'Compra promedio'], [COMP, '% Compra en top 10 proveedores', 'Top 10 proveedores'], [COMP, '% Compra en el mayor proveedor', 'Mayor proveedor'],
  ], 'Moneda de presentación · sin IVA · concentración = dependencia de pocos proveedores'));
  vs.push(kpi(slug, 'cxp', [xCol(10), BANDA[0], wCol(3), 112], 'Por pagar y pagos', [[CXP, 'Por pagar hoy', 'Por pagar hoy'], [CXP, '% Por pagar vencido', '% vencido'], [PAGE, 'Pagos a proveedores', 'Pagos del período']], 'Saldo = foto de hoy · pagos = período filtrado'));
  // Fila 1-2: compras y pagos por mes · pareto de proveedores (2 filas)
  vs.push(columnas(slug, 'por-mes', [xCol(1), FILA[0], wCol(7), ALTO], 'Compras y pagos por mes', 'Columnas: compras netas (azul) y pagos a proveedores (verde)', [T.CAL, 'mes_nombre_corto'], [[COMP, 'Compras netas', C.PIZARRA], [PAGE, 'Pagos a proveedores', C.VERDE]]));
  vs.push(pareto(slug, 'pareto', [xCol(8), FILA[0], wCol(5), ALTO * 2 + 16], 'Pareto de proveedores', 'Barras: compras netas · línea: % acumulado · referencia 80 %', [PROV, 'nombre'], [COMP, 'Compras netas'], [COMP, '% acumulado de compra proveedores']));
  vs.push(matriz(slug, 'ficha', [xCol(1), FILA[1], wCol(7), ALTO], 'Ficha de proveedores', {
    filas: [[PROV, 'Proveedor']],
    valores: [[COMP, 'Ranking de proveedor por compra'], [COMP, 'Compras netas'], [COMP, 'Participación del proveedor'], [COMP, 'Documentos de compra'], [COMP, 'Compra promedio por documento'], [CXP, 'Saldo por pagar']],
    filaTotal: true, columnaTotal: false, ordenPor: [COMP, 'Compras netas'], anchoFilas: 220,
  }));
  // Fila 3: por línea · por producto · pagos por proveedor
  vs.push(barrasH(slug, 'por-linea', [xCol(1), FILA[2], wCol(4), ALTO], 'Compras por línea', [T.PROD, 'grupo_nombre'], [[COMP, 'Compras netas', C.PIZARRA]]));
  vs.push(ranking(slug, 'por-producto', [xCol(5), FILA[2], wCol(5), ALTO], T.PROD, 'nombre', 'Compras por producto · top', 'producto', 'Compras netas', undefined, COMP, { margen: 40 }));
  vs.push(barrasH(slug, 'pagos-proveedor', [xCol(10), FILA[2], wCol(3), ALTO], 'Pagos por proveedor', [PROV, 'nombre'], [[PAGE, 'Pagos a proveedores', C.VERDE]], { margen: 40 }));
  vs.push(pie(slug));
  return { id: id('pagina', slug), nombre: 'Compras', visuales: vs };
}

// ============================================================ escritura y orden
const paginas = [paginaVendedores(), paginaPulso(), paginaSaludInventario(), paginaCompras()];
P.escribirPaginas(REPORT, paginas);

// Orden: Vendedores y Pulso tras «Seguimiento» (familia Ventas); Salud tras «Reposición» (Inventario);
// Compras tras «Por pagar» (Finanzas). Las páginas que no están en este mapa conservan su posición.
function ordenarPaginas() {
  const pagesPath = path.join(REPORT, 'definition', 'pages', 'pages.json');
  const pj = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
  const nombre = (pid) => JSON.parse(fs.readFileSync(path.join(REPORT, 'definition', 'pages', pid, 'page.json'), 'utf8')).displayName;
  const mias = Object.fromEntries(paginas.map((p) => [p.nombre, p.id]));
  const orden = pj.pageOrder.filter((pid) => !paginas.some((p) => p.id === pid));
  const insertarTras = (nombreAncla, ...ids) => {
    const i = orden.findIndex((pid) => nombre(pid) === nombreAncla);
    orden.splice(i < 0 ? orden.length : i + 1, 0, ...ids);
  };
  insertarTras('Seguimiento', mias['Vendedores'], mias['Pulso']);
  insertarTras('Reposición', mias['Salud']);
  insertarTras('Por pagar', mias['Compras']);
  pj.pageOrder = orden;
  fs.writeFileSync(pagesPath, JSON.stringify(pj, null, 2) + '\n');
  console.log('Orden:', orden.map(nombre).join(' · '));
}
ordenarPaginas();
