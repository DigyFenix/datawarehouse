# Kraken 360 → Quilate Analytics · inventario de tableros a replicar

Referencia de construcción del Power BI de **Iron Network (Odoo 18)**. Kraken 360 es un BI
comercial que se conecta a Odoo y arma sus tableros desde ahí; las capturas son de una empresa
de prueba (IMADE), así que **los montos no cuadran con Iron y no deben cuadrar**: lo que se
replica es el análisis, no la cifra.

Capturas en `capturas/`. Cada tablero tiene su ficha: visual → métrica → dimensión → qué hay
en Oro → qué falta en Odoo.

Decisión de la sesión 28 (2026-10-17, Edwin): **las páginas se construyen por código** (Node,
PBIR, patrón `generar_pagina_00.js`), replicando las capturas. Esto invierte la decisión 15 del
STATE (construcción manual). Generador: `consumo/powerbi/generar_paginas_ventas.js`.

---

## Convenciones que Kraken usa en todos sus tableros

| Elemento | Qué es | Equivalente en el modelo |
|---|---|---|
| "al 16 oct (79%)" | corte del dato + % del período transcurrido | `Corte de ventas` · `% Avance del año` / `% Avance del mes` (nuevas) |
| Dólares / M. Local | conmutar moneda | `MD_Moneda de análisis` (grupo de cálculo) — ver gap G6 |
| Unidades / Unidad Std | conmutar importe ↔ cantidad | `MD_Vista de ventas` (parámetro de campo: Ventas netas / Unidades vendidas / …) — "Unidad Std" ver gap G7 |
| "Resultados mostrados en Dólares (USD) sin IVA" | nota de moneda y base | subtítulo estático + `Ventas netas` (siempre sin impuesto) |
| Selector "Todas" | empresa / sucursal | `DM_Empresa[nombre]` (Iron: una sociedad) |
| Top 100 | ranking recortado | orden descendente por `Ventas netas`; el corte a 100 es un filtro de visual |

---

## 01 · Histórico de Ventas (`capturas/01-ventas-historico.png`)

| # | Visual Kraken | Tipo | Métrica | Dimensión | En Oro / modelo | Gap |
|---|---|---|---|---|---|---|
| 1 | Título "Histórico de Ventas al 16 oct (79%)" | texto | — | — | `Título de Histórico de ventas` (nueva) | — |
| 2 | Resultado del año · Acumulado anual | KPI | venta sin IVA YTD | — | `Ventas acumuladas año` | — |
| 3 | Resultado del año · Cump Meta (395 %) | KPI | YTD / meta YTD | — | **no existe meta** | **G1** |
| 4 | Resultado del año · Vs año anterior (+4 %) | KPI | YTD vs YTD-1 | — | `Variación acumulada vs año anterior` | — |
| 5 | Nro de Facturas | KPI | conteo documentos | — | `Documentos de venta` | — |
| 6 | Nro Clientes | KPI | clientes distintos con venta | — | `Clientes con venta` | — |
| 7 | Nro Prod | KPI | productos distintos vendidos | — | `Productos vendidos` | — |
| 8 | Ticket promedio | KPI | venta / documentos | — | `Ticket promedio` | — |
| 9 | Selector "Año actual" | segmentador | — | año | `DM_Calendario[anio]` | — |
| 10 | Venta histórica por mes y variación año con año | columnas agrupadas (año actual vs anterior en gris) con etiqueta "monto +%" | venta mensual, var. a/a | mes | `Ventas netas` + `Ventas año anterior` por `mes_nombre_corto`; etiqueta `Etiqueta de venta mensual` (nueva) | — |
| 11 | Matriz año × mes (montos) | matriz | venta | año, mes | `Ventas netas` por `anio` × `mes_nombre_corto` | — |
| 12 | Matriz año × mes (variación %) con semáforo | matriz | var. a/a | año, mes | `Variación vs año anterior`; el color condicional se aplica en Desktop (PBIR no lo expone de forma estable) | parcial |
| 13 | Venta por Sucursal | dona | venta | sucursal | `DM_Bodega[nombre]` (Iron: 1 almacén) | G3 |
| 14 | Venta por Canal | dona | venta | canal comercial | **no existe** (Odoo: `crm.team` / `team_id`) | **G2** |
| 15 | Venta por Sector (Crédito / Contado / …) | barras | venta | condición de pago | `DM_Cliente[condicion_pago_codigo]` — en Iron trae basura (`{"4": 4}`) | **G4** |
| 16 | Venta por Cliente · Top 100 | barras | venta | cliente | `DM_Cliente[nombre]` | — |
| 17 | Venta por Ubicación | mapa de burbujas | venta | ciudad / coordenadas | `DM_Dirección de entrega[ciudad]`; Iron: 9 de 228 direcciones con ciudad, 1 con coordenadas | G5 |
| 18 | Venta por Línea | barras | venta | categoría de producto | `DM_Producto[grupo_codigo]` — solo el id numérico de `categ_id` | **G2** |
| 19 | Venta por Producto · Top 100 | barras | venta | producto | `DM_Producto[nombre]` | — |
| 20 | Venta por Vendedor | barras | venta | vendedor | `DM_Vendedor[nombre]` — en Odoo todo cae en "No definido" | **G2** |

## 02 · Seguimiento de Ventas (`capturas/02-ventas-seguimiento.png`)

Misma familia de visuales, pero el período es **el mes** (segmentador "Año Mes" con Mes actual /
Mes anterior / lista) y se agrega:

| # | Visual Kraken | Tipo | Métrica | En Oro / modelo | Gap |
|---|---|---|---|---|---|
| 1 | Título "Seguimiento de Ventas al 16 oct (52%)" | texto | — | `Título de Seguimiento de ventas` (nueva) | — |
| 2 | Resultado del día | KPI | venta del último día | `Venta del día` (nueva) | — |
| 3 | Resultado (mes) · Cump Meta · Vs año anterior · Nro Facturas · Nro Clientes · Nro Prod · Ticket | KPIs | mes | `Ventas netas`, `Variación vs año anterior`, conteos, `Ticket promedio` | G1 (meta) |
| 4 | Año Mes (Mes actual, Mes anterior, 2026 Ago…) | segmentador lista | — | `DM_Calendario[anio_mes]`, mes en curso preseleccionado | — |
| 5 | Buscar Cliente / Buscar Producto y/o SKU | segmentadores con búsqueda | — | `DM_Cliente[nombre]`, `DM_Producto[nombre]` | — |
| 6 | Venta del Mes (acumulado diario: mes actual · año anterior · meta al día) | líneas | acumulado por día | `Venta acumulada del mes al día` + `… año anterior` (nuevas); meta al día ver G1 | G1 |
| 7 | Venta por Vendedor / Sector / Cliente / Línea / Producto / Sucursal / Canal / Ubicación | como en 01 | mes | ídem 01 | ídem |

---

## Gaps — qué falta y cómo se obtiene de Odoo

**Resueltos en la sesión 28 (seed `metadata-store/seeds/70_paquete_odoo_comercial.sql`):**

| Gap | Resolución | Verificado en Iron (2026-10-17) |
|---|---|---|
| G2 Vendedor | `res_users` → `plata_vendedor` (rama Odoo, nombre vía `res_partner`) | 4 vendedores con venta; dos muestran su login porque así se llama su partner en Odoo |
| G2 Canal | `crm_team` → `plata_canal` / `dim_canal` + `canal_clave` en el hecho (`account_move.team_id`) | Ventas · VENTAS-INORGANICAS · VENTAS-ORGANICAS |
| G2 Línea | `product_category` → `grupo_nombre` en `plata_producto` / `dim_producto` | Software, COMPUTADORA, INTERNET, Microsoft… |
| G4 Sector | `account_payment_term` → `plata_condicion_pago` / `dim_condicion_pago` + `condicion_pago_clave` en el hecho (condición DEL DOCUMENTO, con fallback a la del cliente; la propiedad jsonb `{"4": 4}` del socio ya se lee bien) | 30 días, 15 días, Pago inmediato… |
| G5 Ubicación (parcial) | `partner_shipping_id` ahora se extrae (el seed 69 lo sembró bajo el objeto SAP `ventas_factura`); el hecho cae a la dirección PRINCIPAL del socio cuando no hay dirección de entrega propia | 759 de 761 líneas con dirección; la ciudad sigue vacía en la mayoría (calidad de captura en el Odoo de Iron) |

SAP B1 (Cresta): `dim_canal` y `dim_condicion_pago` quedan en No definido hasta extraer OCTG /
definir canal; `grupo_nombre` requiere OITB. Todo compila en ambas ramas.

**Pendientes:**

| Gap | Qué pide Kraken | Qué hay | Cómo se obtiene | Dónde se toca |
|---|---|---|---|---|
| **G1 Meta de venta** | Cump Meta (año y mes), "Meta al día" | nada | Kraken la captura en su propio sistema; Odoo no la tiene. Propuesta: tabla `oro.meta_venta` (empresa_id, anio, mes, vendedor_codigo opcional, meta_monto) alimentada desde el portal admin (pantalla nueva) o, de arranque, seed por organización. Medidas: `Meta de venta`, `Cumplimiento de meta`, `Meta al día` = meta × `% Avance del mes` | portal + dbt + generador PBIP |
| **G3 Sucursal** | venta por sucursal | `stock_warehouse` (Iron: 1) y la factura no lo trae | En Odoo la "sucursal" puede ser almacén, diario (`journal_id`) o compañía hija. Confirmar con Iron qué llaman sucursal | definición de negocio |
| **G5 Ciudades** | mapa por ciudad | 38 de 256 direcciones con ciudad | Calidad de captura en el Odoo de Iron. Alternativa: geocodificar por `zip`/`city` en Plata (no se hace sin pedirlo) | dato del cliente |
| **G6 Dólares** | todo en USD | 1 tasa en `res_currency_rate` | Confirmar que Iron registra tasas; sin serie, "Dólares" no se publica | dato del cliente |
| **G7 Unidad Std** | cantidad en unidad estándar | `uom_id` numérico, sin factor | Extraer `uom_uom` (nombre, factor, categoría) → `factor_std` en producto; medida `Unidades estándar` | extracción + dbt |

## Mapeo de layout (lienzo 1280 × 960, grilla del contrato visual)

Kraken usa un lienzo más ancho y alto que el contrato (1280 × 720). Para no perder visuales
se usa **1280 × 960**: tres filas de análisis de 232 px en vez de dos. `FitToPage` lo escala.

| Banda | y | Página 01 · Histórico | Página 02 · Seguimiento |
|---|---|---|---|
| Encabezado | 0–72 | título dinámico + navegador | ídem |
| KPIs | 88–200 | Año · Resultado del año (6 KPI) · Moneda · Vista | Resultado del día · Resultado (6 KPI) · Moneda · Vista |
| Fila 1 | 216–448 | columnas mensuales (9 col) · dona Sucursal (3 col) | Año-Mes (2) · Vendedor (2) · Sector (2) · Cliente top (3) · Producto top (3) |
| Fila 2 | 464–696 | matriz año×mes montos + variación (9 col) · dona Línea (3 col) | Buscar cliente/producto (2) · Venta del mes (4) · Ubicación (3) · Sucursal (3) |
| Fila 3 | 712–944 | Sector (2) · Cliente top (3) · Ubicación (3) · Producto top (2) · Vendedor (2) | Línea (3) · Canal (3) · libre |
| Pie | 944–960 | frescura del dato | ídem |
