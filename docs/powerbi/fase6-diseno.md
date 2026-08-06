# Fase 6 — Clasificaciones como snapshots por período

## El defecto

`DM_Clasificación ABC`, `DM_Clasificación ABC Proveedor`, `DM_Clasificación RFM` y
`DM_Comportamiento de pago` no tienen relación con el calendario, pero exponen columnas
temporales (`clase_abc_anio`, `venta_anio`, `perdido_en_anio`). Si el usuario filtra 2024, la
clasificación que ve es la del último año procesado. **El número es plausible y está mal**, que
es la peor combinación posible.

Además no son dimensiones: contienen métricas precalculadas y 31 medidas propias. Son snapshots
analíticos mal clasificados.

## Corrección al alcance: las cuatro tablas NO son el mismo caso

La auditoría las trata como un bloque. Al revisar cómo se calcula cada una, solo dos admiten el
regrano por año; las otras dos no tienen de dónde sacar la historia.

| Tabla | ¿Tiene ámbito anual real? | Qué se puede hacer |
|---|---|---|
| `clasificacion_abc_cliente` | **Sí.** Ya calcula `venta_anio`, `ranking_anio`, `clase_abc_anio` sobre el año en curso, y el hecho de ventas tiene todos los años | Regrano real a `(empresa, anio, cliente)` |
| `clasificacion_abc_proveedor` | **Sí.** Mismo diseño sobre compras | Regrano real |
| `clasificacion_rfm_cliente` | **No como está.** La recencia se mide contra `fecha_referencia` = última venta de la empresa. Un «RFM de 2024» exige recalcular los quintiles con los datos disponibles al cierre de 2024 — es una métrica distinta, no un corte de la actual | Declararla explícitamente como foto |
| `comportamiento_pago_cliente` | **No.** Se construye sobre las partidas ABIERTAS de cartera, que son el saldo de hoy. La cartera histórica solo tiene 4 cortes (desde 2026-07-27); no hay de dónde reconstruir 2024 | Declararla explícitamente como foto |

Inventar un regrano anual para las dos últimas sería fabricar historia que el dato no soporta —
exactamente el tipo de número plausible y equivocado que esta fase existe para eliminar.

**Propuesta:** regranular las dos ABC, y para RFM y Comportamiento de pago exponer `fecha_corte`
como columna visible y decirlo en la descripción, para que quede claro en el panel de campos que
son el estado de hoy y no una serie.

## Punto 2 del prompt — cómo relacionar un grano anual con un calendario diario

### Opción A — columna `anio` en ambos lados, relación muchos-a-muchos

`DM_Calendario[anio]` ↔ `clasificacion[anio]`.

- **A favor:** el filtro del calendario funciona sin que el usuario cambie de hábito.
- **En contra:** una relación M:M en Power BI se resuelve internamente creando una tabla de
  valores distintos y **filtra en ambas direcciones**, que es justo lo que acabamos de quitar en
  la Fase 2 — reintroduce propagación cruzada entre las clasificaciones por la puerta de atrás.
  Además el motor no puede aplicar las optimizaciones de una relación 1:M.

### Opción B — dimensión `DM_Año` intermedia · **recomendada**

Tabla de una fila por año. `DM_Calendario[anio] → DM_Año[anio]` (M:1) y
`clasificacion[anio] → DM_Año[anio]` (M:1).

- **A favor:** sin M:M y sin bidireccional. Un solo segmentador («Año de clasificación») filtra
  a la vez las clasificaciones y —si se quiere— el calendario. Escala a cualquier otra tabla de
  grano anual que aparezca después (metas de venta, presupuestos), que es hacia donde va el
  backlog.
- **En contra:** el segmentador del calendario **no** filtra las clasificaciones. Hay que usar
  el de `DM_Año`. Es un cambio de hábito, pero explícito: el usuario ve que está eligiendo el
  año de la clasificación, no un rango de fechas.
- **Costo:** una tabla trivial y dos relaciones.

### Opción C — `TREATAS` dentro de cada medida

`CALCULATE(…, TREATAS(VALUES(DM_Calendario[anio]), clasificacion[anio]))`.

- **A favor:** cero cambios estructurales; el filtro del calendario manda.
- **En contra:** hay que tocar las 31 medidas y **cada medida futura**, o quedan inconsistentes.
  Y una columna de la clasificación arrastrada directamente a un visual (sin pasar por medida)
  seguiría sin filtrarse — el defecto original sobreviviría a medias. Es una corrección que se
  aplica solo donde alguien se acordó de aplicarla.

### Recomendación

**Opción B.** Es la única que corrige el defecto en la estructura y no en cada medida, no
reintroduce filtrado bidireccional, y deja el modelo listo para las metas de venta que ya están
en el backlog. El cambio de hábito del segmentador es el precio, y es un precio explícito.

## Punto 3 — clasificación vigente desnormalizada

Al quitar las bidireccionales (Fase 2) se pierde poder segmentar `FC_Ventas` por clase ABC desde
el panel de campos. Se recupera desnormalizando en el ETL las columnas de clasificación **actual**
sobre las dimensiones:

- `dim_cliente`: `clase_abc_actual`, `segmento_rfm_actual`, `perfil_riesgo_actual`
- `dim_proveedor`: `clase_abc_actual`

Con eso «ventas del trimestre de mis clientes A» es un filtro normal de dimensión, sin
propagación global y sin ambigüedad. La tabla de clasificación por año queda para el análisis
histórico; la columna en la dimensión, para el uso diario.

## Punto 4 — renombrado a hechos

`DM_Clasificación ABC` → `FC_Clasificación ABC`, y equivalentes. Refleja lo que son.

**No se ejecuta en esta fase.** Cambiar el prefijo cambia el nombre de la tabla en el modelo, y
eso rompe toda referencia en las medidas y **deja en blanco cualquier visual que ya las use**.
Es una pasada mecánica y controlada, pero debe ir sola y con Desktop cerrado: se propone para
después de validar todo lo demás.

## Impacto sobre las 31 medidas existentes

El regrano rompe el supuesto de que hay una fila por entidad. `Clientes A` es hoy
`COUNTROWS(clasificación WHERE clase = "A")`; con una fila por cliente **y año** contaría
cliente-años. Todas las medidas de conteo de las dos ABC necesitan
`DISTINCTCOUNT(cliente_clave)` en vez de `COUNTROWS`, y las de monto necesitan el año acotado.

Es la parte cara de esta fase y la razón por la que conviene decidir la vía de relación antes de
tocar nada.
