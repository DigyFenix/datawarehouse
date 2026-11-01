// Regenera TODAS las hojas del reporte PBIR en el orden correcto y valida el resultado.
//
// Uso:  node consumo/powerbi/regenerar_paginas.js <ruta al .Report> [--sin-validar]
//
// Por qué existe (auditoría 2026-10-31 §6): las hojas salían de seis generadores que había que correr a
// mano y en orden (gestión y análisis reordenan las pestañas, así que van al final); un paso olvidado
// dejaba páginas viejas y nadie corría el validador. Aquí:
//   1. exporta la paleta de pbir.js a paleta.json (la lee el validador);
//   2. corre los 6 generadores en orden: ventas → clientes → inventario → cartera → gestión → análisis;
//   3. registra el conteo de visuales por página en conteo_visuales.json (el validador acusa si
//      Desktop borra visuales: ya pasó dos veces);
//   4. corre validar_reporte.py sobre la carpeta del proyecto y devuelve su código de salida.
//
// NO toca el modelo semántico (eso es generar_pbip.py) y no abre Power BI Desktop.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AQUI = __dirname;
const GENERADORES = ['ventas', 'clientes', 'inventario', 'cartera', 'gestion', 'analisis'];

const reporte = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(reporte, 'definition', 'pages'))) {
  console.error('FALLO · indicá la ruta al .Report en formato PBIR (definition/pages)');
  process.exit(1);
}

const correr = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: path.resolve(AQUI, '..', '..') });

require('./pbir').exportarPaleta();
for (const g of GENERADORES) {
  console.log(`— generar_paginas_${g}.js`);
  correr(process.execPath, [path.join(AQUI, `generar_paginas_${g}.js`), reporte]);
}

// Conteo de visuales por página (nombre visible → n). Lo compara el validador en cada corrida.
const pagesDir = path.join(reporte, 'definition', 'pages');
const conteo = {};
for (const pid of JSON.parse(fs.readFileSync(path.join(pagesDir, 'pages.json'), 'utf8')).pageOrder) {
  const nombre = JSON.parse(fs.readFileSync(path.join(pagesDir, pid, 'page.json'), 'utf8')).displayName;
  const vis = path.join(pagesDir, pid, 'visuals');
  conteo[nombre] = fs.existsSync(vis) ? fs.readdirSync(vis).length : 0;
}
const rutaConteo = path.join(AQUI, 'conteo_visuales.json');
const previo = fs.existsSync(rutaConteo) ? JSON.parse(fs.readFileSync(rutaConteo, 'utf8')) : {};
previo[path.basename(reporte, '.Report')] = conteo;
fs.writeFileSync(rutaConteo, JSON.stringify(previo, null, 2) + '\n');
const total = Object.values(conteo).reduce((a, n) => a + n, 0);
console.log(`OK · ${Object.keys(conteo).length} páginas · ${total} visuales registrados en conteo_visuales.json`);

if (!process.argv.includes('--sin-validar')) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  try {
    correr(python, [path.join(AQUI, 'validar_reporte.py'), path.dirname(reporte)]);
  } catch (e) {
    process.exit(e.status || 1);
  }
}
