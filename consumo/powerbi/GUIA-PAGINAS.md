# Guía de contenido por página — PulsoCresta

Guía de referencia para construir los dashboards a mano en Power BI Desktop. El modelo
semántico es la fuente: **todo se arma arrastrando medidas ya definidas** (carpetas
`01 Importes … 07 Pareto` dentro de cada hecho), nunca columnas numéricas sueltas.

Convención de tablas: `DM_` dimensión · `FC_` hecho · `MD_` solo medidas (grupo de cálculo).

---

## 1 · Pulso (portada ejecutiva)

**Mensaje:** "así vamos, y la cartera real se lee separando al grupo."

- KPIs: `Ventas netas` + `Variación vs año anterior` · `Ventas acumuladas año` +
  `Variación acumulada vs año anterior` · `% Margen terceros` · `Por cobrar terceros hoy` +
  `% Vencido terceros hoy` · `Posición neta hoy`.
- **Visual estrella:** antigüedad con `Por cobrar terceros hoy` vs `Por cobrar grupo hoy` por
  `DM_Antigüedad[rango_aging_nombre]` (azul/naranja). Es el diferenciador del producto.
- Ritmo: `Venta diaria neta` + `Venta media móvil 30d` por fecha.
- **No incluir:** compras, inventario, conteos operativos, más de ~8 elementos. Nada de % y
  quetzales en el mismo eje.
- **Trampa:** con filtro de trimestre, para saldos usar SIEMPRE las medidas `...hoy` — las
  normales (`Saldo por cobrar terceros`) se recortan al período y ocultan la mora vieja.

## 2 · Ventas y rentabilidad

- `Ventas a terceros` / `Ventas al grupo` / `% Venta al grupo` · `% Margen terceros` (el de
  mercado, no el total) · `Ticket promedio` · `Precio promedio unidad` (potente en commodity)
  · `Devoluciones` y `% Descuento` (vigilancia).
- Tendencia: `Ventas netas` + `Media móvil 3 meses` por `anio_mes`.
- **Pareto:** `Ranking de cliente por venta` + `% acumulado de venta clientes` (y el par de
  productos). La curva 80/20 vende sola.
- **No:** cartera aquí; `% Margen` total como KPI principal (la intercompañía lo infla).
- **Trampa:** media móvil y comparativos necesitan historia — esta página no debería abrir
  filtrada a un solo trimestre (o dar a la tendencia su propio filtro de visual más amplio).

## 3 · Clientes (ABC + RFM + comportamiento de pago)

- ABC: `Clientes A/B/C` · `% Venta en clientes A` (concentración) · `Clientes perdidos`.
- RFM: `Clientes campeones` · `Clientes leales` · `Clientes en riesgo` ·
  `Clientes en riesgo valiosos` · `Clientes dormidos` · **`Venta 12m en riesgo`** — "esto se
  pierde si nadie llama": la cifra más vendedora del modelo.
- Riesgo de cobro: `Clientes en vencido crítico` · `Saldo en clientes críticos` (revisar antes
  de despachar).
- Tabla catálogo: cliente + clase + región + `Ventas netas`, `% Margen`, `Saldo por cobrar`,
  `Saldo vencido`.
- **Trampa:** ABC/RFM son fotos del año / 12 meses calculadas en el warehouse — no filtrarlas
  por mes ni recalcular el % en el visual. Las relaciones con `DM_Cliente` son 1:1
  bidireccionales: elegir "clase A" sí filtra las ventas.

## 4 · Cartera

- KPIs: `Saldo por cobrar terceros` · `Saldo vencido terceros` · `% Vencido terceros` ·
  `Días de cartera terceros` · `Saldo por pagar` · `Posición neta`.
- Aging de cobrar y de pagar por `DM_Antigüedad`.
- **Tendencia del saldo** con `FC_Cartera cobrar histórico` / `FC_Cartera pagar histórico`:
  ¿mejora o empeora? Nadie más muestra eso.
- Deudores top con `Días vencido promedio`; acreedores.
- **No:** `Saldo de facturas` como cifra oficial — es prorrateo informativo por documento;
  **el oficial es el del mayor** (`Saldo por cobrar`).
- **Trampas:** los históricos se fechan por **fecha de corte**, no por fecha del documento.
  La 2ª relación con el calendario (vencimiento) está **inactiva** — para analizar por
  vencimiento se necesita medida con `USERELATIONSHIP` (pedirla). Página mejor sin filtro de
  período, o con medidas `hoy`.

## 5 · Compras

- `Compras netas` · `Compras a terceros` / `al grupo` · **`Compras de servicios`** aparte (en
  Cresta son el 60% de las líneas — mezclarlas ensucia el análisis de producto).
- ABC proveedor: `% Compra en proveedores A` (dependencia de suministro) ·
  `Proveedores inactivos`.
- Compra por centro de costo.
- **No:** margen aquí; comparar compras vs ventas sin contexto (no son simétricas).

## 6 · Caja / Tesorería (cierra el order-to-cash)

- **`Cobros de clientes`** — nunca `Monto cobrado` como cifra principal: el 67% de ORCT es
  tesorería contra cuenta contable y triplica la cobranza.
- `Pagos a proveedores` · `Flujo neto de caja` · `% Cobrado vs facturado` (pulso de
  recuperación).
- Proyección semanal: `Entradas proyectadas` · `Salidas proyectadas` · `Flujo neto proyectado`
  por `semana_etiqueta` (ya ordenada con "Vencido" primero).
- `Entradas vencidas (exigible)` = lo cobrable HOY.
- **Trampa:** la proyección es **contractual** (si cada partida se paga en su vencimiento), no
  un pronóstico — decirlo en el subtítulo o lo cuestionan en la demo.

## 7 · Inventario

- `Valor de inventario` · `Rotación de inventario 12M` · **`Días de inventario`** (capital
  parado: el idioma del gerente) · `Costo promedio ponderado`.
- Por bodega (`DM_Bodega`) y por producto.
- **Trampa:** es foto al corte — no hay histórico diario: nada de series temporales ni filtros
  de período aquí.

## 8 · Resultados contables (P&L)

- `Ingresos contables` · `Costo (contable)` · `Gasto operativo` · `Resultado contable`.
- Drill con la **jerarquía contable de 5 niveles** de `DM_Cuenta contable`; gasto por centro
  de costo.
- **Gancho de demo:** `Ingresos contables` cuadra al centavo con `Ventas netas` — mostrarlos
  lado a lado: "el dashboard y la contabilidad dicen lo mismo".

## 9 · Socio 360° (la consolidada)

Usa `DM_Socio de negocio` — la vista consolidada de la maestra, relacionada ACTIVA con ventas,
compras, ambas carteras, ambos pagos y pedidos. Elegir un socio muestra todo a la vez.

- **Segmentador: `socio_unificado`** (no `nombre`). En SAP B1 un socio dual son DOS registros
  (CardCode cliente + CardCode proveedor) con el mismo NIT — en Cresta hay 37 así.
  `socio_unificado` es el nombre único por NIT: al elegirlo se filtran ambos registros.
- Filtro útil de página: `es_cliente_y_proveedor = TRUE` para ver solo socios con doble
  relación (toda la intercompañía lo es).
- Medidas: las de siempre funcionan solas — `Ventas netas`, `Compras netas`,
  `Saldo por cobrar`, `Saldo por pagar` y **`Posición neta`** se recalculan al socio filtrado.
  El neteo comercial con una empresa hermana sale gratis: ese visual es oro en la demo.
- **Trampas:** los históricos diarios de cartera NO tienen `socio_clave` (son incrementales;
  se migran aparte si se necesita la tendencia por socio). Socios que comparten NIT en el ERP
  se unifican aunque el nombre difiera (visto: PL000086 "Caffe Latte" con el NIT de Proavisa)
  — es correcto legalmente, pero revisar si sorprende. En esta página NO mezclar segmentadores
  de Cliente/Proveedor con los de Socio.

## 10 · Pedidos / backlog (solo si se usan pedidos formalmente)

- `Monto pedido` · `Backlog` · `Fill rate` · `Cantidad pendiente`.
- Si los pedidos se crean junto con la factura, esta página no aporta — verificar antes.

---

## Geografía (`DM_Dirección de entrega`)

- El hecho de VENTAS cruza por la **dirección de entrega del documento** (ShipToCode →
  CRD1): responde "¿a dónde se vende?", distinto de "¿quién compra?" (un cliente puede
  tener 20 puntos de entrega). Campos: país, departamento (vía catálogo OCST), municipio,
  ciudad, calle, código postal (coordenadas solo cuando el ERP las trae — Odoo).
- **Cobertura real en Cresta:** ~27% de las líneas de venta traen ShipToCode; y de las
  direcciones registradas, ~21% tienen departamento y ~29% municipio — es calidad de
  captura del ERP, no del warehouse. Leer los mapas con ese contexto (el resto cae en
  "No definido"). Si se necesita más cobertura, el siguiente paso es el fallback a la
  dirección default del socio (pedirlo).

## Transversales

- **Parámetros de campo (`MD_Vista de ventas` / `de cartera` / `de compras` / `de liquidez` /
  `de inventario` / `de rentabilidad`):** ponlos como segmentador y el visual cambia de
  métrica con un clic (montos, %, conteos) — un solo gráfico de tendencia o ranking en vez de
  uno por métrica. Arrastra la columna del parámetro al eje de valores del visual y el
  segmentador manda.
- **Dos ejes de moneda y nada más:** columnas sin sufijo = moneda de PRESENTACIÓN (GTQ —
  rigen TODOS los cálculos); columnas `_doc` = moneda del documento, solo referencia (vía
  «Moneda de análisis»). El eje local ya no existe en Oro: vive en Plata para el cuadre.

- **Moneda de presentación (consolidación):** las medidas base de importe (`Ventas netas`,
  `Compras netas`, `Saldo por cobrar/pagar`, `Monto cobrado/pagado`, `Valor de inventario`,
  `Margen bruto`…) ya están en **moneda de presentación** (GTQ) y son consolidables entre
  sociedades. Una sociedad en otra moneda (El Salvador, USD) convierte con la serie de tipo
  de cambio de su propio ERP; series capturadas al revés se detectan por reciprocidad y se
  corrigen solas (svproavis consolida así: `estado_serie = 'invertida_corregida'`). **Sin
  serie válida los montos de grupo son NULL** y la sociedad no suma en los totales. Los
  impuestos (`Impuesto facturado`) siguen en moneda local: son un concepto fiscal-local.
- **`MD_Moneda de análisis`** como segmentador solo tiene sentido **con un filtro de Moneda
  activo** — sumar USD con GTQ no es un número. Ideal: página o bookmark "moneda extranjera".
- Colores fijos: **azul** terceros · **naranja** grupo · **rojo** vencido/riesgo · **verde**
  margen/caja. Nunca decorativos.
- Foto vs flujo: saldos (cartera, inventario, posición) no se filtran por período — o se usan
  las medidas `hoy`; los flujos (ventas, compras, pagos) sí.
- Segmentadores estándar: Período + Empresa en todas; el específico de la página en tercera
  posición.
- Agrupación sugerida para el portal por perfil: **Gerencia** (1, 8) · **Comercial** (2, 3, 9)
  · **Finanzas** (4, 5, 6, 7). Todos los dashboards en el MISMO workspace que el modelo.

## Flujo de trabajo modelo ↔ visuales

- Los visuales se construyen **a mano en Desktop** y viven en `PulsoCresta.Report`. No se
  regeneran por código: `generar_reporte.py` NO se vuelve a correr (sobrescribiría el trabajo
  manual).
- El modelo sí se regenera con `generar_pbip.py` cuando cambie el warehouse o se agreguen
  medidas: **no toca los visuales**. Regla: cerrar Desktop antes de regenerar y reabrir.
- Cambios **aditivos** (medida nueva, columna nueva, tabla nueva) son siempre seguros.
  **Renombrar o borrar** algo que un visual ya usa lo deja en blanco — avisar antes.
- Si falta una medida (aging por vencimiento, participaciones…): pedirla; se agrega al modelo
  y aparece al regenerar.

## Familias nuevas (2026-08-06) — 293 medidas

Se amplió la capa semántica de 180 a 293 medidas para cubrir las áreas donde una empresa toma
decisiones y el modelo callaba. Lo que hay que saber para usarlas:

- **Ciclo de conversión de efectivo** (`FC_Cartera por pagar` › 05): `Días de pago terceros`
  (DPO) usa la MISMA convención que `Días de cartera terceros` (DSO), y el `Ciclo de conversión
  de efectivo` los suma con `Días de inventario`. Los tres se pueden abrir por separado para
  saber en cuál de las tres patas está atrapado el dinero. En Cresta: DSO 20 + DIO 128 − DPO 59
  = **89 días**.
- **Fugas de margen** (`FC_Ventas` › 08): `Ventas bajo costo` y `Margen perdido bajo costo`
  vigilan la venta por debajo del costo de línea. **Solo funcionan en SAP B1**: en Odoo la línea
  no trae costo y salen en cero. En Cresta es el 11.7% de la venta.
- **Precio-Volumen-Mezcla** (`FC_Ventas` › 09): `Efecto precio` + `Efecto volumen` +
  `Efecto mezcla` suman exactamente la variación contra el año anterior. Responde si la venta
  se movió por precio o por unidades. Úsalos en un gráfico de cascada.
- **Inventario ocioso** (`DM_Análisis de producto`): la ficha distingue dos cosas que no son lo
  mismo. `Valor de inventario ocioso` = artículos que SÍ se vendieron y llevan +90 días
  parados: dinero muerto accionable. `Valor sin rotación comercial` = artículos que nunca se
  facturaron; en una productora eso es alimento, medicina y empaque que se consumen sin pasar
  por factura, no mercadería estancada. Mezclarlos pondría el 95% del inventario de Cresta en
  rojo. `Productos en quiebre` y `Venta anual en riesgo por quiebre` son el lado contrario:
  demanda reciente sin existencia.
- **Ritmo y proyección** (`FC_Venta diaria` › 03): `Venta por día hábil` y `Proyección de cierre
  de mes` usan los días hábiles del calendario (descuentan feriados de Guatemala). La proyección
  **solo tiene sentido con UN mes filtrado y mientras el mes está en curso**.
- **Efectividad de cobranza** (`FC_Cartera cobrar histórico` › 02): necesita al menos dos cortes
  diarios dentro del período filtrado. Hoy hay pocos cortes acumulados; la medida es correcta
  pero gana sentido conforme se acumule historia.
- **Frescura del dato** (`FC_Estado de carga`): `Días desde última extracción` y `Último dato del
  ERP` son dos relojes distintos — el pipeline puede estar sano y la operación detenida. Vale la
  pena ponerlos en una esquina de la página de Pulso: un tablero que muestra un número viejo sin
  decirlo es peor que uno vacío.
- **Control contable** (`FC_Resultados contables` › 04): `Brecha contable vs facturado` compara
  el mayor con la facturación. Es un control, no un KPI: debería rondar cero y cuando se despega
  hay que ir a buscar por qué.
