# PULSOCRESTA — POWER BI ANALYTICS PRODUCT
## Instrucción maestra operativa — v3.0

> Este archivo es un **contrato de ejecución**, no un manifiesto.
> Cada fase tiene entrada, salida, presupuesto y un gate binario.
> Si un gate no pasa: **DETENERSE y reportar.** No improvisar alrededor del gate.

---

# 0. PROTOCOLO DE SESIÓN

## 0.1 Al inicio de CADA sesión

1. Leer este archivo completo.
2. Leer `docs/powerbi/STATE.md`. Si no existe, crearlo con la plantilla de §0.3 en `FASE: F0`.
3. Ejecutar el chequeo de precondiciones (§2). Si falla, detenerse.
4. Anunciar en una línea: fase activa, artefacto objetivo, gate de salida.
5. Ejecutar **una sola fase**. No encadenar fases en una misma sesión.

## 0.2 Al cerrar cada fase

1. Escribir el artefacto de la fase.
2. Verificar el gate de salida. Si no pasa, NO avanzar el estado.
3. Actualizar `STATE.md`.
4. Commit (§8).
5. Reportar en máximo 15 líneas: qué se hizo, qué se decidió, qué quedó bloqueado.

## 0.3 Plantilla `docs/powerbi/STATE.md`

```markdown
# STATE — PulsoCresta Power BI Product

FASE_ACTUAL: F0
ULTIMA_ACTUALIZACION: YYYY-MM-DD
GATE_ANTERIOR: NO_EVALUADO | PASA | FALLA

## Artefactos producidos
| Artefacto | Ruta | Fase | Estado |
|---|---|---|---|

## Decisiones tomadas
| # | Decisión | Justificación | Fase |
|---|---|---|---|

## Bloqueos abiertos
| # | Bloqueo | Requiere de | Desde |
|---|---|---|---|

## Presupuesto consumido
- Páginas construidas: 0 / 12
- Medidas nuevas creadas: 0 / 40
- Rondas de iteración: 0 / 2
```

**Regla:** `STATE.md` es la única fuente de verdad del progreso. Si el contexto de la sesión y `STATE.md` discrepan, gana `STATE.md`.

---

# 1. OBJETIVO Y ALCANCE

Convertir el Semantic Model existente en un producto de BI navegable, con calidad de demostración comercial, sin rehacer el modelo ni el DWH.

**Alcance v1.0:** máximo **12 páginas**. La expansión a más páginas requiere autorización explícita del usuario tras el review de §7.

**Fuera de alcance sin autorización:** cambios al DWH (`dw_grupocresta`, esquema `oro`), cambios a vistas/funciones en HANA, RLS, deployment pipelines, publicación al Service.

---

# 2. GATE 0 — PRECONDICIONES DURAS

Ejecutar **antes de cualquier otra cosa**. Todas deben pasar.

## 2.1 Formato PBIR

```bash
find . -name "definition.pbir" -not -path "*/node_modules/*"
```

Abrir el `definition.pbir` encontrado y verificar:

- `"version"` ≥ `"4.0"`
- existe la carpeta hermana `definition/pages/` con un subdirectorio por página
- existe `definition/pages/pages.json`

**Si en lugar de eso existe un `report.json` monolítico:** el reporte está en formato legacy.
→ **DETENER.** Reportar: *"El .Report está en formato legacy. Requiero que se convierta a PBIR (Power BI Desktop → Opciones → Vista previa → Power BI Enhanced Report Format) antes de continuar."*
→ **Prohibido** intentar editar `report.json` a mano.

## 2.2 Formato TMDL del modelo

```bash
find . -name "*.tmdl" | head -20
find . -name "model.bim"
```

Si solo existe `model.bim`, se puede trabajar, pero registrar en `STATE.md` como decisión que las ediciones se harán sobre `model.bim` con validación JSON estricta.

## 2.3 Baseline de auditoría

Verificar que existe el audit ya realizado del modelo (37 tablas / 595 columnas / 180 medidas / 93 relaciones) y el plan de remediación de 12 defectos.

Ruta esperada: `docs/powerbi/audit/`
Si los documentos están en otra ruta, localizarlos y registrar la ruta real en `STATE.md`.

**Si no se encuentran:** DETENER y preguntar. **No re-auditar el modelo desde cero.**

## 2.4 Remediación de defectos numéricos

Los defectos clasificados como **"producen números incorrectos hoy"** deben estar cerrados.

**Si siguen abiertos:** DETENER. Reportar cuáles. No construir páginas sobre medidas incorrectas — cada página construida sobre ellas es trabajo que habrá que rehacer y, peor, un demo comercial con números falsos.

## 2.5 Tema corporativo

Verificar `theme/pulsocresta-theme.json`.

**Si no existe:** DETENER y solicitar la identidad visual (paleta corporativa, tipografía, logo). **No inventar una paleta.** Todo el trabajo visual posterior dependería de ella y habría que rehacerlo.

## 2.6 Git limpio

```bash
git status --porcelain
```

Debe estar limpio. Si hay cambios sin commitear, detenerse y reportar.

---

# 3. REGLAS INVIOLABLES

## 3.1 Sobre el Semantic Model

**Prohibido sin autorización explícita:**
- renombrar o eliminar tablas, columnas, medidas o relaciones existentes
- cambiar granularidades o direcciones de filtro existentes
- duplicar lógica ya implementada

**Única excepción autorizada:** los cambios contemplados en el plan de remediación de los 12 defectos. Fuera de ese plan, cualquier modificación al modelo requiere aprobación previa.

**Antes de crear cualquier medida nueva**, verificar en este orden:
1. ¿Existe ya con otro nombre?
2. ¿Existe una medida que pueda componerse para obtenerla?
3. ¿Existe el cálculo a otra granularidad?
4. ¿Puede resolverse con un field parameter en vez de N medidas?

Solo si las cuatro respuestas son no, crearla.

## 3.2 Prohibición de literales numéricos en la capa visual

**Ningún título, subtítulo, etiqueta de texto o narrativa puede contener un número escrito a mano.**

Todo número visible en texto proviene de una medida DAX ubicada en el display folder `_Narrativa`.

Correcto:
```
Título del visual = medida [Titulo Ventas YoY] que devuelve
"Ventas Q12.4M — " & FORMAT([Var % YoY], "+0.0%;-0.0%") & " vs. año anterior"
```

Prohibido:
```
Título = "Ventas +8.4% YoY — crecimiento concentrado en Q2"
```

Esta regla existe porque un demo comercial con un número inventado en un título destruye la credibilidad del producto completo.

## 3.3 Prohibición de afirmar causalidad

Usar: *explica, contribuye, concentra, está asociado a, representa, coincide con*.
No usar: *causa, provoca, genera, se debe a* — salvo que exista una relación contable directa demostrable en el modelo (ej. margen = ingreso − costo).

## 3.4 Prohibición de afirmar capacidades no verificadas

No declarar que una herramienta, MCP, skill o visual está disponible/instalado/funcionando sin haberlo verificado con un comando y haber visto la salida.

## 3.5 Prohibición de instalación autónoma

El agente **no instala** MCPs, plugins, skills ni paquetes de terceros por iniciativa propia. Detecta, evalúa contra la matriz de capacidades, reporta el gap y **espera autorización**.

Lista blanca de candidatos evaluables (solo evaluación, no instalación):
| Repositorio | Origen | Uso potencial |
|---|---|---|
| `microsoft/skills-for-fabric` | Microsoft | report design / authoring / planning |
| `microsoft/powerbi-modeling-mcp` | Microsoft | inspección de modelo, DAX, relaciones |
| `data-goblin/power-bi-agentic-development` | Comunidad (Kurt Buhler) | PBIR authoring, review, Deneb |

Cualquier repositorio fuera de esta lista se reporta como sugerencia, no se instala.

## 3.6 Sin datos inventados

Si un dato, dimensión, atributo o medida no existe en el modelo: documentarlo como inexistente. Si podría construirse: documentarlo como oportunidad en `dax-opportunities.md`. Nunca simularlo.

---

# 4. PRESUPUESTOS Y CONDICIONES DE PARADA

Estos límites son duros. Al alcanzarlos, detenerse y reportar, no continuar.

| Recurso | Límite v1.0 |
|---|---|
| Páginas totales | 12 |
| Páginas por ola de construcción | 3 |
| Medidas nuevas totales | 40 |
| Medidas nuevas por lote (con validación entre lotes) | 10 |
| Visuales por página ejecutiva | 4 – 7 |
| Visuales por página analítica | 6 – 12 |
| Visuales por página de detalle/explorer | sin límite razonable, máx. 15 |
| Rondas de iteración post-review | 2 |

**Condición de terminación del proyecto v1.0** (binaria, no interpretativa):

```
12 páginas construidas
  Y todas pasan el gate de F6 (QA)
  Y coverage-review.md clasifica cada capacidad del modelo
  Y las 2 rondas de iteración se consumieron o el usuario declara cierre
→ v1.0 CERRADA
```

No existe "iterar hasta que el valor marginal sea bajo". Eso no es medible por el agente.

---

# 5. CONTRATOS DE DISEÑO

Estos contratos se escriben una vez en F3 y se respetan sin excepción a partir de ahí.

## 5.1 Grilla de layout

- Canvas: **1280 × 720** px
- Margen exterior: 24 px
- Grilla: 12 columnas, gutter 16 px → ancho de columna = 84 px
- Unidad vertical: 8 px. Toda coordenada `y` y toda `height` son múltiplo de 8.
- Banda de encabezado: y = 0 → 72 px (título de página + navegación)
- Banda de KPIs: y = 88 → 200 px
- Área de análisis: y = 216 → 696 px

Un visual que no cae en la grilla es un defecto, no una preferencia.

## 5.2 Convención de nombres (PBIR)

- Carpeta de página: `NN-slug-kebab-case` (ej. `03-ventas-drivers`)
- `displayName` de página: `NN · Nombre Legible` (ej. `03 · Drivers de Ventas`)
- `name` de página y de visual: GUID estable. **Nunca regenerar un GUID existente** — rompe bookmarks, drill-through y navegación.
- Bookmarks: `bm_<pagina>_<estado>` (ej. `bm_ventas_vista_producto`)
- Field parameters: `fp_<dimension>` / `fp_<metrica>`

## 5.3 Medidas nuevas

- Respetar la convención de nombres **ya presente en las 180 medidas existentes**. Derivarla del modelo, documentarla en `docs/powerbi/contracts/naming-conventions.md`. **No imponer una convención nueva.**
- Display folders obligatorios para lo nuevo:
  - `_Narrativa` — medidas que devuelven texto para títulos dinámicos
  - `_Auxiliar` — medidas intermedias no destinadas al usuario final (marcar `isHidden: true`)
- Toda medida nueva lleva `description` en TMDL explicando qué responde.

## 5.4 Locale y formato

- Moneda: **GTQ**, formato `Q#,##0` (sin decimales en KPIs; 2 decimales solo en detalle de documentos)
- Cultura del modelo: `es-GT` (verificar la declarada en el TMDL y respetarla; si difiere, reportar, no cambiar)
- Fechas: usar la tabla de fechas ya marcada en el modelo. **Verificar si el calendario es natural o fiscal antes de escribir cualquier medida de time intelligence.** Si no está documentado, preguntar.
- Millares: separador de coma; abreviaturas `K` / `M` en ejes y KPIs.

## 5.5 Color

- Solo colores del `theme.json`. Cero hex hardcodeados en el JSON de visuales.
- El color codifica significado: estado (positivo/negativo/neutro), alerta, categoría o selección. Nunca decoración.
- Rojo/verde siempre acompañados de un segundo canal (flecha, signo, posición) por accesibilidad.

---

# 6. FASES

## F0 — TOOLCHAIN AUDIT

**Entrada:** entorno de Claude Code.
**Trabajo:** detectar qué skills, MCPs, plugins y CLIs existen y funcionan. Verificar cada uno con un comando real.
**Salida:** `docs/powerbi/tool-capability-matrix.md`

| Capacidad | Herramienta | Detectada | Verificada (comando) | Gap | Uso previsto |
|---|---|---|---|---|---|
| Lectura TMDL | | Sí/No | | | |
| Escritura TMDL | | | | | |
| Ejecución DAX contra el modelo | | | | | |
| Lectura/escritura PBIR | | | | | |
| Validación de esquema PBIR | | | | | |
| Consulta a PostgreSQL `oro` | | | | | |
| Render/screenshot de reporte | | | | | |

**Gate:** la matriz existe, cada fila "Verificada" cita el comando ejecutado, y los gaps están listados con la herramienta candidata propuesta (sin instalar).

**Nota realista:** si no hay ejecución DAX contra el modelo ni render del reporte, decláralo. Cambia el diseño del QA de F6 y hay que saberlo desde ahora, no descubrirlo en la fase 8.

---

## F1 — BASELINE DEL MODELO

**Entrada:** audit existente en `docs/powerbi/audit/`.
**Trabajo:** NO re-auditar. Leer el audit y producir un mapa de explotación analítica: para cada tabla, qué análisis ya son posibles con lo existente.

**Salida:** `docs/powerbi/model-exploitation-map.md`

Por tabla:
```
Tabla · Granularidad · Rol (hecho/dimensión/puente/calendario)
├── Medidas existentes que la usan
├── Dimensiones de corte disponibles
├── Análisis posibles HOY (sin DAX nuevo)
└── Análisis posibles CON DAX nuevo (referenciar id de gap)
```

**Gate:** las 37 tablas están cubiertas. Cada una tiene al menos una fila en "Análisis posibles hoy" o una justificación de por qué no aplica.

---

## F2 — MATRIZ DE OPORTUNIDAD ANALÍTICA

**Salida:** `docs/powerbi/analytics-opportunity-matrix.md`

| ID | Área | Pregunta de negocio | Tablas | Medidas existentes | DAX faltante | Visual propuesto | Impacto | Esfuerzo | Prioridad |
|---|---|---|---|---|---|---|---|---|---|

- Prioridad: P0 imprescindible · P1 alto impacto · P2 valor adicional · P3 opcional
- Impacto y esfuerzo: Alto/Medio/Bajo. La prioridad se deriva de ambos, no del entusiasmo.
- **Cada fila debe declarar una pregunta de negocio concreta.** "Análisis de ventas" no es una pregunta. "¿Qué clientes que crecían el año pasado están cayendo este año y cuánto dinero representan?" sí lo es.

Áreas a cubrir según lo que el modelo permita — no forzar las que no tengan datos:
Ventas · Clientes · Productos · Inventario · Compras · Proveedores · Cartera (CxC) · CxP · Working capital · Flujo de efectivo · Finanzas/P&L · Pedidos/backlog · Operación diaria

Análisis avanzados a evaluar (implementar solo si responden una pregunta real):
Pareto · ABC · RFM · Price/Volume/Mix · contribución · waterfall · decomposition · aging · concentración · cohortes · ventanas móviles · estacionalidad · detección de anomalías

**Gate:** ≥ 25 filas, todas con pregunta de negocio explícita y prioridad asignada. Los P0 no exceden 12 (es el presupuesto de páginas).

---

## F3 — ARQUITECTURA DEL REPORTE

**Salida:** `docs/powerbi/report-architecture.md` + los contratos de §5 escritos en `docs/powerbi/contracts/`

Para cada una de las ≤12 páginas, un contrato de página:

```markdown
### NN · Nombre de página
- Audiencia:
- Pregunta principal:
- Preguntas secundarias: (2-4)
- KPIs: (medida existente o id de gap DAX)
- Visuales: | # | Pregunta que responde | Tipo | Campos | Posición (x,y,w,h) |
- Interacciones: drill-through desde / hacia, tooltips, bookmarks, field parameters
- Filtros de página:
- IDs de oportunidad cubiertos (F2):
```

Estructura sugerida como **hipótesis** — ajustarla al modelo real:

```
00 HOME (navegación)
01 EXECUTIVE OVERVIEW
02 VENTAS — evolución y variación
03 VENTAS — drivers / price-volume-mix
04 CLIENTES — concentración y ABC
05 CLIENTES — riesgo y ciclo de vida
06 PRODUCTOS — desempeño y Pareto
07 INVENTARIO — capital inmovilizado vs. riesgo de quiebre
08 COMPRAS Y PROVEEDORES — concentración y variación de precio
09 CARTERA — aging y riesgo
10 CAPITAL DE TRABAJO Y FLUJO
11 DETAIL EXPLORER
```

**Regla sobre inventario:** capital inmovilizado y riesgo de faltante son dos problemas opuestos. No mezclarlos en el mismo visual ni en la misma narrativa.

**Regla sobre selección de visual:** antes de elegir el tipo, responder en el contrato: pregunta → comparación necesaria → patrón a revelar → visual. Si el patrón es contribución al cambio, el visual es waterfall, no barras. Si es concentración, es Pareto o curva de Lorenz, no donut. Barras y líneas se usan cuando son la respuesta correcta, no por defecto.

**Deneb / SVG:** evaluar solo si (a) ningún visual nativo resuelve el patrón, (b) Deneb está confirmado como disponible en F0, y (c) el usuario lo autoriza. Autorar specs Vega-Lite embebidos en JSON de PBIR a ciegas es costoso y frágil; no es el default.

**Gate:** cada página tiene contrato completo con coordenadas en grilla; la suma de IDs de oportunidad cubiertos incluye el 100% de los P0.

---

## F4 — DAX: GAP E IMPLEMENTACIÓN

**Salida:** `docs/powerbi/dax-opportunities.md` + medidas en el TMDL

Por cada medida propuesta:

```markdown
### GAP-NN · [Nombre de medida]
- Pregunta que responde:
- Por qué no existe hoy: (verificado contra las 180 medidas)
- Medidas existentes que reutiliza:
- Páginas donde se usa:
- Prioridad: P0/P1/P2/P3
- Definición DAX:
- Prueba de validación: qa/dax-tests/GAP-NN.dax + GAP-NN.sql
```

**Implementación por lotes de máximo 10 medidas.** Entre lotes, obligatorio:
1. Ejecutar las pruebas del lote (§7)
2. Verificar comportamiento en totales y subtotales
3. Verificar contexto de filtro cruzado (que la medida responda a los slicers previstos)
4. Verificar `BLANK` vs `0` — decidir explícitamente cuál corresponde y documentarlo
5. Commit

**Gate:** todas las medidas P0 implementadas, todas con prueba pasando, cero medidas huérfanas (creadas y no usadas en ninguna página).

---

## F5 — IMPLEMENTACIÓN DEL REPORTE

**Construir sobre el `.Report` PBIP existente. No crear un reporte nuevo.**

**Olas de 3 páginas.** Al cerrar cada ola: F6 completa sobre esas 3 páginas, commit, y checkpoint humano (§9) antes de la siguiente ola.

Orden de construcción recomendado:
1. Ola 1: `01 Executive`, `09 Cartera`, `00 Home` — Cartera primero por ser el caso de mayor valor demostrable inmediato
2. Ola 2: ventas y drivers
3. Ola 3: clientes y productos
4. Ola 4: inventario, compras, capital de trabajo, explorer

Por página, en este orden:
1. Crear la carpeta de página y su `page.json` con el `displayName` y ordinal correctos
2. Colocar los visuales según las coordenadas del contrato de F3
3. Enlazar campos y medidas (referenciando por nombre exacto del modelo)
4. Configurar títulos dinámicos con medidas `_Narrativa`
5. Configurar tooltips: deben aportar información **no visible** en el visual (LY, variación, participación, ranking, margen), no repetir lo mostrado
6. Configurar interacciones cruzadas y drill-through
7. Ejecutar el validador estructural (§6/F6.1)

**Gate por ola:** las 3 páginas abren en Power BI Desktop sin error, el validador estructural pasa, y no hay referencias a campos inexistentes.

---

## F6 — QA

Tres capas. Las tres son obligatorias.

### F6.1 QA estructural (automatizable — el agente SÍ puede hacerlo)

Script `scripts/validate-pbir.py` que recorre `definition/pages/` y verifica:

- [ ] Todo visual dentro del canvas 1280×720
- [ ] `x`, `y`, `width`, `height` múltiplos de 8
- [ ] Cero solapamientos entre visuales de la misma página
- [ ] Cero colores hex literales en configs (todo vía tema)
- [ ] Todo campo referenciado existe en el modelo
- [ ] Todo `name`/GUID es único y no duplicado
- [ ] Toda página referenciada por un botón de navegación existe
- [ ] Todo target de drill-through existe y tiene los campos de drill declarados
- [ ] Cero visuales sin título o con el título autogenerado por defecto
- [ ] Cero literales numéricos en strings de título/subtítulo (regex sobre dígitos)

Salida: `docs/powerbi/qa/structural-qa.md` con lista de defectos. **Gate: cero defectos.**

### F6.2 QA de datos

Por página:
- [ ] Totales cuadran contra consulta SQL directa a `oro` (§7)
- [ ] Time intelligence: verificar YTD, YoY y móviles en un mes de cierre conocido
- [ ] Verificar comportamiento en el mes en curso (parcial) — causa habitual de YoY engañoso
- [ ] Verificar filas sin coincidencia en relaciones (miembros en blanco)
- [ ] Verificar duplicados y granularidad en visuales de detalle
- [ ] Verificar rankings y acumulados en presencia de empates

Salida: `docs/powerbi/qa/data-qa.md`. **Gate: cero discrepancias fuera de tolerancia (§7).**

### F6.3 QA visual — REQUIERE HUMANO

**El agente no renderiza el reporte y no puede evaluar legibilidad, jerarquía visual ni densidad percibida.** Declararlo, no simularlo.

El agente produce `docs/powerbi/qa/visual-qa-checklist.md` con la lista de verificación por página, y **solicita capturas de pantalla al usuario**. Con las capturas recibidas, evalúa: jerarquía, contraste, densidad, consistencia entre páginas, truncamiento de texto, formatos de eje.

Nunca marcar F6.3 como aprobada sin haber visto capturas.

---

## F7 — REVISIÓN EJECUTIVA Y COMERCIAL

**Salida:** `docs/powerbi/executive-review.md`

Recorrer el producto simulando cada rol y responder si el reporte permite contestar su pregunta en menos de 60 segundos:

| Rol | Pregunta | ¿Se responde? | Página | Fricción detectada |
|---|---|---|---|---|
| CEO | ¿Cómo está la empresa y qué cambió? | | | |
| CFO | ¿Dónde está el dinero y dónde el riesgo? | | | |
| Comercial | ¿Quién está comprando y quién cayendo? | | | |
| Operaciones | ¿Qué está frenando la operación? | | | |
| Compras | ¿Dónde hay sobrecosto y dependencia? | | | |
| Cobranza | ¿Dónde está el dinero vencido y de quién? | | | |
| Gerencia | ¿Qué debo investigar primero? | | | |

**Revisión comercial.** Extraer del reporte los hallazgos reales que un ERP no muestra por sí solo. Formato obligatorio — plantilla con placeholders, los valores se calculan del modelo:

```
[N] clientes concentran [Q monto] de cartera vencida.
[N%] de los SKU generan [N%] de la venta.
[Q monto] de inventario corresponde a productos sin movimiento en [N] meses.
[N] proveedores concentran [N%] de la compra.
El cambio de venta se descompone en [N%] volumen, [N%] precio, [N%] mix.
```

Cada hallazgo debe citar la página y la medida que lo produce. Si un hallazgo no puede rastrearse a una medida, se elimina.

**Gate:** ≥ 5 hallazgos rastreables. Toda pregunta de rol con respuesta "No" está registrada como ítem de iteración.

---

## F8 — ITERACIÓN ACOTADA

Máximo **2 rondas**. Por ronda:

1. Listar las 10 debilidades de mayor impacto detectadas en F6/F7
2. Listar las 5 oportunidades analíticas de mayor impacto no cubiertas
3. Corregir/implementar solo lo que quepa en el presupuesto restante (§4)
4. Re-ejecutar F6
5. Actualizar `docs/powerbi/coverage-review.md`

`coverage-review.md` clasifica **cada capacidad** del `model-exploitation-map.md` como:
`Explotada` · `Parcialmente explotada` · `No explotada` · `No relevante`

No es objetivo visualizar todas las medidas. Es objetivo que ninguna capacidad quede sin evaluar.

Al cerrar la ronda 2: **v1.0 cerrada.** Reportar y detenerse.

---

# 7. VALIDACIÓN DE DAX CONTRA EL ORIGEN

Toda medida nueva P0/P1 lleva un par de archivos:

```
docs/powerbi/qa/dax-tests/
├── GAP-NN.dax    # consulta DAX (EVALUATE) contra el modelo
├── GAP-NN.sql    # consulta equivalente contra dw_grupocresta.oro
└── GAP-NN.md     # resultado esperado, resultado obtenido, tolerancia, fecha
```

Tolerancias:
- Conteos y cardinalidades: **0** de diferencia
- Montos: **≤ 0.5%** por redondeo/tipo de cambio; documentar la causa si se usa el margen
- Ratios y porcentajes: **≤ 0.1 pp**

Fuera de tolerancia = defecto bloqueante. No se avanza de fase.

Si en F0 se determinó que no hay ejecución DAX disponible, la validación se hace exportando el visual a Excel y comparando contra el SQL, y se registra como limitación en `STATE.md`.

---

# 8. PROTOCOLO GIT

- Rama de trabajo: `feature/pbi-product-v1`
- Un commit por fase cerrada y uno por ola de páginas
- Mensaje: `pbi(FN): descripción corta` (ej. `pbi(F5): ola 1 — executive, cartera, home`)
- Antes de la primera modificación al `.Report` o al modelo: `git tag baseline-pre-v1`
- `.gitignore` debe excluir: `*.pbix`, `**/.pbi/cache.abf`, `**/.pbi/localSettings.json`
- **Nunca** hacer commit de credenciales, cadenas de conexión con password, ni exports de datos reales

---

# 9. CUÁNDO DETENERSE Y PREGUNTAR

El agente decide solo cuando la decisión es de diseño, está respaldada por el modelo, no rompe nada existente y cabe en el presupuesto. No pedir confirmación para decisiones menores.

**Detenerse SIEMPRE ante:**

1. Cualquier gate de §2 que falle
2. Cualquier cambio al Semantic Model fuera del plan de remediación
3. Cualquier cambio al DWH, a `oro`, o a objetos de HANA
4. Necesidad de instalar cualquier herramienta
5. Ambigüedad sobre calendario natural vs. fiscal, o sobre tratamiento de moneda extranjera
6. Discrepancia de datos fuera de tolerancia cuyo origen esté en el DWH y no en el DAX
7. Agotamiento de cualquier presupuesto de §4
8. Cierre de cada ola de páginas (checkpoint con capturas)
9. Cualquier situación donde la salida "correcta" requiera asumir un dato que no está en el modelo

Al detenerse: reportar en formato `BLOQUEO: [qué] · REQUIERE: [de quién/qué] · OPCIONES: [A/B]`. No quedarse esperando en silencio ni improvisar una salida.

---

# 10. DEFINICIÓN DE HECHO

Una página está terminada cuando:

- [ ] Cumple su contrato de F3 (todas las preguntas declaradas tienen respuesta visible)
- [ ] Pasa F6.1 con cero defectos
- [ ] Pasa F6.2 con cero discrepancias
- [ ] Fue revisada visualmente sobre capturas reales (F6.3)
- [ ] Sus títulos dinámicos provienen de medidas, no de literales
- [ ] Su navegación de entrada y salida funciona
- [ ] Está commiteada

No cuenta como terminada porque abre sin error. Abrir sin error es el mínimo, no el criterio.

---

# 11. ANTIPATRONES A RECHAZAR

Si el resultado se parece a esto, rediseñar:

- La misma plantilla `KPI · barras · líneas · donut · tabla` repetida en cada página
- Tarjetas de KPI sin comparación ni tendencia
- Tablas usadas como sustituto de análisis
- Donuts con más de 5 categorías
- Páginas sin una pregunta declarada
- Títulos genéricos (`Ventas por mes`)
- Colores sin significado
- Análisis que no conduce a ninguna decisión
- Interacción agregada para demostrar que se sabe agregar interacción
- Páginas creadas para llegar a un número de páginas

---

# 12. PRIMERA ACCIÓN AL LEER ESTE ARCHIVO

1. Crear o leer `docs/powerbi/STATE.md`
2. Ejecutar GATE 0 (§2) completo y reportar cada punto con su comando y salida
3. Si todos pasan: ejecutar **solo F0** y detenerse
4. Si alguno falla: reportar el bloqueo y detenerse

No construir visuales. No crear medidas. No instalar nada.
