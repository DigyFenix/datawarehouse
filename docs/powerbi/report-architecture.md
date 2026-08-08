# Arquitectura del reporte — Grupo Cresta v1.0

**Fase F3 del contrato** (§6 F3). **Entrada:** `docs/powerbi/analytics-opportunity-matrix.md`.
**Contratos de §5:** `docs/powerbi/contracts/sistema-visual.md` y `naming-conventions.md`.

**12 páginas · 11 P0 cubiertos al 100% · presupuesto de páginas consumido por completo.**

Toda coordenada usa la grilla del contrato visual (12 columnas de 88 px, gutter 16, margen 24;
`x = 24 + (n−1)×104`, ancho `= 104n − 16`). Canvas 1280 × 720.

---

## 0. La tesis del reporte

No es un reporte de "qué pasó". Cada página responde **una pregunta que hoy nadie puede
responder con el ERP**, y termina en una lista de nombres: qué producto reponer, a qué cliente
llamar, qué precio revisar, qué factura cobrar esta semana.

Tres decisiones que ordenan todo:

1. **Nada de páginas de resumen sin pregunta.** La página 01 no es "un dashboard bonito": es la
   lista de las cinco cifras que obligan a actuar esta semana, cada una con navegación a su
   página de detalle.
2. **Foto y flujo nunca se mezclan bajo el mismo segmentador** sin decirlo. Las páginas de saldo
   (cartera, inventario, caja) llevan la salvedad en el subtítulo y usan las medidas `hoy`
   cuando la cifra debe ignorar el período.
3. **Capital inmovilizado y riesgo de faltante viven en páginas distintas** (§6 F3). Son
   problemas opuestos: mezclarlos produce la narrativa incoherente de "tenemos demasiado
   inventario y nos falta inventario" en el mismo visual.

### Estructura

| # | Página | Pregunta que responde | Oportunidades |
|---|---|---|---|
| 00 | Inicio | ¿Por dónde entro y hasta cuándo llega el dato? | O-29 |
| 01 | Dirección | ¿Qué exige mi atención esta semana? | O-06, O-18, O-20 |
| 02 | Ventas · ritmo y drivers | ¿Vamos a llegar, y de dónde viene el cambio? | O-06, O-18, O-12, O-22 |
| 03 | Rentabilidad · fugas de margen | ¿Dónde estoy regalando margen? | **O-02** |
| 04 | Clientes | ¿De quién dependo y a quién estoy perdiendo? | O-13, **O-08**, O-24 |
| 05 | Productos · quiebre | ¿Qué venta estoy perdiendo por no tener producto? | **O-01**, O-23 |
| 06 | Inventario · capital | ¿Cuánto capital tengo dormido en bodega? | O-16, O-26 |
| 07 | Pedidos · cumplimiento | ¿Qué prometí y no he entregado? | **O-09**, O-28 |
| 08 | Compras y proveedores | ¿Cuánto subió lo que compro y de quién dependo? | **O-10**, O-14 |
| 09 | Cartera y cobranza | ¿Quién me debe, desde cuándo, y qué cobro esta semana? | **O-03**, **O-07**, O-15, O-17, O-25 |
| 10 | Capital de trabajo y caja | ¿Cuándo se me acaba el dinero? | **O-04**, **O-05**, O-19 |
| 11 | Finanzas · P&L | ¿Gano dinero según contabilidad? | **O-11**, O-30, O-31 |

Los 11 P0 quedan cubiertos: O-01 (05) · O-02 (03) · O-03 (09) · O-04 (10) · O-05 (10) ·
O-06 (01, 02) · O-07 (09) · O-08 (04) · O-09 (07) · O-10 (08) · O-11 (11).

---

## 1. Chrome común a todas las páginas

Idéntico en las 12, construido una vez y replicado. **No cuenta como visual de análisis.**

| Elemento | Tipo | Posición (x, y, w, h) | Nota |
|---|---|---|---|
| Banda de encabezado | rectángulo `#0043af` | 0, 0, 1280, 72 | color de marca, sangra el canvas |
| Título de página | tarjeta de medida `_Narrativa` | 24, 16, 608, 40 | texto blanco; incluye el período activo |
| Navegación | navegador de páginas | 648, 20, 504, 32 | horizontal, tinta blanca sobre azul |
| Segmentador de período | segmentador `DM_Calendario` | 24, 88, 296, 40 | **sincronizado en las 12 páginas** |
| Segmentador de empresa | segmentador `DM_Empresa.nombre` | 336, 88, 296, 40 | sincronizado; por defecto todas |
| Moneda de análisis | segmentador `MD_Moneda de análisis` | 1064, 88, 192, 40 | sincronizado |
| Pie de frescura | tarjeta `_Narrativa` | 24, 700, 1256, 20 | "Dato del ERP al …· extraído hace … días" |

**Los tres segmentadores ocupan la banda de KPI en `y = 88`**, así que en las páginas con KPIs
estos bajan a `y = 144` con alto 88. Se indica en cada contrato.

---

## 2. Contratos de página

### 00 · Inicio

- **Audiencia:** todos. Es la puerta de entrada del portal de usuario.
- **Pregunta principal:** ¿por dónde empiezo y puedo confiar en lo que voy a ver?
- **Preguntas secundarias:** ¿hasta cuándo llega el dato de cada dominio? · ¿qué me está
  esperando con urgencia?
- **KPIs:** `Último dato del ERP` · `Días desde última extracción` · `Dominios desactualizados`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1 | ¿Adónde voy? | 6 botones de navegación | acción: página | 24, 216, 1256, 232 (grid 3×2 de 400×112) |
| 2 | ¿Hasta cuándo llega cada dominio? | tabla | `FC_Estado de carga`: dominio, `Último dato del ERP`, `Días desde última extracción` | 24, 464, 608, 232 |
| 3 | ¿Qué exige atención ya? | tarjetas de alerta (3) | `Venta anual en riesgo por quiebre` · `Vencido terceros hoy` · `Backlog vencido` | 648, 464, 632, 232 |

- **Interacciones:** botones → página destino. Sin drill-through.
- **Filtros de página:** ninguno (la frescura es global).
- **Oportunidades:** O-29.

### 01 · Dirección

- **Audiencia:** dirección general y gerencias.
- **Pregunta principal:** ¿qué exige mi atención esta semana y cuánto dinero hay en juego?
- **Preguntas secundarias:** ¿vamos a llegar al mes? · ¿cómo va el ejercicio contra el año
  pasado? · ¿qué sociedad aporta y cuál consume?
- **KPIs:** `Proyección de cierre de mes` · `Variación acumulada vs año anterior` ·
  `Posición neta hoy` · `Ciclo de conversión de efectivo`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Las cuatro cifras que mandan | 4 tarjetas con comparativo | KPIs de arriba | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Vamos a llegar al mes? | columnas + línea de proyección | `Venta por día hábil` por día, `Proyección de cierre de mes` | 24, 248, 608, 216 |
| 6 | ¿Cómo va el ejercicio? | línea, 2 series | `Ventas acumuladas año` vs `Ventas acumuladas año anterior` por mes | 648, 248, 632, 216 |
| 7 | ¿Qué exige acción, y cuánto vale? | tabla de alertas con navegación | 5 filas: quiebre, bajo costo, vencido, backlog vencido, caja negativa — cada una con su medida y botón | 24, 480, 816, 216 |
| 8 | ¿Qué sociedad aporta? | barras horizontales ordenadas | `Ventas a terceros` por `DM_Empresa` | 856, 480, 424, 216 |

- **Interacciones:** la tabla de alertas navega a la página del tema. Sin filtros cruzados desde
  las tarjetas (son lectura, no control).
- **Filtros de página:** `es_intercompania = 0` implícito por el uso de medidas `terceros`.
- **Oportunidades:** O-06, O-18, O-20. **GAP-03** para los cinco títulos.

### 02 · Ventas · ritmo y drivers

- **Audiencia:** dirección comercial.
- **Pregunta principal:** ¿vamos a llegar, y el cambio contra el año pasado viene de precio, de
  volumen o de mezcla?
- **Preguntas secundarias:** ¿cuál es el ritmo real por día hábil? · ¿hubo días sin venta? ·
  ¿qué mes se despega de su estacionalidad?
- **KPIs:** `Ventas netas` · `Variación vs año anterior` · `Venta por día hábil` ·
  `Proyección de cierre de mes`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Cifras del período | 4 tarjetas | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿De dónde viene la variación? | **waterfall** | `Efecto precio`, `Efecto volumen`, `Efecto mezcla` — suman exacto la variación | 24, 248, 608, 216 |
| 6 | ¿Cuál es la tendencia real? | línea + media móvil | `Venta diaria neta`, `Venta media móvil 30d` | 648, 248, 632, 216 |
| 7 | ¿Qué meses se despegan? | columnas + línea de referencia | `Ventas netas` por mes, `Índice de estacionalidad` | 24, 480, 608, 216 |
| 8 | ¿Por dónde cortar la venta? | barras con field parameter | `MD_Vista de ventas` × `Ventas a terceros` | 648, 480, 632, 216 |

- **Interacciones:** field parameter en el visual 8 (evita 4 visuales gemelos). Drill-through a
  `11 · Detalle` desde cualquier barra.
- **Oportunidades:** O-06, O-12, O-18, O-22.

### 03 · Rentabilidad · fugas de margen

- **Audiencia:** dirección comercial y finanzas.
- **Pregunta principal:** ¿dónde estoy regalando margen sin que nadie lo haya autorizado?
- **Preguntas secundarias:** ¿qué clientes concentran la venta bajo costo? · ¿qué productos? ·
  ¿el descuento otorgado sube sin que suba el volumen?
- **KPIs:** `Ventas bajo costo` · `Margen perdido bajo costo` · `% Ventas bajo costo` ·
  `% Margen terceros`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | El tamaño de la fuga | 4 tarjetas, la 2ª en estado crítico | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Qué clientes? | barras horizontales ordenadas | `Margen perdido bajo costo` por `DM_Cliente` (top 15) | 24, 248, 608, 216 |
| 6 | ¿Qué productos? | barras horizontales ordenadas | `Margen perdido bajo costo` por `DM_Producto` (top 15) | 648, 248, 632, 216 |
| 7 | ¿Se está erosionando el precio? | línea, 2 ejes separados en dos visuales apilados | `% Descuento` y `Unidades vendidas` por mes | 24, 480, 608, 216 |
| 8 | Las líneas concretas | tabla de detalle | documento, fecha, cliente, producto, cantidad, precio, costo, margen | 648, 480, 632, 216 |

- **Interacciones:** clic en cliente o producto filtra la tabla 8. Drill-through a detalle de
  documento.
- **Salvedad obligatoria en el subtítulo:** *"Costo registrado en la línea al facturar. En Odoo
  esta página sale en cero: la línea no trae costo"* (`LIM-06`).
- **Oportunidades:** **O-02**.

### 04 · Clientes

- **Audiencia:** dirección comercial y cobranza.
- **Pregunta principal:** ¿de qué clientes dependo, y a cuáles valiosos estoy perdiendo?
- **Preguntas secundarias:** ¿la cartera se renueva o envejece? · ¿los que más venden son los que
  más dejan? · ¿cuánta venta está en manos de clientes en riesgo?
- **KPIs:** `% Venta en top 10 clientes` · `Clientes en riesgo valiosos` · `Venta 12m en riesgo` ·
  `% Clientes activos`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Concentración y riesgo | 4 tarjetas | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Cuánta venta concentran los mayores? | **Pareto** (barras + curva acumulada) | `Ventas a terceros` y `% acumulado de venta clientes` por cliente | 24, 248, 608, 216 |
| 6 | ¿Cómo está segmentada la cartera? | matriz de calor | `DM_Clasificación RFM.segmento` × conteo y monto | 648, 248, 632, 216 |
| 7 | ¿A quién llamo primero? | tabla ordenada por monto | clientes en riesgo valiosos: nombre, última compra, venta 12m, saldo, perfil de pago | 24, 480, 816, 216 |
| 8 | ¿Se renueva la cartera? | línea, 2 series | `Clientes nuevos` y `Clientes perdidos` por mes | 856, 480, 424, 216 |

- **Interacciones:** clic en segmento RFM filtra la tabla 7. Drill-through a ficha de cliente.
- **Nota de lectura:** el RFM es una **foto** (mide recencia contra la última venta): no se
  compara entre años.
- **Oportunidades:** O-13, **O-08**, O-24.

### 05 · Productos · quiebre

- **Audiencia:** compras y operaciones.
- **Pregunta principal:** ¿qué venta estoy perdiendo ahora mismo por no tener producto?
- **Preguntas secundarias:** ¿qué artículos hacen el 80% de la venta? · ¿cuántos días de
  cobertura me quedan de los importantes?
- **KPIs:** `Productos en quiebre` · `Venta anual en riesgo por quiebre` ·
  `Cobertura promedio en días` · `% Venta en productos A`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | El tamaño del problema | 4 tarjetas, la 2ª crítica | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Qué repongo primero? | tabla ordenada por venta en riesgo | producto, clase ABC, venta 12m, última venta, existencia, cobertura | 24, 248, 816, 216 |
| 6 | ¿Dónde está la venta? | **Pareto** de productos | `Ventas netas` y `% acumulado de venta productos` | 856, 248, 424, 216 |
| 7 | ¿Cobertura contra importancia? | dispersión (3 series máx.: clase A/B/C) | eje x `dias_cobertura`, eje y `venta_12m`, color = clase ABC | 24, 480, 608, 216 |
| 8 | ¿Cómo se reparte el catálogo? | barras apiladas | conteo de productos por `estado_producto` | 648, 480, 632, 216 |

- **Regla aplicada:** esta página trata **solo** el riesgo de faltante. El capital inmovilizado
  es la página 06 y no se menciona aquí.
- **Oportunidades:** **O-01**, O-23.

### 06 · Inventario · capital

- **Audiencia:** finanzas y compras.
- **Pregunta principal:** ¿cuánto capital tengo dormido en bodega y cuánto de eso es accionable?
- **Preguntas secundarias:** ¿el inventario creció contra el mes pasado? · ¿cuánto capital hay
  por quetzal de venta? · ¿qué bodega concentra el valor?
- **KPIs:** `Valor de inventario` · `Valor de inventario ocioso` · `Rotación de inventario 12M` ·
  `Inventario sobre ventas`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Capital y rotación | 4 tarjetas | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Creció el inventario? | línea | `Valor de inventario` por mes + **GAP-07** variación | 24, 248, 608, 216 |
| 6 | ¿Qué está ocioso y es accionable? | tabla ordenada por valor | producto, valor, días sin venta, última venta | 648, 248, 632, 216 |
| 7 | ¿Dónde está el valor? | barras horizontales | `Valor de inventario` por `DM_Bodega` | 24, 480, 608, 216 |
| 8 | ¿Ocioso o sin rotación comercial? | dos tarjetas grandes con nota | `Valor de inventario ocioso` vs `Valor sin rotación comercial` | 648, 480, 632, 216 |

- **Salvedad obligatoria (visual 8):** *ocioso ≠ sin rotación comercial*. Lo segundo son insumos
  de producción que se consumen sin pasar por factura — en Cresta, Q92.6M que **no** son alarma.
  Sin esta distinción el 95% del inventario aparecería en rojo.
- **Oportunidades:** O-16, O-26 (**GAP-07**).

### 07 · Pedidos · cumplimiento

- **Audiencia:** operaciones y comercial.
- **Pregunta principal:** ¿qué prometí y no he entregado, y cuánto ya está incumplido?
- **Preguntas secundarias:** ¿la demanda captada se convierte en venta? · ¿se está estirando la
  promesa de entrega? · ¿qué vendedor capta y no convierte?
- **KPIs:** `Backlog` · `Backlog vencido` · `Fill rate` · `Lead time prometido`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Compromiso y cumplimiento | 4 tarjetas, la 2ª crítica | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿A quién le estoy quedando mal? | barras horizontales ordenadas | `Backlog vencido` por `DM_Cliente` | 24, 248, 608, 216 |
| 6 | ¿Qué debo entregar y cuándo? | tabla por semana de entrega | **GAP-01** eje de entrega comprometida | 648, 248, 632, 216 |
| 7 | ¿Se represa la demanda? | línea, 2 series | `Monto pedido` y `Ventas netas` por mes | 24, 480, 608, 216 |
| 8 | ¿Quién capta y quién convierte? | dispersión | eje x `Monto pedido`, eje y `Ventas netas` por vendedor | 648, 480, 632, 216 |

- **Nota honesta (visual 8):** la cobranza **no** es atribuible al vendedor en este modelo
  (`DM_Vendedor` no cuelga de cartera). No se presenta como si lo fuera.
- **Oportunidades:** **O-09**, O-28.

### 08 · Compras y proveedores

- **Audiencia:** compras y finanzas.
- **Pregunta principal:** ¿cuánto subió lo que compro, y de qué proveedores dependo para operar?
- **Preguntas secundarias:** ¿cuánto costó de más el volumen de hoy a precios de hoy? · ¿qué
  parte del abastecimiento es interna? · ¿qué proveedor concentra el riesgo?
- **KPIs:** `% Variación de precio de compra` · `Sobrecosto por precio de compra` ·
  `% Compra en el mayor proveedor` · `Compras a terceros`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Inflación y dependencia | 4 tarjetas | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Qué insumo subió más? | barras horizontales ordenadas | `Sobrecosto por precio de compra` por `DM_Producto` | 24, 248, 608, 216 |
| 6 | ¿De quién dependo? | **Pareto** de proveedores | `Compras a terceros` y `% acumulado de compra proveedores` | 648, 248, 632, 216 |
| 7 | ¿Se acelera el abastecimiento? | línea + media móvil | `Compras netas`, `Media móvil 3 meses compras` | 24, 480, 608, 216 |
| 8 | ¿Cómo evolucionó el precio de un insumo? | línea (exige 1 producto filtrado) | `Precio promedio de compra` vs `Precio de compra año anterior` | 648, 480, 632, 216 |

- **Salvedad (visual 8):** el precio promedio **solo significa algo con un producto filtrado**;
  mezclado entre artículos distintos no dice nada. El subtítulo lo declara y el visual muestra
  un mensaje cuando hay más de un producto en contexto.
- **Oportunidades:** **O-10**, O-14.

### 09 · Cartera y cobranza

- **Audiencia:** cobranza, finanzas, dirección.
- **Pregunta principal:** ¿quién me debe, desde cuándo, y qué tengo que cobrar esta semana?
- **Preguntas secundarias:** ¿cuánto está vencido de terceros? · ¿qué clientes tienen mal perfil
  de pago? · ¿la cobranza mejora o se deteriora?
- **KPIs:** `Por cobrar terceros hoy` · `Vencido terceros hoy` · `% Vencido terceros hoy` ·
  `Días de cartera terceros`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | La foto de hoy | 4 tarjetas, la 2ª crítica | KPIs (medidas `hoy`: ignoran el período) | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Desde cuándo me deben? | barras apiladas por tramo | `DM_Antigüedad` × `Saldo por cobrar terceros` | 24, 248, 504, 216 |
| 6 | **¿Qué cobro esta semana?** | tabla por semana de vencimiento | **GAP-01**: cliente, documento, vence, saldo | 544, 248, 736, 216 |
| 7 | ¿A quién no le despacho? | tabla de riesgo | `Clientes en vencido crítico`: cliente, saldo, vencido, días vencido, perfil | 24, 480, 608, 216 |
| 8 | ¿Mejora la cobranza? | línea | `% Vencido histórico` por corte | 648, 480, 632, 216 |

- **Salvedades:** las tarjetas usan medidas `hoy` **a propósito** — el saldo es una foto y
  recortarlo al período ocultaría las facturas viejas abiertas. El visual 8 **requiere historia
  acumulada** (`LIM-07`): al arrancar tendrá pocos cortes y el subtítulo lo dice.
- **Oportunidades:** **O-03**, **O-07**, O-15, O-17, O-25.

### 10 · Capital de trabajo y caja

- **Audiencia:** dirección y finanzas.
- **Pregunta principal:** ¿en qué semana se me pone negativa la caja si todo se cumple como está
  pactado?
- **Preguntas secundarias:** ¿cuántos días tengo el dinero atrapado y qué pata lo empeora? ·
  ¿cuál es mi posición neta? · ¿cuánto es exigible ahora mismo?
- **KPIs:** `Ciclo de conversión de efectivo` · `Posición neta hoy` ·
  `Flujo neto próximas 4 semanas` · `Entradas vencidas (exigible)`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | Liquidez estructural | 4 tarjetas | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | **¿Cuándo se pone negativa la caja?** | línea acumulada con cruce por cero marcado | `Posición proyectada acumulada` por semana | 24, 248, 816, 216 |
| 6 | ¿Qué pata empeora el ciclo? | **waterfall** de 3 patas | `Días de cartera terceros` + `Días de inventario` − `Días de pago terceros` | 856, 248, 424, 216 |
| 7 | ¿Qué entra y qué sale por semana? | columnas agrupadas | `Entradas proyectadas` y `Salidas proyectadas` por semana | 24, 480, 608, 216 |
| 8 | ¿A quién le debo y desde cuándo? | barras apiladas por tramo | `DM_Antigüedad` × `Saldo por pagar terceros` | 648, 480, 632, 216 |

- **Salvedad obligatoria:** *"Proyección contractual: supone que cada partida se paga en su
  vencimiento. No es un pronóstico, y no incluye saldos bancarios"* (`LIM-05`).
- **Limitación declarada:** la proyección no dice **quién** compone cada semana (`LIM-03`); el
  detalle se alcanza navegando a la página 09.
- **Oportunidades:** **O-04**, **O-05**, O-19.

### 11 · Finanzas · P&L

- **Audiencia:** dirección, finanzas, contabilidad.
- **Pregunta principal:** ¿gano dinero según contabilidad, y la estructura crece más rápido que
  el ingreso?
- **Preguntas secundarias:** ¿qué centro de costo consume la estructura? · ¿qué rubro pesa más? ·
  ¿lo contable cuadra con lo facturado?
- **KPIs:** `Resultado acumulado año` · `% Margen operativo` · `% Gasto sobre ingreso` ·
  `Variación de gasto vs año anterior`
- **Visuales:**

| # | Pregunta que responde | Tipo | Campos | Posición |
|---|---|---|---|---|
| 1-4 | El resultado y su estructura | 4 tarjetas | KPIs | 24 / 336 / 648 / 960, 144, 296, 88 |
| 5 | ¿Cómo se forma el resultado? | **waterfall** (GAP-05) | ingresos → costo → gasto → resultado | 24, 248, 608, 216 |
| 6 | ¿La estructura crece más rápido? | línea, 2 series indexadas a base 100 | `Ingresos contables` y `Gasto operativo` por mes | 648, 248, 632, 216 |
| 7 | ¿Qué consume la estructura? | matriz jerárquica | `DM_Cuenta contable` (jerarquía de 5 niveles) × `Gasto operativo` | 24, 480, 608, 216 |
| 8 | ¿Por centro de costo? | barras horizontales + control de brecha | `Gasto operativo` por `DM_Centro de costo`; tarjeta `% Brecha contable` | 648, 480, 632, 216 |

- **Salvedad:** solo cuentas de **resultado**. No hay balance general (`LIM-02`) y la página no
  insinúa que lo haya.
- **Control, no KPI:** `% Brecha contable` debería rondar cero; cuando se despega hay que buscar
  anticipos, ajustes o cuentas mal clasificadas.
- **Oportunidades:** **O-11**, O-30, O-31.

---

## 3. Interacción transversal

| Mecanismo | Regla |
|---|---|
| Segmentadores | Período, empresa y moneda **sincronizados** en las 12 páginas. Ningún otro segmentador se sincroniza |
| Field parameters | Se usan los **6 existentes** antes de crear visuales gemelos (§3.1 punto 4) |
| Drill-through | Un único destino de detalle de documento, alcanzable desde ventas, compras, cartera y pedidos |
| Tooltips | Página de tooltip por dominio, con las 3 medidas de contexto que no caben en el visual |
| Filtros cruzados | Las tarjetas de KPI **no** filtran: son lectura. Barras y Pareto sí filtran las tablas de su página |
| Marcadores | Solo donde alternan dos vistas del mismo espacio (`bm_<pagina>_<estado>`) |

---

## 4. Olas de construcción (F5)

Tres olas de 3 páginas y una final de 3, con QA (F6) y checkpoint humano al cerrar cada una.

| Ola | Páginas | Por qué en este orden |
|---|---|---|
| **1** | 00 Inicio · 01 Dirección · 09 Cartera y cobranza | Es la demo completa: entrada, la lectura de dirección y el dolor más universal de una PyME. Si esta ola convence, el producto se vende |
| **2** | 03 Rentabilidad · 05 Productos · 07 Pedidos | Las tres cifras grandes ya calculadas que hoy nadie ve: Q46.5M bajo costo, Q57.0M en riesgo, Q5.7M de backlog vencido |
| **3** | 02 Ventas · 04 Clientes · 08 Compras | El análisis comercial clásico, ya con el marco visual probado |
| **4** | 06 Inventario · 10 Capital y caja · 11 Finanzas | Cierran el ciclo financiero; dependen de GAP-05 y GAP-07 |

**GAP-01 debe estar implementado antes de la ola 1** (la página 09 lo usa en su visual 6) y
**GAP-03 también** (los títulos narrativos son transversales). Eso fija el primer lote de F4.

---

## Gate F3

| Criterio del contrato | Resultado |
|---|---|
| Contrato completo por página, con coordenadas en grilla | **PASA** — 12/12 |
| 100% de los P0 cubiertos | **PASA** — 11/11 |
| Contratos de §5 escritos en `docs/powerbi/contracts/` | **PASA** — `sistema-visual.md`, `naming-conventions.md` |
| Páginas ≤ 12 | **PASA** — 12 exactas |
| Regla de inventario (capital ≠ faltante en la misma narrativa) | **PASA** — páginas 05 y 06 separadas |
| Selección de visual justificada por patrón | **PASA** — waterfall para contribución, Pareto para concentración; ni un donut en las 12 páginas |

**Veredicto: F3 CERRADA.** Siguiente: F4 — lote 1 de DAX (GAP-01 y GAP-03), con validación
contra el origen (§7) antes de construir la ola 1.
