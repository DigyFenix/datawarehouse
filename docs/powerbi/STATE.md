# STATE — Quilate Analytics · Power BI Product

FASE_ACTUAL: F5 (construcción MANUAL por Edwin — el modo de ejecución del contrato cambió, ver decisión 15)
ULTIMA_ACTUALIZACION: 2026-08-09 (sesión 23)
GATE_ANTERIOR: PASA (F1–F3 cerradas; F4 lote 1 cerrado y validado contra el motor)

> **CAMBIO DE RUMBO (2026-08-08, decisión de Edwin):** la ola 1 se generó completa por código
> (PBIR, 3 páginas, 55 visuales) y Edwin la abortó tras verla en Desktop — tablas rotas, botones
> vacíos, estándar visual insuficiente. **Edwin construye los dashboards a mano en Desktop; el
> agente se queda con el modelo, la guía y la validación.** Las páginas generadas se retiraron
> (recuperables en git `f01c0cd`); el reporte quedó con una página vacía y **el tema de marca ya
> registrado**. Los contratos de F3 siguen siendo la guía de QUÉ construir; el gate F6.1
> estricto queda como opción del validador (`--gate-f61`), no como exigencia a las páginas
> manuales. F6.2 (cifras contra el motor vía MCP) sigue vigente y es del agente.

> **Datos bajo el modelo, al 2026-08-08:** Grupo Cresta refrescado end-to-end (4.66M filas,
> `dbt build` 195/195, cuadre 70/70 sin desvíos) y PBIP regenerado — 36 tablas de datos /
> 98 relaciones / 294 medidas, TMDL válido. F1 arranca sobre datos vigentes, no de hace una
> semana. Iron Network queda sin refrescar (es un comando; ver `.claude/SESSION.md`).

> Fuente de verdad del progreso. Si el contexto de una sesión y este archivo
> discrepan, gana este archivo (§0.3 del contrato).

## GATE 0 — precondiciones duras (§2)

| # | Precondición | Resultado | Evidencia |
|---|---|---|---|
| 2.1 | Formato PBIR | **PASA** | `definition/pages/` con subdirectorio por página + `pages.json`; `report.json` es config global (2 975 B, sin `sections` ni `visualContainers`) → no es legacy |
| 2.2 | Formato TMDL | **PASA** | 47 archivos `.tmdl`, ningún `model.bim` |
| 2.3 | Baseline de auditoría | **PASA** | §2.3 autoriza localizarlo y registrar la ruta real: está en `docs/powerbi/` (`inventario-modelo.md`, `fase1-keepfilters.md`, `fase6-diseno.md`), no en `docs/powerbi/audit/` |
| 2.4 | Remediación de defectos numéricos | **PASA** | El defecto de granularidad de las clasificaciones (fase6-diseno.md) se corrigió con la Opción B recomendada: `DM_Año de clasificación` existe en el modelo y el ABC quedó regranulado a (empresa, año, entidad) |
| 2.5 | Tema corporativo | **PASA** | `consumo/powerbi/theme/quilate-theme.json` — creado con autorización explícita de Edwin como tema genérico del producto, a sustituir por el de cada sociedad |
| 2.6 | Git limpio | **PASA** | `git status --porcelain` sin salida |

**Veredicto: GATE 0 PASA.**

## Artefactos producidos

| Artefacto | Ruta | Fase | Estado |
|---|---|---|---|
| Estado del producto | `docs/powerbi/STATE.md` | — | vigente |
| Tema del producto | `consumo/powerbi/theme/quilate-theme.json` | GATE 0 | creado, JSON válido |
| Matriz de capacidades | `docs/powerbi/tool-capability-matrix.md` | F0 | cerrada |
| Mapa de explotación analítica | `docs/powerbi/model-exploitation-map.md` | F1 | cerrado — 43/43 tablas |
| Matriz de oportunidad | `docs/powerbi/analytics-opportunity-matrix.md` | F2 | cerrada — 32 filas, 11 P0 |
| Arquitectura del reporte | `docs/powerbi/report-architecture.md` | F3 | cerrada — 12 páginas |
| Contrato del sistema visual | `docs/powerbi/contracts/sistema-visual.md` | F3 | cerrado |
| Convención de nombres | `docs/powerbi/contracts/naming-conventions.md` | F3 | cerrada |
| Tema de Grupo Cresta | `organizaciones/grupocresta/powerbi/theme/grupocresta-theme.json` | F3 | creado con la paleta oficial |

## Decisiones tomadas

| # | Decisión | Justificación | Fase |
|---|---|---|---|
| 1 | El `version: "1.0"` de `definition.pbir` NO se interpreta como formato legacy | Ese campo versiona el archivo `.pbir`, no el formato del reporte. La prueba sustantiva —`definition/pages/` con carpeta por página y `pages.json`— se cumple, y el `report.json` no contiene páginas | GATE 0 |
| 2 | El baseline es `docs/powerbi/inventario-modelo.md`, con las cifras REALES: **43 tablas · 662 columnas · 294 medidas · 98 relaciones** | El contrato cita 37/595/180/93, de una versión anterior del modelo. §2.3 prohíbe re-auditar y autoriza registrar la ruta real; construir sobre cifras viejas llevaría a decisiones de cobertura equivocadas | GATE 0 |
| 3 | El tema es del PRODUCTO, no del cliente: `quilate-theme.json` | Edwin autorizó un tema genérico ahora y el de cada sociedad después. Se deriva de los tokens que ya usan los portales, así que tableros y portal se ven de la misma familia | GATE 0 |
| 4 | No se instala ningún MCP ni herramienta **por iniciativa propia** | §3.5. Los gaps se reportan con su candidato y se espera autorización | F0 |
| 5 | Se instala `@microsoft/powerbi-modeling-mcp` **con autorización explícita de Edwin** | Estaba en la lista blanca de §3.5. Elimina el ida y vuelta manual de validación DAX, pero NO elimina la dependencia de Power BI Desktop: el MCP habla XMLA con la instancia de Analysis Services que levanta Desktop al abrir el archivo | F0 |
| 6 | El MCP se usa como **lectura y validación**, no como vía de cambio del modelo | Arranca en modo `ReadWrite` y el propio paquete advierte que se respalde el modelo semántico. El modelo se genera con `generar_pbip.py` (reproducible, versionado); un cambio escrito por XMLA se perdería en la siguiente regeneración y además convive con visuales hechos a mano | F0 |
| 7 | El trabajo del contrato sigue en `master`, no en `feature/pbi-product-v1` (§8) | F0 ya se cerró y commiteó en `master` (`8b94142`, `be3e16f`, `d411162`) y el repo trabaja así. Abrir la rama ahora separaría F0 de F1 sin ganancia. Se conserva el resto del protocolo: un commit por fase, mensaje `pbi(FN): …` | F1 |
| 8 | El departamento queda **NULL** cuando el código de OCST es ambiguo y no hay país que lo desempate | Es preferible el dato ausente al departamento equivocado: el campo alimenta un mapa, y un municipio mal ubicado es un error visible que destruye la confianza en el tablero completo | F1 |
| 9 | Las 12 dimensiones de Oro sin test de unicidad lo reciben ahora | La dimensión ocupa el lado *uno* de sus relaciones: una clave repetida rompe el refresco de Power BI mientras `dbt build` pasa en verde. Detectarlo en el pipeline es la única ubicación útil del control | F1 |
| 10 | El calendario deja de ser fijo (2020→2032) y pasa a **rango dinámico**: 3 años atrás → última fecha real del modelo + 1 mes (mínimo, el cierre del año en curso) | Decisión de Edwin. Un calendario que se extiende seis años al futuro ensucia el segmentador y —lo grave— convierte `MAX(fecha)` en una trampa silenciosa. El extremo futuro se calcula del dato porque hay fechas por delante que son operación normal: vencimientos, entregas comprometidas (hasta diciembre) y la proyección de caja. Un corte a "mes actual + 1" dejaría el backlog incompleto | F4 |
| 11 | Las fechas fuera del calendario van al miembro **No definido**, no quedan huérfanas | Macro `clave_tiempo`. En Cresta hay 149 partidas de cartera con vencimiento anterior a 2023 (Q4.14M, la más vieja de 2017). El saldo sigue sumando y el aging sigue correcto porque se calcula sobre `dias_vencido`, no sobre el calendario | F4 |
| 12 | El generador **conserva** lo que Desktop migra al guardar: `definition.pbir`, `definition.pbism`, el `.pbip` y el `compatibilityLevel` (que es un piso, nunca baja) | Reescribía los cuatro con valores de una versión anterior del formato. El `compatibilityLevel` caía de 1606 a 1567 —degradar el nivel rompe cualquier medida que use funciones del nivel nuevo— y degradar el `.pbir` es la misma clase de cambio de formato que ya borró los visuales dos veces (B6). Verificado idempotente: segunda corrida sin diff | F4 |
| 13 | Los importes de las medidas de narrativa se abrevian K/M y su símbolo sale del token `@SIM@`, nunca de una `"Q"` literal | §4 del contrato visual exige abreviatura en tarjetas (la venta anual de Cresta está en cientos de millones). El token lo sustituye `aplicar_moneda` **siempre**, también en GTQ: `aplicar_moneda` solo alcanzaba el `formatString`, así que una `"Q"` escrita dentro del DAX habría llegado intacta a un tenant en dólares | F4 |
| 14 | El texto narrativo **no conmuta** con `MD_Moneda de análisis`: siempre habla en moneda de presentación | Una medida de texto ya formateó el importe cuando el grupo de cálculo actúa, así que cae en el fallback `SELECTEDMEASURE()` y devuelve el texto tal cual. Es correcto y predecible, pero al leer un visual en "Moneda original" el título sigue en moneda de presentación. Se declara aquí en vez de disfrazarlo | F4 |
| 15 | **Edwin construye los dashboards a mano; el agente no genera páginas** | Decisión de Edwin (2026-08-08) tras ver la ola 1 generada: «mejor tú te encargarás del modelo y yo de construir los dashboards». Es la segunda vez que un intento de generación visual no alcanza su estándar (la primera: `generar_reporte.py`, 2026-08-02). `generar_paginas.py` retirado del repo | F5 |
| 16 | El gate F6.1 estricto (grilla de 8, solapes, hex, dígitos) pasa a ser **opcional** en el validador (`--gate-f61`) | Esas reglas existen para páginas generadas; exigirle múltiplos de 8 a un visual arrastrado a mano en Desktop haría fallar cada corrida e inutilizaría el validador. Las reglas que rompen el reporte de verdad (referencias, esquema, ids, navegación, customTheme) corren siempre | F5 |
| 17 | El KPI global de frescura es **`Dato completo hasta`**, nunca `Último dato del ERP` | Verificado en render real: el MAX crudo mostraba 03/07/2027 (las tasas futuras de tipos de cambio). `Último dato del ERP` solo sirve POR DOMINIO en la tabla de frescura. Y `Dominios desactualizados` lleva `+ 0`: la tarjeta de confianza no puede decir «(En blanco)» | F5 |

## Bloqueos abiertos

| # | Bloqueo | Requiere de | Desde |
|---|---|---|---|
| B4 | ~~Sin ejecución DAX~~ **RESUELTO**: el MCP estaba instalado pero **no conectaba** — se registró sin el argumento `--start`, y sin él el wrapper imprime un banner y hace `Console.ReadKey()`, que revienta con stdin redirigido (`-32000: Connection closed`). Re-registrado como `npx -y @microsoft/powerbi-modeling-mcp@latest --start` → conecta. Queda la dependencia real: el modelo abierto en Power BI Desktop para que exista motor XMLA | Edwin: abrir `organizaciones/grupocresta/powerbi/PulsoCresta.pbip` cuando toque validar | 2026-08-08 |
| B5 | Sin render del reporte: F6.3 depende de capturas | Edwin, al cerrar cada ola de páginas (ya previsto en §9.8) | 2026-08-08 |
| B6 | **Power BI Desktop borró los visuales del `.Report` dos veces** (PBIR desactivado la primera; caché de sesión la segunda). Restaurados desde git ambas veces. Con la decisión 15 el riesgo baja: el agente ya no escribe páginas; solo `generar_pbip.py` toca el proyecto (nunca los visuales) y sigue exigiendo Desktop cerrado. `git status` antes de commitear sigue vigente — ahora protege el trabajo manual de Edwin | Disciplina de trabajo | 2026-08-08 |

## Presupuesto consumido

- Páginas construidas: **0 / 12** (las 12 tienen contrato en `report-architecture.md`; la
  construcción es de Edwin desde la decisión 15)
- Medidas nuevas creadas: **22 / 40** — GAP-01 (3) + `_Fecha ancla móvil` (auxiliar) +
  GAP-03 (12) + 5 alertas narrativas + `Dato completo hasta` (antes `_Dato más rezagado`,
  promovida a visible). El modelo pasó de 294 a **316 medidas**
- Rondas de iteración: 0 / 2

## F2 y F3 — cerradas (2026-08-08)

| Fase | Gate | Resultado |
|---|---|---|
| F2 | ≥25 filas con pregunta de negocio, P0 ≤ 12 | **PASA** — 32 filas, 11 P0 |
| F3 | Contrato por página con coordenadas, 100% de P0, contratos de §5 escritos | **PASA** — 12 páginas, 11/11 P0, 2 contratos |

## F4 — en curso

| GAP | Estado | Validación |
|---|---|---|
| GAP-01 · eje de vencimiento (3 medidas) | **en el TMDL** (regenerado 2026-08-08, sesión 23) | DAX `19,447,201.9301` vs SQL `19,447,201.93` → **0.0000%** (tolerancia 0.5%) |
| GAP-03 · narrativa (12 medidas) | **ejecutadas contra el motor** (2026-08-08) | las 12 devuelven texto; cifras al centavo contra SQL (tabla abajo). Un defecto de formato encontrado y corregido |
| GAP-02 / GAP-04 / GAP-05 / GAP-07 | pendientes (olas posteriores) | — |

### GAP-03 · las 12 medidas del lote 1

Carpeta `_Narrativa` en la tabla cuyo dato narran. Cubren el chrome común y las tres páginas de
la ola 1; ninguna página de la ola 1 necesita ya un número escrito a mano (§3.2).

| Medida | Tabla | Para |
|---|---|---|
| `Período activo` | DM_Calendario | los 3 títulos de página |
| `Pie de frescura` | FC_Estado de carga | banda del pie, común a las 12 |
| `Título de Inicio` | FC_Estado de carga | 00 |
| `Título de Dirección` | FC_Ventas | 01 |
| `Subtítulo del ritmo del mes` | FC_Venta diaria | 01, visual 5 |
| `Subtítulo del ejercicio` | FC_Ventas | 01, visual 6 |
| `Subtítulo de focos de la semana` | FC_Ventas | 01, visual 7 |
| `Subtítulo de aporte por sociedad` | FC_Ventas | 01, visual 8 |
| `Título de Cartera y cobranza` | FC_Cartera por cobrar | 09 |
| `Subtítulo del aging de terceros` | FC_Cartera por cobrar | 09, visual 5 |
| `Subtítulo de la agenda de cobro` | FC_Cartera por cobrar | 09, visual 6 (GAP-01) |
| `Subtítulo de tendencia de cobranza` | FC_Cartera cobrar histórico | 09, visual 8 |

**Decisión de contenido:** el subtítulo de la tabla de alertas **cuenta focos, no suma importes**.
Venta en riesgo, margen perdido, saldo vencido y backlog son cifras de distinta naturaleza; un
total que las agregue se ve autoritario y nadie puede reconstruirlo. Es la trampa fácil de un
título ejecutivo y queda prohibida en este lote.

### Tres defectos que destapó escribir la narrativa

Escribir un título obliga a mirar qué devuelve la medida cuando nadie ha tocado un segmentador.
Los tres son la misma familia que el ancla móvil de la sesión 22: el calendario llega al futuro
y las medidas que se anclan al contexto de fechas caen en un tramo vacío.

| # | Defecto | Qué mostraba | Corrección |
|---|---|---|---|
| D1 | `Último dato del ERP` es `MAX` sobre **todos** los dominios | El pie de frescura habría dicho *"Dato del ERP al 3 de julio de 2027"* — lo fija `tipos_cambio`, que trae tasas hasta 2027-07-03, y `contabilidad`, con asientos hasta 2026-08-31 | Medida auxiliar `_Dato más rezagado` = `MINX` sobre el `MAX` **por dominio** → **2026-08-08**, la respuesta correcta. El máximo por dominio ignora a la sociedad que no operó; el mínimo entre dominios encuentra el eslabón débil. Sin cablear nombres de dominio |
| D2 | `Proyección de cierre de mes` sin filtro de mes | ≈**Q9.8M** contra una venta mensual real cercana a Q50M: repartía la venta de toda la historia entre todos los días hábiles del calendario. Número plausible y falso, y es **KPI de la página 01** | Guarda `DISTINCTCOUNT(anio_mes) <> 1 → BLANK()`. Se calla en vez de mentir; el subtítulo dice que hay que elegir un mes |
| D3 | **No hay año anterior en el modelo** | Oro arranca el 2026-01-01 (regla de corte). `Ventas acumuladas año anterior` es BLANK **siempre**, y el subtítulo habría quedado *"… · contra del año anterior"* | El subtítulo declara *"sin año anterior cargado para comparar"*. **Pero el visual 6 de la página 01 —dos series, año contra año anterior— no se puede construir como está en el contrato F3** |

**D3 no es un defecto de código:** el contrato de la página 01 asumió una historia que el corte de
datos no carga. **Resuelto por Edwin (2026-08-08):** el visual 6 pasa a ser la serie mensual del
año en curso con media móvil de 3 meses — lo que el dato sostiene. **No se amplía la regla de
corte** para conseguir el comparativo; vuelve solo cuando haya un ejercicio cerrado de historia.
Contrato corregido en `report-architecture.md`; O-18 queda parcialmente cubierto.

Quedan **15 medidas de acumulado** (`TOTALYTD` / `TOTALMTD` / `TOTALQTD`) con el mismo anclaje.
Con el período abierto devuelven **BLANK**, no una cifra falsa — es honesto aunque inútil, así que
no se tocaron. Se revisan al construir la página que use cada una.

### Ejecución contra el motor DAX (2026-08-08, PBIP abierto en Desktop)

Primera vez que las medidas de narrativa se ejecutan. Las 12 devuelven texto y **D1 quedó
confirmado en vivo**: `_Dato más rezagado` = **08/08/2026** contra `Último dato del ERP` =
**03/07/2027**.

| Medida | DAX | SQL contra `oro` | Desvío |
|---|---|---|---|
| `Ventas netas` | 402,294,765.7999 | 402,294,765.80 | **0.0000%** |
| `Ventas a terceros` | 287,308,093.4869 | 287,308,093.49 | **0.0000%** |
| `Por cobrar terceros hoy` | 30,324,254.7583 | 30,324,254.7583 | **0.0000%** |
| `Vencido terceros hoy` | 9,649,732.9944 | 9,649,732.9944 | **0.0000%** |
| Sociedades con venta a terceros | 9 | 9 | ✓ |
| Cortes de cartera histórica | 6 | 6 | ✓ |

**D4 · el símbolo de moneda dentro del patrón de `FORMAT` produce basura silenciosa.** La
abreviatura devolvía `1#,0.0M` en vez de `Q402.3M`: `FORMAT(402.3, "Q#,0.0")` hace que DAX lea la
`q` como el **código de trimestre de un formato de FECHA** y emita el resto como literal. No da
error, no da BLANK — da un texto con aspecto de formato roto que en un título pasa por bug visual
y no por dato mal calculado. Corregido concatenando el símbolo **fuera** del `FORMAT`
(`dax_importe_abreviado`) y verificado en el motor: `Q402.3M`. Nada que ver con el `formatString`
de las medidas de importe, donde la `Q` va entre comillas y por eso siempre funcionó.

## F1 — cerrada (2026-08-08)

| Criterio del gate | Resultado |
|---|---|
| Tablas del baseline cubiertas | **PASA** — 43/43 |
| Cada tabla con análisis posible hoy o justificación | **PASA** — 40 con análisis, 3 justificadas |
| No se re-auditó el modelo | **PASA** |
| Gaps identificados con id | **PASA** — 6 candidatos (~18 medidas de 40) + 7 limitaciones estructurales |

**Defecto de datos encontrado y corregido durante la fase** (fuera del alcance del contrato,
reportado y resuelto porque bloqueaba el refresco del modelo): `DM_Dirección de entrega` con
clave duplicada por la clave compuesta `(Code, Country)` de OCST. Se extrae el país, el join se
rehízo a prueba de multiplicación y las 12 dimensiones sin test de unicidad lo recibieron.
Verificado en Cresta e Iron Network.

## Siguiente paso

1. **Edwin construye la ola 1 en Desktop** (00 Inicio · 01 Dirección · 09 Cartera y cobranza)
   usando los contratos de `docs/powerbi/report-architecture.md` como guía de contenido y el
   tema ya registrado. Referencias útiles del modelo: títulos desde `Título de <página>`,
   subtítulos desde las medidas `_Narrativa`, KPI de frescura = `Dato completo hasta`,
   agenda de cobro = `Cobro que vence en el período` (GAP-01). El mockup de diseño puede salir
   del prompt `docs/powerbi/prompt-diseno-ola1.md`.
2. **Cuando haya páginas construidas, el agente corre F6.2 vía MCP** (PBIP abierto en Desktop):
   cifra de cada visual contra el motor DAX y contra SQL a `oro` (conteos 0 · montos ≤0.5% ·
   ratios ≤0.1pp).
3. **`Sobrecosto por precio de compra` da ≈ 0** (5.99e-08) sin filtro de período. Causa probable:
   no hay año anterior en el modelo (D3) — compara contra un precio que no existe. Verificar al
   llegar a la página 08.
