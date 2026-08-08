---
name: guardar-sesion
description: Cierra la sesión de trabajo dejando el estado escrito donde la próxima sesión lo va a buscar — .claude/SESSION.md, ESTADO.md y docs/powerbi/STATE.md. Úsala cuando Edwin diga "guardemos", "cerremos la sesión", "guardá el estado", antes de un /clear, o cuando quede trabajo a medias que otra sesión deba retomar.
---

# Guardar sesión — Quilate Analytics

Tres archivos, tres audiencias distintas. Escribir en el equivocado es como no escribir.

| Archivo | Qué guarda | Cuándo se toca |
|---|---|---|
| `.claude/SESSION.md` | La **bitácora**: qué pasó en esta sesión, qué se decidió y por qué, qué quedó pendiente | Cada sesión con trabajo real |
| `ESTADO.md` | El **tablero de fases** del producto: estado de las 7 fases y avances por sesión | Al cerrar una fase o lograr algo que cambia el estado de una |
| `docs/powerbi/STATE.md` | El estado del **producto Power BI**, que corre por su propio contrato | Solo al avanzar una fase F0–F7 de ese contrato |

## 1 · `.claude/SESSION.md`

Bloque nuevo **arriba del todo** (lo más reciente primero: la próxima sesión lee el encabezado
y ya sabe dónde está parada). Formato vigente:

```markdown
## ══════ SESIÓN <n> (<yyyy-mm-dd>) — <TÍTULO EN UNA LÍNEA> — leer esto primero ══════

<Un párrafo: qué cambió de fondo en esta sesión.>

### <Sub-tema>

<Qué se hizo, con el porqué. Los números concretos y las rutas de archivo.>

### PENDIENTE: <cosa>

<Qué falta exactamente y cuál es el siguiente paso, en pasos numerados si son varios.>
```

Reglas que hacen útil ese archivo:

- **El porqué, no el qué.** El `git log` ya dice qué archivos cambiaron. Lo que se pierde es la
  razón: qué se probó, qué falló y por qué se eligió este camino.
- **Las trampas se escriben.** Un error que costó una hora y volvería a costarla merece su
  párrafo (la del volumen de Docker al renombrar el proyecto compose es el ejemplo).
- **Fechas absolutas**, nunca «ayer» ni «la semana pasada».
- **Un pendiente sin siguiente paso concreto no es un pendiente, es una angustia.** Escribir el
  comando o el archivo exacto por donde se retoma.
- **Nada de secretos.** Ni valores del `.env`, ni contraseñas, ni cadenas de conexión completas.

## 2 · `ESTADO.md`

Se toca solo cuando cambia el estado de una fase. Dos lugares:

1. La **tabla Resumen** (fila de la fase: estado + fecha de cierre).
2. Una sección `## Avance <fecha> (sesión N) — <TÍTULO>` con el detalle.

El encabezado del archivo lleva el **cuello de botella vigente**. Si lo que se hizo en la sesión
lo mueve, actualizarlo: es lo primero que se lee y lo que más rápido envejece.

## 3 · `docs/powerbi/STATE.md`

Es la fuente de verdad del contrato Power BI (`CLAUDE_POWERBI_ANALYTICS_PRODUCT_MASTER_V3.md`,
§0.3: **si la sesión y este archivo discrepan, gana el archivo**). Actualizar `FASE_ACTUAL`,
`ULTIMA_ACTUALIZACION`, `GATE_ANTERIOR`, la tabla de artefactos, las decisiones, los bloqueos
abiertos y el presupuesto consumido (páginas / medidas / rondas).

## Antes de dar por cerrada la sesión

```powershell
git status --short
git log --oneline -5
docker exec quilate-postgres psql -U quilate_admin -d dw_grupocresta -c "SELECT count(*) FROM plata.plata_control_cuadre WHERE NOT cuadra;"
```

- Verificar que lo que se afirma en los documentos es lo que la base y el repo realmente dicen
  — un estado escrito de memoria envejece mal y se descubre tarde (la migración 122 quedó
  marcada «PENDIENTE» en `SESSION.md` cuando ya estaba aplicada).
- Preguntarle a Edwin si commitea; **no** commitear por iniciativa propia.
- Si hay trabajo a medias, que el bloque de sesión termine en el **siguiente paso concreto**.
