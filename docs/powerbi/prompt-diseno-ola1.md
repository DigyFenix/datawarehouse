# Prompt para Claude (diseño) — copiar todo lo que sigue

---

# Diseño del informe ejecutivo "PulsoCresta" — Power BI, plataforma Quilate Analytics

## Quién soy y qué necesito de vos

Estoy construyendo **Quilate Analytics**, una plataforma de BI gobernada y multi-tenant que se
vende llave en mano a PyMEs con SAP Business One u Odoo. El primer entregable visible es un
**informe de Power BI de 12 páginas** sobre un modelo semántico ya construido (43 tablas, 316
medidas, esquema estrella). Este informe es **el gancho comercial del producto**: la demo donde el
gerente de una PyME ve una cifra suya que no conocía. Si la demo convence, el producto se vende.

Necesito que diseñes **mockups HTML de alta fidelidad** de las 3 páginas de la ola 1, respetando
las restricciones duras de abajo. No es un ejercicio libre: hay un contrato de diseño vigente y un
modelo de datos real. Tu valor está en la **jerarquía visual, la tensión narrativa y el pulido**
dentro de esas reglas — y en proponer desviaciones justificadas donde el contrato sea mejorable.
El resultado se implementa programáticamente en Power BI (formato PBIR/JSON), así que la precisión
de coordenadas y nombres importa más que la prosa.

## El cliente y sus datos reales (usalos en los mockups)

**Grupo Cresta**: grupo avícola guatemalteco (venta de huevo), 10 sociedades, moneda GTQ (Q),
ERP SAP Business One. El usuario es dirección general y gerencias — gente de operación, no
analistas. Cifras reales del modelo (agosto 2026):

- Ventas netas 2026: **Q402.3M** · a terceros: **Q287.3M** (9 sociedades venden; la mayor concentra **67.5%**)
- Cartera por cobrar de terceros HOY: **Q30.3M**, de los cuales **Q9.6M vencido (31.8%)**
- Venta anual en riesgo por quiebre de stock: **Q57.0M** en 98 productos agotados
- Venta bajo costo: **Q46.5M** (11.5% de la venta) con **Q18.4M** de margen perdido
- Backlog vencido: **Q5.7M** de Q12.5M comprometidos (45.7%)
- 79 clientes valiosos en riesgo de abandono con **Q22.0M** de venta anual
- Ciclo de conversión de efectivo: **80.2 días** de capital atrapado
- Agosto vence con **Q26.1M por pagar contra Q19.4M por cobrar** (presión de caja visible antes de que ocurra)
- Frescura: dato del ERP al 8 de agosto de 2026, extraído hace 0 días
- Cobranza histórica: solo 6 cortes semanales acumulados (serie en formación)

## Restricciones NO negociables (vienen del contrato del producto)

1. **Ningún número escrito a mano** en títulos/subtítulos: en el producto real todo número visible
   sale de una medida DAX (los textos exactos están abajo). En el mockup usá esos textos reales,
   pero el diseño debe asumir longitudes variables (son dinámicos).
2. **Prohibido afirmar causalidad**: usar *explica, contribuye, concentra, representa*; nunca
   *causa, provoca, se debe a*.
3. **El rojo corporativo `#d51c29` NUNCA identifica una serie** — se reserva para estado crítico
   (vencido +90, bajo costo, caja negativa). El azul lleva la identidad de marca.
4. **Nada de ejes duales, nada de donuts**, nada de página "resumen" sin pregunta declarada.
5. **Foto vs flujo**: los saldos (cartera) son FOTO de hoy e ignoran el período seleccionado a
   propósito; la salvedad se declara en el subtítulo. La venta es FLUJO y respeta el período.
6. Es **Power BI**: los únicos componentes disponibles son tarjeta (card), segmentador (slicer),
   tabla (tableEx), barras/columnas/línea/combo columnas+línea, barras apiladas, botón
   (actionButton, con texto dinámico desde medida), navegador de páginas y formas. Nada de
   componentes web custom, nada de scroll dentro de la página.

## Sistema visual vigente (contrato — la base sobre la que diseñás)

- **Canvas 1280×720 exacto.** Margen 24, gutter 16, **12 columnas de 88px**
  (x = 24+(n−1)·104; ancho de n columnas = 104n−16 → 3 col: 296 · 4 col: 400 · 5 col: 504 ·
  6 col: 608 · 8 col: 816 · 12 col: 1256). Todo x/y/ancho/alto en múltiplos de 8.
- **Bandas horizontales**: encabezado 0→72 · segmentadores 88→128 / KPIs y=144 h=88 ·
  análisis 216→696 (dos filas de 232: 216→448 y 464→696) · pie de frescura 700→720.
- **Paleta categórica de 8 slots en orden fijo** (validada para daltonismo, nunca ciclada):
  1 azul `#004ec9` · 2 naranja `#eb6834` · 3 aqua `#1baf7a` · 4 ámbar `#eda100` ·
  5 magenta `#e87ba4` · 6 verde `#008300` · 7 violeta `#4a3aa7` · 8 cian `#0093ab`.
  El azul de marca `#0043af` es para chrome, KPIs y cabeceras de tabla, no para series.
- **Rampa secuencial azul** (para el aging ordinal): `#8eb8ff → #5391ff → #0b69ff → #004ec9 →
  #0043af` (nunca arrancar más claro que `#8eb8ff`); el tramo +90 puede ir en crítico `#d51c29`.
- **Estados** (reservados, nunca series): bueno `#0ca30c` · advertencia `#eda100` (1-30 días) ·
  serio `#eb6834` (31-90) · crítico `#d51c29` (+90, vencido, bajo costo). Todo estado viaja con
  icono + etiqueta, nunca color solo.
- **Tipografía**: Segoe UI. Título de página 15px Semibold blanco sobre azul · título de visual
  12px Semibold `#1a1a1a` · subtítulo 9px `#5b6472` · valor de tarjeta 30px Semibold `#0043af` ·
  ejes/leyendas 9px `#5b6472`/`#8a9099`.
- **Fondos**: página `#f4f6f9`, visuales blancos con borde `#e3e6eb` radius 6, **sin sombras**.
- **Títulos de visual = la pregunta o el hallazgo**, nunca la descripción del eje.
  Correcto: "Q57.0M de venta anual en riesgo por 98 productos agotados".
  Incorrecto: "Ventas por producto".
- Abreviaturas K/M obligatorias en ejes y tarjetas (la venta anual está en cientos de millones).

## Chrome común a las 12 páginas (fijo — podés pulir el detalle, no la estructura)

| Elemento | Posición (x,y,w,h) |
|---|---|
| Banda de encabezado azul `#0043af` | 0, 0, 1280, 72 |
| Título de página (blanco, dinámico: "01 · Dirección · agosto 2026") | 24, 16, 608, 40 |
| Navegación entre páginas (tinta blanca sobre azul) | 648, 20, 504, 32 |
| Segmentador de período (default: mes en curso) | 24, 88, 296, 40 |
| Segmentador de empresa (default: todas) | 336, 88, 296, 40 |
| Segmentador de moneda de análisis | 1064, 88, 192, 40 |
| Pie de frescura: "Dato del ERP al 8 de agosto de 2026 · extraído hace 0 días" | 24, 700, 1256, 20 |

## Las 3 páginas a diseñar (contratos vigentes — partí de aquí)

### 00 · Inicio — "¿por dónde empiezo y puedo confiar en lo que voy a ver?"

- KPIs: Último dato del ERP · Días desde última extracción · Dominios desactualizados
- 6 botones de navegación grandes (grid 3×2 en 24,216,1256,232, botones de 400×112) hacia:
  01 Dirección · 02 Ventas · 05 Productos · 08 Compras · 09 Cartera · 11 Finanzas
- Tabla de frescura por dominio (24,464,608,232): dominio · último dato del ERP · días desde
  extracción (dominios reales: ventas, cartera_cobrar, compras, contabilidad, pagos,
  cartera_pagar, pedidos, tipos_cambio, productos, inventario, socios)
- 3 tarjetas de alerta (648,464,632,232): Q57.0M quiebre · Q9.6M vencido hoy · Q5.7M backlog vencido

### 01 · Dirección — "¿qué exige mi atención esta semana y cuánto dinero hay en juego?"

- 4 KPIs (y=144, h=88, w=296): Proyección de cierre de mes · Variación acumulada vs año anterior ·
  Posición neta hoy · Ciclo de conversión de efectivo (80.2 días)
- Ritmo del mes (24,248,608,216): combo columnas (venta por día hábil) + línea (proyección).
  Subtítulo dinámico real: "Cierre proyectado Q52.1M · van Q12.4M en 5 de 21 días hábiles"
- Serie mensual 2026 con media móvil de 3 meses (648,248,632,216). OJO: NO hay año anterior en el
  modelo (arranca en 2026) — no diseñes comparativo YoY en gráficas. Subtítulo dinámico real:
  "Q402.3M en el período · mejor mes: Jul 2026 con Q61.2M"
- **Fila de focos con navegación** (24,480,816,216): 5 filas-botón, cada una con su texto dinámico
  y navegación a su página. Textos reales de las medidas:
  - "Q57.0M de venta anual en riesgo · 98 productos agotados" → 05 Productos
  - "Q18.4M de margen perdido vendiendo bajo costo · 11.5% de la venta" → 03 Rentabilidad
  - "Q9.6M vencido de terceros hoy · 31.8% de la cartera" → 09 Cartera
  - "Q5.7M comprometido y no entregado · 45.7% del backlog" → 07 Pedidos
  - "−Q6.7M de flujo pactado en las próximas 4 semanas · sale más de lo que entra" → 10 Caja
  Este es el corazón comercial de la página: proponé el mejor diseño posible para "lista de focos
  accionables con dinero en juego" (estado con icono, cifra prominente, affordance de navegación).
- Aporte por sociedad (856,480,424,216): barras horizontales ordenadas. Subtítulo: "9 sociedades
  con venta a terceros · la mayor concentra 67.5%"

### 09 · Cartera y cobranza — "¿quién me debe, desde cuándo, y qué cobro esta semana?"

- 4 KPIs foto de hoy (y=144, la 2ª en estado crítico): Q30.3M por cobrar · Q9.6M vencido · 31.8% ·
  días de cartera. Subtítulo obligatorio: "foto de hoy, ignora el período seleccionado"
- Aging por tramos (24,248,504,216): corriente / 1-30 / 31-60 / 61-90 / +90 días, rampa ordinal
  azul con +90 en crítico. Subtítulo dinámico: "Q30.3M por cobrar de terceros · Q9.6M vencido
  (31.8%) · foto de hoy, ignora el período seleccionado"
- **"¿Qué cobro esta semana?"** (544,248,736,216): tabla por semana de vencimiento — cliente,
  documento, vence, saldo. Es la funcionalidad estrella (el ERP no puede responder esto).
  Subtítulo dinámico: "Q19.4M vence en agosto 2026 · por fecha de vencimiento, no de documento"
- "¿A quién no le despacho?" (24,480,608,216): tabla de clientes en vencido crítico — cliente,
  saldo, vencido, días vencido promedio, perfil de pago
- Tendencia de cobranza (648,480,632,216): línea de % vencido por corte semanal. Subtítulo
  dinámico: "Serie en formación · 6 cortes acumulados · la tendencia gana sentido con las semanas"

## Qué quiero de vuelta (formato de entrega)

1. **Mockup HTML de alta fidelidad de cada página** (1280×720, con las cifras y textos reales de
   arriba), fiel a la paleta y la grilla — que se vea como Power BI terminado, no wireframe.
2. **Spec estructurada por página**: por cada visual — tipo de visual de Power BI, posición final
   (x,y,w,h en la grilla), campos/medidas, título y subtítulo exactos, colores por serie (slot de
   la paleta), y toda decisión de formato (unidades K/M, etiquetas de dato sí/no, dónde va la
   leyenda, orden de las categorías).
3. **Desviaciones propuestas al contrato**, cada una con su justificación en una línea (las voy a
   evaluar contra el contrato antes de adoptarlas).
4. Si un visual del contrato te parece débil para la demo comercial, **proponé la alternativa**
   dentro de los componentes de Power BI disponibles.
