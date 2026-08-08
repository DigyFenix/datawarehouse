# Contrato del sistema visual — Grupo Cresta

Cumple §5 del contrato maestro. Se escribe una vez en F3 y **se respeta sin excepción** desde
aquí. Un visual que no cumple este documento es un defecto, no una preferencia.

Tema: `organizaciones/grupocresta/powerbi/theme/grupocresta-theme.json`

---

## 1. Grilla de layout

- Canvas **1280 × 720**, margen exterior **24 px**, gutter **16 px**, unidad vertical **8 px**.
- **12 columnas de 88 px.** El contrato maestro (§5.1) cita 84 px; con margen 24 y gutter 16 esa
  cifra cierra en 1232 px y deja 48 px muertos. `(1280 − 48 − 11×16) / 12 = 88`. Se usa **88**
  para que la grilla cierre exacta en el canvas — la única corrección al contrato, aritmética y
  verificable.

**Posición x de cada columna** (`x = 24 + (n−1) × 104`):

| col | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| x | 24 | 128 | 232 | 336 | 440 | 544 | 648 | 752 | 856 | 960 | 1064 | 1168 |

**Ancho de un bloque de n columnas** = `104n − 16`:

| n | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 12 |
|---|---|---|---|---|---|---|---|---|
| ancho | 88 | 192 | 296 | 400 | 504 | 608 | 816 | 1256 |

**Bandas verticales** (todas múltiplo de 8):

| Banda | y | alto |
|---|---|---|
| Encabezado (título + navegación) | 0 → 72 | 72 |
| KPIs | 88 → 200 | 112 |
| Análisis | 216 → 696 | 480 |
| Pie (frescura del dato) | 700 → 720 | 20 |

Dentro del área de análisis se permiten dos filas de 232 px (216→448 y 464→696) con 16 px de
separación. Toda `y` y todo `height` son múltiplo de 8.

---

## 2. Color

### 2.1 La decisión de fondo: el rojo de la marca **es** el rojo de alerta

Grupo Cresta tiene dos colores oficiales: azul `#0043af` y rojo `#d51c29`. Usar el rojo
corporativo como color de serie chocaría de frente con su lectura universal de "esto está mal".

**Resolución:** el rojo **nunca** identifica una serie. Se reserva para **estado crítico y
negativo**, que es exactamente lo que un rojo debe significar en un tablero — así la marca y la
semántica empujan en la misma dirección en lugar de pelearse. El azul corporativo lleva la
identidad: es el color primario de datos, de encabezados y del chrome.

Medido: `#d51c29` da **5.21:1** sobre blanco (sirve como relleno y como texto) y `#0043af` da
**8.67:1**.

### 2.2 Paleta categórica (identidad de serie)

Orden fijo, asignado en secuencia, **nunca ciclado**. Validado con el validador de la skill
`dataviz` sobre superficie blanca: banda de luminosidad PASS, piso de croma PASS, separación CVD
peor par adyacente **ΔE 9.1** (≥8), piso de visión normal **ΔE 19.6** (≥15).

| Slot | Familia | Hex |
|---|---|---|
| 1 | azul Cresta | `#004ec9` |
| 2 | naranja | `#eb6834` |
| 3 | aqua | `#1baf7a` |
| 4 | ámbar | `#eda100` |
| 5 | magenta | `#e87ba4` |
| 6 | verde | `#008300` |
| 7 | violeta | `#4a3aa7` |
| 8 | cian | `#0093ab` |

> El slot 1 es `#004ec9` y no el `#0043af` exacto de la marca: el corporativo mide OKLCH
> L = 0.424 y la banda de marcas de datos empieza en 0.43. Es el escalón contiguo de la **misma**
> rampa y del mismo tono — indistinguible en una barra, y pasa el gate. El `#0043af` puro se usa
> donde manda la marca: encabezados, chrome, KPI y cabeceras de tabla.

**Relieve obligatorio:** aqua, ámbar y magenta quedan bajo 3:1 sobre blanco. Donde se usen, el
visual lleva **etiquetas de dato visibles** o una tabla equivalente. No es opcional.

**Más de 8 series no existen.** La novena se pliega a "Otros", se factoriza en múltiplos
pequeños, o el visual está mal elegido.

**En dispersión, burbuja y mapa** solo se usan los **3 primeros slots**: en esas formas
cualquier par de marcas puede quedar adyacente y el gate se endurece.

### 2.3 Rampa secuencial (magnitud)

Un solo tono, del azul corporativo, claro→oscuro. El azul de la marca es el escalón 550 de su
propia rampa:

| 100 | 200 | 300 | 400 | 500 | **550** | 600 | 650 |
|---|---|---|---|---|---|---|---|
| `#d6e6ff` | `#8eb8ff` | `#5391ff` | `#0b69ff` | `#004ec9` | **`#0043af`** | `#00348c` | `#00266d` |

En rampas **ordinales** (tramos de antigüedad, clases ABC) no arrancar más claro que `#8eb8ff`,
para que el escalón más claro siga siendo legible contra el fondo.

### 2.4 Par divergente (polaridad)

**Azul ↔ rojo** con gris neutro `#e8e9ec` en el centro — los dos colores de la marca, que además
son el par frío/cálido correcto para "a favor / en contra". Se usa en variaciones contra período
anterior y en desviaciones contra meta.

### 2.5 Estado (reservado)

| Rol | Hex | Uso |
|---|---|---|
| bueno | `#0ca30c` | al día, dentro de meta |
| advertencia | `#eda100` | atención, 1–30 días |
| serio | `#eb6834` | 31–90 días |
| crítico | `#d51c29` | +90 días, vencido, bajo costo |

**Un color de estado nunca es una serie, y una serie nunca usa un color de estado.** Todo estado
viaja con **icono + etiqueta**: el color solo nunca carga el significado.

### 2.6 Reglas duras de color

1. Cero hex escritos a mano en el JSON de visuales: todo sale del tema (§5.5).
2. El color codifica significado — estado, categoría o selección. Nunca decoración.
3. Rojo y verde siempre con un segundo canal: flecha, signo o posición.
4. **El color sigue a la entidad, nunca a su ranking.** Un filtro que cambia cuántas series hay
   no puede repintar las que sobreviven.
5. El texto usa tintas (`#1a1a1a` / `#5b6472` / `#8a9099`), nunca el color de la serie.

---

## 3. Elección de visual

Antes de elegir el tipo se responde, en el contrato de la página:
**pregunta → comparación necesaria → patrón a revelar → visual.**

| Patrón | Visual correcto | Lo que NO se usa |
|---|---|---|
| Contribución al cambio | waterfall | barras apiladas |
| Concentración | Pareto con curva acumulada | donut |
| Composición en el tiempo | área apilada al 100% | varios donuts |
| Magnitud comparada entre categorías | barras horizontales ordenadas | barras verticales con etiquetas rotadas |
| Evolución | línea de 2 px | barras por período |
| Un solo número que manda | tarjeta con comparativo y tendencia | tarjeta sola |
| Relación entre dos medidas | dispersión (máx. 3 series) | eje dual |
| Distribución por dos ejes | matriz de calor | tabla con colores de fondo |

**Nunca un eje dual** (dos escalas y). Dos medidas de escala distinta → dos visuales, múltiplos
pequeños, o indexadas a una base común.

Antipatrones que se rechazan de plano (§11): la plantilla `KPI · barras · líneas · donut · tabla`
repetida en cada página; tarjetas sin comparación ni tendencia; tablas como sustituto de
análisis; donuts de más de 5 categorías; títulos genéricos; páginas sin pregunta declarada.

---

## 4. Formato y locale

- Moneda **GTQ**, formato `Q#,##0` en KPI y ejes; 2 decimales **solo** en detalle de documentos.
- Abreviaturas `K` / `M` en ejes y tarjetas. En Cresta la venta anual está en cientos de
  millones: un eje sin abreviar es ilegible.
- Cultura del modelo: la declarada en el TMDL. **No se cambia**; si difiere de `es-GT`, se
  reporta.
- **Calendario natural** (ejercicio = año calendario). El modelo trae columnas fiscales sin usar;
  toda time intelligence de este reporte es natural, y así queda declarado.
- Moneda de presentación por defecto; el grupo de cálculo `MD_Moneda de análisis` conmuta. Toda
  medida de importe nueva entra en el discriminador `"Q"` del `formatString` o queda fuera del
  conmutador sin avisar.

---

## 5. Texto y narrativa

**Ningún número escrito a mano en la capa visual** (§3.2). Todo número que aparezca en un título,
subtítulo o etiqueta viene de una medida DAX en la carpeta `_Narrativa`.

- Títulos de página: `NN · Nombre Legible`, 15 px Segoe UI Semibold, tinta primaria.
- Títulos de visual: **la pregunta o el hallazgo**, no la descripción del eje.
  Correcto: `Q54.1M de venta anual en riesgo por 94 productos agotados` (desde medida).
  Incorrecto: `Ventas por producto`.
- Subtítulo: la unidad, el alcance y la salvedad (`terceros, sin intercompañía`).
- Prohibido afirmar causalidad (§3.3): *explica, contribuye, concentra, está asociado a*.
  Nunca *causa, provoca, se debe a*, salvo relación contable directa (margen = ingreso − costo).

---

## 6. Nombres en PBIR (§5.2)

- Carpeta de página: `NN-slug-kebab-case` · `displayName`: `NN · Nombre Legible`
- `name` de página y visual: **GUID estable**. Nunca regenerar un GUID existente — rompe
  marcadores, drill-through y navegación.
- Marcadores: `bm_<pagina>_<estado>` · Field parameters: `fp_<dimension>` / `fp_<metrica>`
