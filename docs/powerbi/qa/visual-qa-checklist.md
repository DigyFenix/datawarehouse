# QA visual — F6.3 · PulsoIron (23 hojas, tema «Quilate · Azul profundo»)

ESTADO: **PENDIENTE DE REVISIÓN EN DESKTOP** tras la sesión 38 (auditoría 2026-10-31 §6). Lo
automatizable ya lo verifica `validar_reporte.py` (ver «Qué ya no se revisa a ojo»); esta acta es
para lo que solo se juzga viendo el render: legibilidad, jerarquía y que los datos tengan sentido.

> Nunca se marca aprobada sin haber visto el render (captura solo de la ventana de Desktop, nunca
> pantalla completa). Antes de revisar: Desktop **cerrado** → `node consumo/powerbi/regenerar_paginas.js
> organizaciones/ironnetwork/powerbi/PulsoIron.Report` → abrir el PBIP → **Actualizar** (el modelo es
> import: sin refrescar, las columnas nuevas de Oro salen vacías).

## Qué ya no se revisa a ojo (lo hace el validador en cada corrida)

- Referencias: toda tabla/columna existe y cada medida se cita desde la tabla donde vive.
- Lienzo 1280×960; ningún visual invade el pie (y = 944).
- Ningún hex fuera de la paleta de `pbir.js` (`paleta.json`) o del tema; ningún texto en ámbar
  `#e0a526`, pizarra claro `#8fa9c4` o gris de serie (contraste < 3:1): el texto usa `#b9781a` / `#4a6fa5`.
- Tema fuente (`organizaciones/ironnetwork/powerbi/theme/`) = tema registrado (mismo hash).
- Ninguna página perdió visuales respecto de `conteo_visuales.json` (Desktop ya los borró dos veces).

## Checklist por hoja (se llena al revisar el render)

| # | Verificación | ☐ |
|---|---|---|
| 1 | Título = nombre de la hoja · período activo («Resumen ejecutivo · 2026») o «· foto de hoy» / «· últimos 12 meses» en hojas de saldo | ☐ |
| 2 | Subtítulo del encabezado: «al 16 oct · 79 % del año transcurrido» (o «… del mes transcurrido») | ☐ |
| 3 | El segmentador de Año abre en **Año actual** (y Seguimiento en **Mes actual**), no en un año quemado | ☐ |
| 4 | El pie no toca la fila 3 y se lee completo | ☐ |
| 5 | Ningún visual vacío ni «(En blanco)» inesperado — en especial Sector, Rango de vencimiento, Estado del cobro, Naturaleza contable y las matrices de frecuencia/abandono (ahora columnas de Oro) | ☐ |
| 6 | Etiquetas de series claras escritas en su variante oscura (barras «pedido», «inventario», pareto) | ☐ |
| 7 | Rankings de cliente y producto muestran tooltip con documentos / ticket / variación (cliente) o unidades / precio / variación (producto) | ☐ |
| 8 | Densidad: la hoja se lee en < 10 segundos sin zoom | ☐ |

## Verificaciones específicas

- **Resumen**: el KPI «Media móvil 3 meses» reemplaza al acumulado del año; el «Ritmo del mes»
  nombra los dos meses en su subtítulo (en enero: «diciembre <año> (año anterior)»); cada foco dice
  «Ver hoja … →» y la hoja existe; DSO/DPO usan el saldo de hoy (cuadran con «Por cobrar hoy»).
- **Pulso**: «Proyección de cierre de mes» con un mes elegido usa los días hábiles hasta el corte
  del dato (no hasta hoy).
- **Pedidos**: «Fill rate» en blanco cuando no hay pedidos en el período (antes 100 %).
- **Por cobrar / Cobros / Por pagar**: los rangos finos («Vence en 7» … «Vencido 91+») salen del
  catálogo `oro.dim_rango_vencimiento`; las partidas sin vencimiento caen en «Sin vencimiento».
- **Cartera 12 meses**: frecuencia y abandono por clase con los rangos de Oro.

## Defectos encontrados

_(vacío hasta revisar el render)_
