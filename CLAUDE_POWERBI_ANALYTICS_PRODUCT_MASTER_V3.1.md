# PULSOCRESTA — POWER BI ANALYTICS PRODUCT
## Instrucción maestra operativa — v3.1.1

> Este archivo es un **contrato de ejecución**, no un manifiesto.
> Cada fase tiene entrada, salida, presupuesto y un gate binario.
> Si un gate no pasa: **DETENERSE y reportar.** No improvisar alrededor del gate.

---

# CHANGELOG v3.1 → v3.1.1 (addendum post-piloto, 2026-08-10)

La página 00 se construyó por código con el flujo completo (validador + Desktop Bridge + MCP) y quedó renderizada con datos reales en 7 iteraciones. De ese piloto salen dos cambios:

1. **§13 nuevo — Playbook de construcción verificado.** El ciclo exacto editar→validar→recargar→recalcular→capturar con sus tiempos, el orden que NO se puede violar (reload y XMLA en paralelo tumban Desktop), y el catálogo de trampas PBIR encontradas y resueltas. F5 lo referencia como procedimiento operativo.
2. **Nota B y §7.1 corregidas.** El lado SQL de §7 SÍ es ejecutable por el agente sin MCP nuevo: `docker exec quilate-postgres psql` contra `dw_grupocresta` con el stack local arriba. La "vía manual" pasa a ser fallback cuando Docker no está disponible.

# CHANGELOG v3.0 → v3.1

Cambios estructurales respecto a v3.0. Cada uno resuelve una incoherencia que habría hecho fallar la construcción de forma silenciosa.

1. **Separación explícita de herramientas (§0.4 nuevo, §3.5, F0, F4, F5).** El MCP `powerbi-modeling` NO construye páginas — solo expone objetos de modelado (tablas, medidas, relaciones, DAX). La construcción de páginas/visuales/layout PBIR la hace el skill `powerbi-report-authoring`, que consume el design brief de F3. v3.0 describía F5 como si el agente escribiera PBIR crudo a mano; eso está corregido.
2. **Canvas unificado a 1280×720 (§5.1, F3, F6.1).** Se resuelve la contradicción con el default FHD 1920×1080 del skill de diseño: ahora el brief de F3 instruye explícitamente el canvas y el validador de F6.1 valida contra el mismo número.
3. **Capacidad de captura reclasificada (F0, F6.3).** Playwright (conectado, 24 tools) y el bridge de Desktop del skill de authoring pueden habilitar captura semi-automática. F0 debe verificarlo con comando real antes de declarar F6.3 como 100% manual.
4. **Validación SQL de §7 marcada como no-automática hoy (§7, F0).** No hay MCP de PostgreSQL conectado. El lado DAX es ejecutable vía `powerbi-modeling`; el lado SQL contra `oro` lo corre el humano y pega el resultado, salvo que se autorice conectar un MCP de Postgres.
5. **GATE 0 §2.4 endurecido.** "Aplicado" no satisface el gate. Exige defecto cerrado = par DAX/SQL dentro de tolerancia (§7). Sin esa evidencia, GATE 0 no pasa.
6. **Presupuesto de medidas derivado, no fijo (§4).** El tope de medidas nuevas se deriva de las P0+P1 de la matriz de F2, no del número arbitrario 40.
7. **Chequeo de integridad de STATE.md (§0.1).** Se cruza lo que STATE.md declara producido contra su existencia real en disco, para no construir sobre un estado falso.

---

# 0. PROTOCOLO DE SESIÓN

## 0.1 Al inicio de CADA sesión

1. Leer este archivo completo.
2. Leer `docs/powerbi/STATE.md`. Si no existe, crearlo con la plantilla de §0.3 en `FASE: F0`.
3. **Chequeo de integridad de STATE.md.** Para cada artefacto que la tabla "Artefactos producidos" declara como `Estado: OK`, verificar que el archivo existe realmente en disco:
   ```bash
   # Por cada ruta declarada en STATE.md como producida:
   test -f "<ruta>" && echo "OK <ruta>" || echo "FALTA <ruta> — STATE.md miente"
   ```
   Si algún artefacto declarado no existe, **DETENER.** STATE.md quedó inconsistente con el repo (probable commit fallido en una sesión anterior). Reportar la discrepancia y no confiar en el estado hasta reconciliarlo.
4. Ejecutar el chequeo de precondiciones (§2). Si falla, detenerse.
5. Anunciar en una línea: fase activa, artefacto objetivo, gate de salida.
6. Ejecutar **una sola fase**. No encadenar fases en una misma sesión.

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
- Medidas nuevas creadas: 0 / <tope derivado en F2; escribir aquí al cerrar F2>
- Rondas de iteración: 0 / 2

## Toolchain (llenar en F0)
- powerbi-modeling (MCP): <conectado? nº tools>
- powerbi-report-authoring (skill): <enabled?>
- powerbi-report-design (skill): <enabled?>
- Captura de pantalla (Nota A): <capaz? cómo>
- SQL contra oro (Nota B): <manual | MCP postgres | no disponible>
- Ejecución DAX: <capaz vía MCP?>
- Canvas del reporte existente: <1280x720 | otro → decisión>
```

**Regla:** `STATE.md` es la única fuente de verdad del progreso. Si el contexto de la sesión y `STATE.md` discrepan, gana `STATE.md`.

## 0.4 Modelo mental de herramientas (LEER ANTES DE CUALQUIER FASE)

Este proyecto usa **dos herramientas distintas con dos trabajos distintos.** Confundirlas es la causa raíz de que un agente intente escribir PBIR crudo a mano — cosa prohibida.

| Herramienta | Tipo | Trabaja sobre | Se usa en | NO hace |
|---|---|---|---|---|
| `powerbi-modeling` | MCP (server) | El **modelo semántico**: tablas, columnas, medidas, relaciones, ejecución DAX (`EVALUATE`) | F1 (lectura), F4 (crear medidas), §7 (validación DAX) | No toca páginas, visuales ni layout |
| `powerbi-report-authoring` | Skill (plugin) | El **reporte PBIR**: páginas, visuales, layout, títulos, tooltips, navegación | F5 (construcción) | No crea ni valida medidas del modelo |
| `powerbi-report-design` | Skill (plugin) | El **design brief**: archetipo, layout, paleta, selección de visual | F3 (produce el contrato de diseño) | No escribe archivos PBIR |

**Flujo correcto de construcción (F3 → F5):**
```
F3: powerbi-report-design  → produce el Design Brief (contrato)
                              ↓  (brief aprobado, canvas 1280×720 declarado)
F5: powerbi-report-authoring → consume el brief y escribe el PBIR
                              ↑  (para medidas que falten: F4 vía powerbi-modeling)
```

**Prohibido:** pedirle al agente "construye la página X" sin un Design Brief de F3 aprobado. Sin brief, el skill de diseño improvisa o asume inputs — inaceptable en un producto comercial. **Prohibido:** escribir JSON de PBIR a mano cuando el skill de authoring está disponible (verificar en F0 que lo está).

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

Los defectos clasificados como **"producen números incorrectos hoy"** deben estar **cerrados con validación**, no solo aplicados.

**Definición de "cerrado" (binaria):** cada defecto crítico tiene su par de prueba `qa/dax-tests/` (DAX + SQL + resultado) con la diferencia dentro de la tolerancia de §7. "Apliqué la corrección en el modelo" **no** satisface este gate. La corrección puede estar aplicada y aun así producir un número distinto al de `oro`; sin la prueba cruzada no se sabe.

Los tres defectos críticos conocidos (falta de `KEEPFILTERS`, filtros de fecha ignorados en ABC/RFM, fallback silencioso del grupo de cálculo de moneda GTQ) deben tener cada uno su prueba pasando.

**Si están aplicados pero no validados:** GATE 0 NO PASA. La primera fase ejecutable es generar esas pruebas (vía `powerbi-modeling` para el DAX; SQL manual según §7), no construir páginas.

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

**Estado real de herramientas (verificar en F0, no asumir):** al momento de escribir v3.1, en el entorno de trabajo ya están instalados y habilitados los plugins `fabric-skills` y `powerbi-authoring` (que incluye `powerbi-report-design`, `powerbi-report-authoring`, `powerbi-report-planning`), y el MCP `powerbi-modeling` aparece conectado con 21 tools contra el proyecto. Esto **ya no es "candidato a evaluar"**, es toolchain presente. F0 debe confirmarlo con comando y salida real (el estado puede haber cambiado entre sesiones).

Repositorios aún en evaluación (no instalar sin autorización):
| Repositorio | Origen | Estado | Uso potencial |
|---|---|---|---|
| `microsoft/skills-for-fabric` | Microsoft | **INSTALADO** (verificar en F0) | report design / authoring / planning |
| `microsoft/powerbi-modeling-mcp` | Microsoft | **CONECTADO** (verificar en F0) | inspección de modelo, DAX, relaciones |
| MCP PostgreSQL para `oro` | — | NO conectado — candidato para §7 lado SQL | validación cruzada DAX↔SQL |
| `data-goblin/power-bi-agentic-development` | Comunidad (Kurt Buhler) | NO instalado | PBIR authoring, review, Deneb |

Cualquier repositorio fuera de esta lista se reporta como sugerencia, no se instala. Conectar un MCP de Postgres (para cerrar el gap de §7) requiere autorización explícita.

## 3.6 Sin datos inventados

Si un dato, dimensión, atributo o medida no existe en el modelo: documentarlo como inexistente. Si podría construirse: documentarlo como oportunidad en `dax-opportunities.md`. Nunca simularlo.

---

# 4. PRESUPUESTOS Y CONDICIONES DE PARADA

Estos límites son duros. Al alcanzarlos, detenerse y reportar, no continuar.

| Recurso | Límite v1.0 |
|---|---|
| Páginas totales | 12 |
| Páginas por ola de construcción | 3 |
| Medidas nuevas totales | **derivado** — ver nota abajo |
| Medidas nuevas por lote (con validación entre lotes) | 10 |
| Visuales por página ejecutiva | 4 – 7 |
| Visuales por página analítica | 6 – 12 |
| Visuales por página de detalle/explorer | sin límite razonable, máx. 15 |
| Rondas de iteración post-review | 2 |

**Tope de medidas nuevas (derivado, no arbitrario):** el límite es el **número de medidas P0+P1 identificadas en la matriz de oportunidad de F2**, con un tope duro de seguridad en **50**. No se fija a priori un número redondo: si F2 arroja 32 medidas P0+P1, el tope es 32; el excedente (P2/P3) queda fuera de v1.0 salvo autorización. Esto evita chocar contra un presupuesto inventado a mitad de F4, y a la vez impide que el alcance crezca sin control. El tope efectivo se escribe en `STATE.md` al cerrar F2.

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

- Canvas: **1280 × 720** px. **Decisión firme** — no es el default del skill.
- Margen exterior: 24 px
- Grilla: 12 columnas, gutter 16 px → ancho de columna = 84 px
- Unidad vertical: 8 px. Toda coordenada `y` y toda `height` son múltiplo de 8.
- Banda de encabezado: y = 0 → 72 px (título de página + navegación)
- Banda de KPIs: y = 88 → 200 px
- Área de análisis: y = 216 → 696 px

Un visual que no cae en la grilla es un defecto, no una preferencia.

**Aviso de conflicto con el skill de diseño (corrige v3.0):** `powerbi-report-design` usa por defecto **FHD 1920×1080** para reportes nuevos. Si se deja actuar por defecto, construirá a 1920×1080 y **todos** los visuales fallarán el validador de F6.1 (que valida contra 1280×720). Por lo tanto:
- El Design Brief de F3 **debe declarar explícitamente** `canvas: 1280x720` como input al skill, no dejar que asuma su default.
- Si el `.Report` existente ya está en otro tamaño (brownfield), el skill preserva el canvas existente. Verificar en F3 el tamaño real del reporte y, si difiere de 1280×720, **DETENER y decidir** (redimensionar con aprobación, o adoptar el tamaño existente y propagarlo al validador). No construir con dos tamaños en conflicto.
- El número de canvas vive en **un solo lugar como fuente de verdad**: este §5.1. F3 (brief) y F6.1 (validador) lo referencian; no lo reescriben con otro valor.

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

La matriz debe distinguir modelado (MCP) de autoría de reporte (skill). No colapsar ambos en "lectura/escritura PBIR".

| Capacidad | Herramienta candidata | Detectada | Verificada (comando) | Gap | Uso previsto |
|---|---|---|---|---|---|
| Lectura TMDL / objetos de modelo | `powerbi-modeling` (MCP) | | | | F1 |
| Escritura de medidas en el modelo | `powerbi-modeling` (MCP) | | | | F4 |
| Ejecución DAX contra el modelo (`EVALUATE`) | `powerbi-modeling` (MCP) | | | | §7 lado DAX |
| Producción de Design Brief | `powerbi-report-design` (skill) | | | | F3 |
| Escritura de páginas/visuales PBIR | `powerbi-report-authoring` (skill) | | | | F5 |
| Validación estructural de PBIR | `validate-report` del plugin / `scripts/validate-pbir.py` | | | | F6.1 |
| Consulta a PostgreSQL `oro` | (ninguna conectada — ver nota B) | | | | §7 lado SQL |
| Reload de Power BI Desktop | bridge de `powerbi-authoring` | | | | F5/F6.3 |
| Screenshot de reporte | bridge de authoring **y/o** Playwright (24 tools) | | | | F6.3 |

**Verificación obligatoria de cada fila:** correr un comando real y pegar la salida. No marcar "Verificada: Sí" por inferencia. Para el MCP: `/mcp list` y una llamada de prueba (ej. listar tablas). Para los skills: confirmar que el plugin está `enabled` y disparar el skill con una tarea trivial. Para Playwright: confirmar los tools disponibles.

**Nota A — captura de pantalla (corrige v3.0):** v3.0 asumía que el agente no puede capturar y hacía F6.3 100% manual. Antes de aceptar eso, **verificar** si el bridge de Desktop del skill de authoring o Playwright pueden tomar la captura del reporte renderizado. Si alguno funciona, F6.3 pasa a semi-automática (el agente captura; el humano juzga legibilidad/jerarquía). Si ninguno funciona contra el render real de Power BI, entonces sí F6.3 es manual — pero eso se **declara con evidencia**, no por defecto.

**Nota B — validación SQL (corregida en v3.1.1):** no hace falta MCP de PostgreSQL. Con el stack local arriba (skill `stack-local`), el agente ejecuta el lado SQL directamente:
```powershell
docker exec quilate-postgres psql -U quilate_admin -d dw_grupocresta -c "<consulta contra oro>"
```
Verificar en F0 que Docker responde (`docker ps` + `pg_isready`); si no está arriba, levantarlo con la skill antes de validar. La vía manual (el humano corre el SQL y pega el resultado) queda como **fallback** cuando Docker no esté disponible en la sesión.

**Gate:** la matriz existe, cada fila "Verificada" cita el comando ejecutado y su salida, y los gaps están listados con la herramienta candidata propuesta (sin instalar). Las notas A y B están resueltas con evidencia, no con supuestos.

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

**Herramienta de construcción:** la escritura del PBIR la ejecuta el skill **`powerbi-report-authoring`**, consumiendo el Design Brief aprobado de F3 (ver §0.4). El agente **no escribe JSON de PBIR a mano** mientras el skill esté disponible (verificado en F0). El MCP `powerbi-modeling` no participa en F5 salvo para resolver el nombre exacto de una medida o campo, ejecutar el recálculo tras cada reload y validar cifras; no construye visuales.

**Procedimiento operativo:** el ciclo de construcción por página está en **§13 (playbook verificado)** — seguirlo en ese orden exacto; las trampas PBIR de §13.4 se revisan ANTES de escribir cada tipo de visual, no después de que falle.

**Precondición de F5:** existe un Design Brief de F3 aprobado, con `canvas: 1280x720` declarado y layout_contract por página. Sin brief, no se entra a F5 (§0.4).

**Olas de 3 páginas.** Al cerrar cada ola: F6 completa sobre esas 3 páginas, commit, y checkpoint humano (§9) antes de la siguiente ola.

Orden de construcción recomendado:
1. Ola 1: `01 Executive`, `09 Cartera`, `00 Home` — Cartera primero por ser el caso de mayor valor demostrable inmediato
2. Ola 2: ventas y drivers
3. Ola 3: clientes y productos
4. Ola 4: inventario, compras, capital de trabajo, explorer

Por página, el skill de authoring debe producir (el agente lo instruye y valida, no lo teclea):
1. La carpeta de página y su `page.json` con el `displayName` y ordinal correctos
2. Los visuales según las coordenadas del layout_contract de F3
3. El enlace de campos y medidas **referenciando por nombre exacto del modelo** (resolver vía `powerbi-modeling` si hay duda del nombre)
4. Títulos dinámicos con medidas `_Narrativa` (nunca literales — §3.2)
5. Tooltips que aporten información **no visible** en el visual (LY, variación, participación, ranking, margen), no repetir lo mostrado
6. Interacciones cruzadas y drill-through
7. Tras escribir: ejecutar el validador estructural (F6.1) y, si el bridge está disponible (F0/Nota A), recargar Desktop y capturar

**Gate por ola:** las 3 páginas abren en Power BI Desktop sin error, el validador estructural pasa, no hay referencias a campos inexistentes, y hay captura de cada página (si F0 confirmó capacidad de captura).

---

## F6 — QA

Tres capas. Las tres son obligatorias.

### F6.1 QA estructural (automatizable — el agente SÍ puede hacerlo)

Script `scripts/validate-pbir.py` que recorre `definition/pages/` y verifica:

- [ ] Todo visual dentro del canvas **definido en §5.1** (1280×720). El valor NO se hardcodea en el script en dos sitios: se lee de una constante única `CANVAS_W, CANVAS_H` al inicio, coherente con §5.1. Si §5.1 cambia, cambia una línea.
- [ ] `x`, `y`, `width`, `height` múltiplos de 8
- [ ] Cero solapamientos entre visuales de la misma página
- [ ] Cero colores hex literales en configs (todo vía tema)
- [ ] Todo campo referenciado existe en el modelo (validar contra el inventario de F1 o consultando `powerbi-modeling`)
- [ ] Todo `name`/GUID es único y no duplicado
- [ ] Toda página referenciada por un botón de navegación existe
- [ ] Todo target de drill-through existe y tiene los campos de drill declarados
- [ ] Cero visuales sin título o con el título autogenerado por defecto
- [ ] Cero literales numéricos en strings de título/subtítulo (regex sobre dígitos)

Salida: `docs/powerbi/qa/structural-qa.md` con lista de defectos. **Gate: cero defectos.**

**Nota:** si el plugin de authoring expone su propio `validate-report`, correrlo primero (valida el esquema PBIR nativo) y usar `validate-pbir.py` para las reglas específicas de este contrato (grilla de 8px, canvas, literales numéricos, tema). Los dos son complementarios, no redundantes.

### F6.2 QA de datos

Por página:
- [ ] Totales cuadran contra consulta SQL directa a `oro` (§7)
- [ ] Time intelligence: verificar YTD, YoY y móviles en un mes de cierre conocido
- [ ] Verificar comportamiento en el mes en curso (parcial) — causa habitual de YoY engañoso
- [ ] Verificar filas sin coincidencia en relaciones (miembros en blanco)
- [ ] Verificar duplicados y granularidad en visuales de detalle
- [ ] Verificar rankings y acumulados en presencia de empates

Salida: `docs/powerbi/qa/data-qa.md`. **Gate: cero discrepancias fuera de tolerancia (§7).**

### F6.3 QA visual — JUICIO HUMANO OBLIGATORIO

**El juicio final de legibilidad, jerarquía visual y densidad percibida es del humano.** El agente no lo sustituye. Lo que cambia respecto a v3.0 es **de dónde salen las capturas**:

- **Si F0 confirmó capacidad de captura** (bridge de authoring o Playwright, Nota A): el agente **genera las capturas** recargando Desktop y capturando cada página, las guarda en `docs/powerbi/qa/screenshots/`, y las adjunta a su análisis. El humano las revisa y aprueba/rechaza. El agente puede pre-señalar problemas evidentes (texto truncado, solapamiento visible, contraste bajo) pero **no puede auto-aprobar**.
- **Si F0 NO confirmó captura**: el agente produce `visual-qa-checklist.md` y **solicita las capturas al usuario**, como en v3.0.

Con las capturas (propias o del usuario), evalúa: jerarquía, contraste, densidad, consistencia entre páginas, truncamiento de texto, formatos de eje.

**Nunca marcar F6.3 como aprobada sin capturas revisadas por un humano.** Que el agente las genere no lo autoriza a aprobarlas solo.

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

## 7.1 Quién ejecuta cada lado (estado real del toolchain)

**Lado DAX (`GAP-NN.dax`):** ejecutable por el agente vía `powerbi-modeling` (`EVALUATE`), con Power BI Desktop abierto en el modelo. El agente corre la consulta y registra el resultado obtenido.

**Lado SQL (`GAP-NN.sql`):** ejecutable por el agente vía Docker con el stack local arriba (ver F0, Nota B):
```powershell
docker exec quilate-postgres psql -U quilate_admin -d dw_grupocresta -c "<contenido de GAP-NN.sql>"
```
- **Vía Docker (default):** el agente corre ambos lados (DAX vía MCP, SQL vía psql) y escribe el `GAP-NN.md` completo. Precondición: Docker arriba (`pg_isready` OK); si no, levantarlo con la skill `stack-local`.
- **Vía manual (fallback):** si Docker no está disponible en la sesión, el humano ejecuta el `.sql` contra `oro` y pega el resultado. El agente **no inventa** el resultado SQL ni marca la prueba como pasada sin él.

**Regla dura:** un `GAP-NN.md` que declare la prueba "pasada" sin un resultado SQL real (manual o vía MCP) es una violación de §3.4 (afirmar capacidades no verificadas) y de §3.6 (sin datos inventados). La celda de resultado SQL nunca se rellena por estimación.

## 7.2 Fallback sin ejecución DAX

Si en F0 se determinó que tampoco hay ejecución DAX disponible, la validación del lado del modelo se hace exportando el visual a Excel y comparando contra el SQL, y se registra como limitación en `STATE.md`.

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

1. Leer §0.4 (modelo mental de herramientas) — es lo que evita el error de escribir PBIR a mano.
2. Crear o leer `docs/powerbi/STATE.md` y correr el chequeo de integridad (§0.1.3): que lo declarado como producido exista en disco.
3. Ejecutar GATE 0 (§2) completo y reportar cada punto con su comando y salida. Recordar que §2.4 exige defectos **validados**, no solo aplicados.
4. Si todos pasan: ejecutar **solo F0** (toolchain audit con comandos reales, resolviendo Notas A y B) y detenerse.
5. Si alguno falla: reportar el bloqueo en formato `BLOQUEO / REQUIERE / OPCIONES` (§9) y detenerse.

No construir visuales. No crear medidas. No instalar nada.

---

# 13. PLAYBOOK DE CONSTRUCCIÓN — CICLO VERIFICADO (piloto página 00, 2026-08-10)

Este procedimiento no es teoría: es el ciclo con el que la página 00 quedó construida y
renderizada con datos reales, con cada paso confirmado contra su modo de fallo. Seguirlo en
este orden. Cada desviación listada aquí ya costó una iteración una vez; no volver a pagarla.

## 13.1 Precondiciones de la sesión de construcción (una vez por sesión)

1. **CLIs presentes:** `powerbi-report-author --version` y `powerbi-desktop --version`. Si
   faltan: `npm install -g @microsoft/powerbi-report-authoring-cli@latest @microsoft/powerbi-desktop-bridge-cli@latest`.
2. **Datos disponibles para refresh:** `docker ps` → si el daemon no responde, arrancar Docker
   Desktop y esperar; luego `docker exec quilate-postgres pg_isready -U quilate_admin -d quilate_control`.
   Sin Postgres arriba, el modelo abre sin datos ("--" en todos los KPI) y el juicio visual no vale.
3. **Desktop cerrado antes de la primera escritura masiva de archivos** (`powerbi-desktop status`
   → `not_connected`), o al menos `hasUnsavedChanges: false`. Nunca escribir el `.Report` con
   cambios sin guardar en Desktop (B6).

## 13.2 El ciclo por página (editar → validar → recargar → recalcular → capturar)

```
1. EDITAR    Generador Node determinista por página (patrón: consumo/powerbi/generar_pagina_00.js).
             GUIDs fijos hardcodeados — re-ejecutar produce archivos idénticos. Nunca regex ni
             ConvertTo-Json sobre visual.json.
2. VALIDAR   powerbi-report-author validate <ruta absoluta al .Report>
             Gate: errorCount = 0. El warning PBIR_SCHEMA_UNREACHABLE (sin red al schema remoto)
             es aceptable — pero implica que la validación de schema NO corrió: una propiedad
             inválida puede colarse igual (le pasó a columnProperties). El gate real es el paso 3.
3. RECARGAR  powerbi-desktop reload --pid <pid> --wait-seconds 120
             Si Desktop no está abierto: powerbi-desktop open "<ruta>.pbip" y ESPERAR el bridge
             en loop (status cada 10s; el modelo de 4.6M filas tarda 1-3 min).
4. RECALCULAR (obligatorio tras CADA reload) El reload re-aplica el TMDL y deja los objetos
             calculados pendientes → banners "Actualizar ahora" que empujan el canvas y ensucian
             el screenshot. Vía MCP powerbi-modeling: RefreshWithXMLA refreshType=Calculate.
             Full solo si el modelo no tiene datos (primera apertura de la sesión).
5. CAPTURAR  powerbi-desktop screenshot <pageId> --pid <pid> --output <png>
             LEER el PNG de verdad (no asumir). Contra el contrato F3: posiciones, colores del
             tema, textos de medidas, totales, estados.
6. Defecto encontrado → volver a 1. Página limpia → siguiente página.
```

**Reglas duras del ciclo:**

- **Serializar SIEMPRE reload y XMLA.** Un reload y un RefreshWithXMLA simultáneos tumbaron
  Desktop en el piloto. Uno termina, el otro empieza.
- **El puerto XMLA cambia** al reabrir Desktop (y a veces tras reload): reconectar con
  `ListLocalInstances` + `Connect` antes de cada operación XMLA si hubo reload/reapertura de por medio.
- **"Report canvas capture metadata is not ready. Clip=...,0"** = hay un modal bloqueando o la
  vista no es el lienzo. Diagnóstico: captura de pantalla completa del sistema. Si el modal es
  *"El informe tiene problemas que no se pudieron resolver"*, el detalle cita archivo y propiedad
  inválida exacta: corregir el archivo primero, cerrar el modal con "Continuar", reload.
- **Si el humano está usando la máquina** (ventanas activas ajenas en la captura de diagnóstico):
  prohibido robar foco, mover mouse o enviar teclas. El bridge captura en segundo plano sin foco.
- **Los banners de Desktop** (autorrecuperación, actualizar) no son defectos del reporte: el de
  recálculo lo quita el paso 4; el resto los cierra el humano.

## 13.3 Refresh de datos vía MCP (sin tocar Desktop)

1. `ListLocalInstances` → tomar el puerto de la instancia `PBIDesktop` del archivo correcto.
2. `Connect` con `data source=localhost:<puerto>`.
3. `RefreshWithXMLA refreshType=Full` (datos, 4.6M filas ≈ 2-4 min) o `Calculate` (solo objetos
   calculados, segundos).
4. Verificar con un `EVALUATE ROW(...)` que las cifras ancla responden (ej. `[Ventas netas]` =
   402,294,765.80 al corte 2026-08-08) antes de capturar.

El refresh vive en la memoria de la instancia: si Desktop se cierra sin guardar, se pierde y se
repite. Guardar el archivo en Desktop es decisión del humano (reescribe PBIR — B6).

## 13.4 Trampas PBIR encontradas y resueltas (revisar ANTES de escribir cada visual)

| # | Trampa | Síntoma | Resolución verificada |
|---|---|---|---|
| 1 | `columnProperties` no existe a nivel `visual` | Modal "El informe tiene problemas" al abrir; canvas bloqueado | El rename de encabezados NO se hace en el reporte: alias/displayName de la columna en el TMDL (vía `generar_pbip.py`), o aceptar el nombre físico |
| 2 | Fondo blanco imborrable en `cardVisual` | Caja blanca aunque VCO `background.show=false` y `fillCustom` apagado | El fondo del card moderno es **`layout.backgroundShow`** (objeto `layout`, selector `default`). Apagarlo ahí |
| 3 | Formato ignorado en visuales con estados (`actionButton`, `pageNavigator`) | `outline show=false` con selector no surte efecto; borde gris grueso persiste | **Dual-entry obligatorio**: una entrada SIN selector + una por cada estado (`default`, `hover`, `selected`) |
| 4 | Total de matrix muestra el agregado global | Fila "Total" con el MAX inflado (03/07/2027 — defecto D1 en la cara de la página de confianza) | `subTotals` con `rowSubtotals:false, columnSubtotals:false` en una entrada **SIN selector** (las entradas con selector `Row`/`Column` solas no bastan) |
| 5 | Texto de medida en la banda ("tarjeta de medida") | textbox dinámico renderiza el pie pero puede no renderizar el título | Dos vías verificadas: textbox dinámico (`values.expr` + run con `propertyIdentifier`) para texto pequeño; `cardVisual` transparente (trampa 2 aplicada, `label.show=false`, `fontColor` explícito) para títulos. El subrayado del valor dinámico es solo del modo edición de Desktop |
| 6 | Tema con propiedades inválidas que Desktop ignora en silencio | El validador acusa ~15 errores en un tema que "funcionaba" | El registro exige `.json` en `customTheme.name`, `resourcePackages.name` y `path`, y el `name` interno del archivo IGUAL con `.json`. El tema vive en 2 copias (fuente en `theme/` + `StaticResources/RegisteredResources/`) — editar la fuente y copiar, siempre sincronizadas |
| 7 | Altura insuficiente en `cardVisual` | Valor recortado o invisible | Calcular antes: `render(fontSize)=ceil(fs×1.5)`; el label reserva ≥18px AUNQUE esté oculto; paddings de `padding` + `layout` + VCO suman. Para tarjetas de 72px: paddings 4/4, value ≤16 |
| 8 | GUIDs regenerados | Navegación/bookmarks rotos | GUIDs fijos en el generador; para páginas que existieron antes, reutilizar el GUID histórico (`git log` del `.Report`) |

## 13.5 Consultas de metadatos antes de escribir (no adivinar)

- Tipo de visual y roles: `powerbi-report-author catalog describe <tipo>` (el rol de `cardVisual`
  es `Data`, nunca `Fields`; tabla plana = `tableEx`, matrix = `pivotTable`).
- Propiedades y selectores: `formatting describe-object <tipo> <objeto>` — respetar `_selectorHint`.
- ¿No sabés en qué objeto vive una propiedad?: `formatting search <tipo> "<regex>"` (así se
  encontró `layout.backgroundShow`, trampa 2).
- El `$schema` de cada archivo nuevo se copia de uno existente del mismo tipo en el mismo
  reporte (hoy: `visualContainer/2.11.0`).
