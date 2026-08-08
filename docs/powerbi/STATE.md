# STATE — Quilate Analytics · Power BI Product

FASE_ACTUAL: F4 (lote 1 en curso — corrección del ancla móvil aplicada, falta regenerar)
ULTIMA_ACTUALIZACION: 2026-08-08 (sesión 22)
GATE_ANTERIOR: PASA (F1, F2 y F3 cerradas)

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

## Bloqueos abiertos

| # | Bloqueo | Requiere de | Desde |
|---|---|---|---|
| B4 | ~~Sin ejecución DAX~~ **RESUELTO**: el MCP estaba instalado pero **no conectaba** — se registró sin el argumento `--start`, y sin él el wrapper imprime un banner y hace `Console.ReadKey()`, que revienta con stdin redirigido (`-32000: Connection closed`). Re-registrado como `npx -y @microsoft/powerbi-modeling-mcp@latest --start` → conecta. Queda la dependencia real: el modelo abierto en Power BI Desktop para que exista motor XMLA | Edwin: abrir `organizaciones/grupocresta/powerbi/PulsoCresta.pbip` cuando toque validar | 2026-08-08 |
| B5 | Sin render del reporte: F6.3 depende de capturas | Edwin, al cerrar cada ola de páginas (ya previsto en §9.8) | 2026-08-08 |

## Presupuesto consumido

- Páginas construidas: 0 / 12
- Medidas nuevas creadas: 0 / 40
- Rondas de iteración: 0 / 2

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

**F2 — Matriz de oportunidad analítica.** Entrada: `docs/powerbi/model-exploitation-map.md`.
Salida: `docs/powerbi/analytics-opportunity-matrix.md`.
Gate: ≥25 filas, cada una con **pregunta de negocio explícita** e impacto/esfuerzo/prioridad;
los P0 no exceden 12 (presupuesto de páginas).
