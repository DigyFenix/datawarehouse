# STATE — Quilate Analytics · Power BI Product

FASE_ACTUAL: F1 (siguiente; no iniciada)
ULTIMA_ACTUALIZACION: 2026-08-08
GATE_ANTERIOR: PASA (F0 cerrada)

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

## Decisiones tomadas

| # | Decisión | Justificación | Fase |
|---|---|---|---|
| 1 | El `version: "1.0"` de `definition.pbir` NO se interpreta como formato legacy | Ese campo versiona el archivo `.pbir`, no el formato del reporte. La prueba sustantiva —`definition/pages/` con carpeta por página y `pages.json`— se cumple, y el `report.json` no contiene páginas | GATE 0 |
| 2 | El baseline es `docs/powerbi/inventario-modelo.md`, con las cifras REALES: **43 tablas · 662 columnas · 294 medidas · 98 relaciones** | El contrato cita 37/595/180/93, de una versión anterior del modelo. §2.3 prohíbe re-auditar y autoriza registrar la ruta real; construir sobre cifras viejas llevaría a decisiones de cobertura equivocadas | GATE 0 |
| 3 | El tema es del PRODUCTO, no del cliente: `quilate-theme.json` | Edwin autorizó un tema genérico ahora y el de cada sociedad después. Se deriva de los tokens que ya usan los portales, así que tableros y portal se ven de la misma familia | GATE 0 |
| 4 | No se instala ningún MCP ni herramienta | §3.5. Los gaps se reportan con su candidato y se espera autorización | F0 |

## Bloqueos abiertos

| # | Bloqueo | Requiere de | Desde |
|---|---|---|---|
| B4 | Sin ejecución DAX contra el modelo: la validación de F6.2 pasa a ser manual (exportar visual → comparar con SQL) | Decisión de Edwin al llegar a F4: (A) mantener pocas medidas nuevas P0 para que el coste manual sea asumible, o (B) autorizar la evaluación de `microsoft/powerbi-modeling-mcp` | 2026-08-08 |
| B5 | Sin render del reporte: F6.3 depende de capturas | Edwin, al cerrar cada ola de páginas (ya previsto en §9.8) | 2026-08-08 |

## Presupuesto consumido

- Páginas construidas: 0 / 12
- Medidas nuevas creadas: 0 / 40
- Rondas de iteración: 0 / 2

## Siguiente paso

**F1 — Baseline del modelo.** Entrada: `docs/powerbi/inventario-modelo.md`.
Trabajo: NO re-auditar; producir el mapa de explotación analítica
(`docs/powerbi/model-exploitation-map.md`) cubriendo las 43 tablas.
Gate: cada tabla con al menos una fila en «Análisis posibles hoy» o su justificación.
