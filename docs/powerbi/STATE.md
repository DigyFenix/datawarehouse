# STATE — Quilate Analytics · Power BI Product

FASE_ACTUAL: F0 (bloqueada en GATE 0)
ULTIMA_ACTUALIZACION: 2026-08-08
GATE_ANTERIOR: FALLA

> Fuente de verdad del progreso. Si el contexto de una sesión y este archivo
> discrepan, gana este archivo (§0.3 del contrato).

## GATE 0 — precondiciones duras (§2)

| # | Precondición | Resultado | Evidencia |
|---|---|---|---|
| 2.1 | Formato PBIR | **PASA** | `definition/pages/` con subdirectorio por página + `pages.json`; `report.json` es config global (2 975 B, sin `sections` ni `visualContainers`) → no es legacy |
| 2.2 | Formato TMDL | **PASA** | 47 archivos `.tmdl`, ningún `model.bim` |
| 2.3 | Baseline de auditoría | **FALLA** | No existe `docs/powerbi/audit/`. Hay `inventario-modelo.md`, pero el modelo real es **43 tablas / 662 columnas / 294 medidas / 98 relaciones**, no las 37/595/180/93 que cita el contrato |
| 2.4 | Remediación de defectos numéricos | **NO EVALUABLE** | No existe el plan de 12 defectos que la precondición exige verificar |
| 2.5 | Tema corporativo | **FALLA** | No existe `theme/pulsocresta-theme.json` ni ningún `*theme*.json` en el repo |
| 2.6 | Git limpio | **PASA** | `git status --porcelain` sin salida |

**Veredicto: GATE 0 NO PASA.** Según §12.4 y §9.1, se detiene sin ejecutar F0.

## Artefactos producidos

| Artefacto | Ruta | Fase | Estado |
|---|---|---|---|
| Estado del producto | `docs/powerbi/STATE.md` | — | creado |

## Decisiones tomadas

| # | Decisión | Justificación | Fase |
|---|---|---|---|
| 1 | El `version: "1.0"` de `definition.pbir` NO se interpreta como formato legacy | Ese campo versiona el archivo `.pbir`, no el formato del reporte. La prueba sustantiva del contrato —`definition/pages/` con carpeta por página y `pages.json`— se cumple, y el `report.json` no contiene páginas | GATE 0 |
| 2 | No se re-audita el modelo | §2.3 lo prohíbe explícitamente. El desfase de cifras se reporta como bloqueo, no se resuelve por iniciativa propia | GATE 0 |
| 3 | No se inventa una paleta | §2.5 lo prohíbe explícitamente: todo el trabajo visual dependería de ella y habría que rehacerlo | GATE 0 |

## Bloqueos abiertos

| # | Bloqueo | Requiere de | Desde |
|---|---|---|---|
| B1 | Sin identidad visual: no existe `theme/pulsocresta-theme.json` | Edwin: paleta corporativa, tipografía y logo — o autorización para derivar el tema de los tokens que ya usa el portal (`--marca`, verde/oro) | 2026-08-08 |
| B2 | El baseline de auditoría que cita el contrato no existe con esa forma, y sus cifras no corresponden al modelo actual | Edwin: decidir entre (A) tomar `inventario-modelo.md` como baseline y actualizar el contrato a 43/662/294/98, o (B) producir el audit formal en `docs/powerbi/audit/` | 2026-08-08 |
| B3 | No hay plan de remediación de 12 defectos que verificar (§2.4) | Consecuencia de B2 | 2026-08-08 |

## Presupuesto consumido

- Páginas construidas: 0 / 12
- Medidas nuevas creadas: 0 / 40
- Rondas de iteración: 0 / 2

## Notas del entorno (adelanto de F0, sin ejecutar la fase)

Detectado al evaluar el gate, pendiente de verificación formal en F0:

- **Sin ejecución DAX contra el modelo**: no hay conexión a un motor Analysis Services
  desde este entorno. Afecta al diseño del QA de F6.2 — la validación tendría que
  hacerse contra `oro` en Postgres y por exportación manual, como prevé §7.
- **Sin render del reporte**: F6.3 dependerá de capturas que aporte Edwin, como ya
  contempla el contrato.
- **Playwright disponible** (MCP): sirve para los portales web, no para Power BI Desktop.
