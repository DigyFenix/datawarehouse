# Prompt para Claude Code — Corrección del modelo semántico PulsoCresta

> Cópialo completo en Claude Code, con el proyecto PBIP abierto como carpeta de trabajo.

---

## Contexto

Trabajas sobre un proyecto Power BI en formato PBIP: `PulsoCresta.SemanticModel/definition/`.

- **Origen de datos:** PostgreSQL `dw_grupocresta`, esquema `oro` (arquitectura medallion). Parámetros `Servidor` y `BaseDatos` ya definidos en `expressions.tmdl`.
- **Escala:** 37 tablas (18 `DM_`, 14 `FC_`, 4 `MD_`), 595 columnas, 180 medidas, 93 relaciones.
- **Licencia destino:** Power BI Pro. Techo de 1 GB por modelo, **sin escritura XMLA** — todo el trabajo es local sobre archivos TMDL, nunca contra el servicio publicado.
- **Cultura:** `es-GT`. Nomenclatura en español, snake_case en columnas físicas, nombres de negocio en medidas.

Vengo de una auditoría que identificó 12 defectos. Vas a corregir los resolubles en TMDL, en fases, esperando mi validación entre cada una.

## Reglas de trabajo

1. **Antes de tocar nada:** `git init` si no existe repo, y commit del estado actual como línea base. Cada fase termina en su propio commit.
2. **Power BI Desktop debe estar cerrado** mientras editas. Desktop no detecta cambios externos en archivos del proyecto y los sobrescribe al guardar.
3. **No renombres nada.** Ni tablas, ni columnas, ni medidas, ni relaciones (`rel_0XX`), ni `lineageTag`. Los nombres actuales son deliberados.
4. **No toques las 61 medidas que ya tienen descripción `///`.** Están bien escritas.
5. **No introduzcas columnas calculadas.** El modelo hoy tiene cero y así debe quedar: todo cálculo persistente va al ETL, todo cálculo dinámico va a medidas.
6. **Una fase a la vez.** Al terminar cada fase, resume qué cambiaste y espera mi confirmación de que validé en Desktop antes de seguir.
7. Si una corrección requiere un cambio en PostgreSQL que no puedes desplegar, **no la simules en DAX**: escribe el SQL propuesto en `sql/` y marca la corrección como bloqueada.

---

## Fase 0 — Inventario y línea base

Lee `model.tmdl`, `relationships.tmdl`, `expressions.tmdl` y las 37 tablas en `tables/`.

Genera `docs/inventario-modelo.md` con: tablas por tipo, conteo de columnas y medidas por tabla, relaciones (activas / inactivas / bidireccionales), medidas agrupadas por `displayFolder`, y lista de medidas sin descripción.

No modifiques nada en esta fase.

---

## Fase 1 — `KEEPFILTERS` en filtros de dimensión

**Problema:** un predicado de columna dentro de `CALCULATE` se expande a `FILTER(ALL(columna), …)` y reemplaza el filtro externo en lugar de intersectarlo. 62 medidas ignoran los segmentadores del usuario.

```dax
// ACTUAL — si el usuario pone un slicer de antigüedad en "61-90", devuelve igual el tramo 1-30
CALCULATE([Saldo por cobrar], 'DM_Antigüedad'[rango_aging] = "1-30")

// CORRECTO
CALCULATE([Saldo por cobrar], KEEPFILTERS('DM_Antigüedad'[rango_aging] = "1-30"))
```

Aplica `KEEPFILTERS` a los predicados sobre estas columnas:

- `DM_Antigüedad[rango_aging]`, `DM_Antigüedad[es_vencido]`
- `DM_Clasificación ABC[clase_abc_anio]`, `[perdido_en_anio]`
- `DM_Clasificación ABC Proveedor[clase_abc_anio]`, `[inactivo_en_anio]`
- `DM_Clasificación RFM[segmento_rfm]`
- `DM_Comportamiento de pago[perfil_riesgo]`
- `DM_Producto[producto_codigo]`
- `DM_Tipo de documento[tipo_documento]`

**Excepciones — no las cambies, pregúntame primero.** En estas el comportamiento actual podría ser intencional (que la medida ignore deliberadamente un segmentador de intercompañía):

- `DM_Cliente[es_intercompania]` → `[Ventas a terceros]`, `[Ventas al grupo]` y dependientes
- `DM_Proveedor[es_intercompania]` → equivalentes en compras

Lístamelas con su DAX actual y espera mi criterio.

**Entregable:** diff por medida en `docs/fase1-keepfilters.md`, agrupado por tabla.

---

## Fase 2 — Eliminar filtrado bidireccional

**Problema:** cuatro relaciones usan `crossFilteringBehavior: bothDirections`, y tres de ellas cuelgan de la misma dimensión (`DM_Cliente`), lo que crea propagación cruzada entre clasificaciones y encarece cada consulta.

```
rel_090  DM_Clasificación ABC[cliente_clave]         → DM_Cliente[cliente_clave]
rel_091  DM_Clasificación ABC Proveedor[prov_clave]  → DM_Proveedor[proveedor_clave]
rel_092  DM_Clasificación RFM[cliente_clave]         → DM_Cliente[cliente_clave]
rel_093  DM_Comportamiento de pago[cliente_clave]    → DM_Cliente[cliente_clave]
```

**Verificado previamente:** las 31 medidas de esas cuatro tablas son autocontenidas — agregan columnas de su propia tabla (`venta_anio`, `margen_anio`, `saldo_total`, `monto_neto_12m`) o cuentan sus propias filas. **Ninguna depende de la propagación bidireccional.** Quitarla no debería romper nada.

**Acción:** cambia las cuatro a dirección simple eliminando la línea `crossFilteringBehavior`.

**Después:** recorre las 180 medidas y repórtame cualquiera que dependa de que un filtro viaje desde estas cuatro tablas hacia una tabla de hechos. Si encuentras alguna, **no la reescribas**: lístamela con el DAX y esperamos. La solución correcta en ese caso es `TREATAS` explícito dentro de la medida, nunca reactivar la bidireccional.

---

## Fase 3 — Fallback del calculation group `MD_Moneda de análisis`

**Problema:** el ítem `'Moneda original'` es un `SWITCH(TRUE(), ISSELECTEDMEASURE(…), …)` que enumera 10 medidas. Las otras 170 caen en `SELECTEDMEASURE()` y devuelven quetzales rotulados como moneda original. Error silencioso.

Cambia el fallback de `SELECTEDMEASURE()` a `BLANK()`, y ajusta el `formatStringDefinition` para que las medidas no soportadas queden vacías en lugar de mostrar un número falso.

Después, propón (sin implementar) cómo hacerlo escalable: hoy cada medida nueva obliga a editar el calculation group a mano. Quiero ver opciones antes de decidir.

---

## Fase 4 — Rendimiento de medidas iterativas

**4a. Los tres Pareto son O(n²).** `'% acumulado de venta clientes'`, `'% acumulado de compra proveedores'`, `'% acumulado de venta productos'` evalúan la medida base una vez por entidad dentro de un `FILTER` que recorre todas las entidades.

```dax
VAR Base   = ADDCOLUMNS(ALLSELECTED(DM_Cliente), "@v", [Ventas a terceros])
VAR Actual = [Ventas a terceros]
VAR Total  = SUMX(Base, [@v])
VAR Acum   = SUMX(FILTER(Base, [@v] >= Actual), [@v])
RETURN DIVIDE(Acum, Total)
```

**4b. `FILTER` sobre tabla de hechos.** En `'Venta promedio día operado'` y `'Clientes activos por día'`, sustituye `AVERAGEX(FILTER(tabla, predicado), columna)` por `CALCULATE(AVERAGE(columna), predicado)`.

**Validación obligatoria:** los valores deben ser idénticos antes y después. Escribe consultas de comparación en `tests/fase4-regresion.dax` que evalúen cada medida vieja y nueva sobre el mismo contexto, listas para correr en DAX Studio.

---

## Fase 5 — Relaciones de aging por clave entera

**Problema:** `DM_Antigüedad` tiene `rango_aging_clave` (int64), pero `rel_030`, `rel_038`, `rel_045` y `rel_052` se hacen por `rango_aging` (string). Cuesta más memoria y es más lento, y afecta a los dos snapshots diarios, que son las tablas más grandes del modelo.

Revisa si los cuatro hechos (`FC_Cartera por cobrar`, `FC_Cartera por pagar`, `FC_Cartera cobrar histórico`, `FC_Cartera pagar histórico`) ya exponen una columna de clave entera.

- **Si existe:** repunta las cuatro relaciones y oculta la columna string.
- **Si no existe:** bloqueado por ETL. Escribe en `sql/fase5-aging-clave.sql` el `ALTER VIEW` propuesto para las vistas de `oro`, y no modifiques el TMDL.

---

## Fase 6 — Clasificaciones como hechos por período (bloqueada por ETL)

**Problema:** `DM_Clasificación ABC`, `DM_Clasificación ABC Proveedor`, `DM_Clasificación RFM` y `DM_Comportamiento de pago` **no tienen relación con `DM_Calendario`**, pero sus columnas son temporales (`clase_abc_anio`, `ranking_anio`, `venta_anio`, `perdido_en_anio`). Si el usuario filtra 2024, la clasificación devuelta es la del último año procesado. El número es plausible y está mal.

Además no son dimensiones: contienen métricas precalculadas y 31 medidas propias. Son snapshots analíticos mal clasificados.

**Diseño objetivo — no lo implementes, propónlo:**

1. Cambiar el grano en el ETL de `(empresa_id, cliente_clave)` a `(empresa_id, anio, cliente_clave)`, de modo que exista una fila por cliente y por año.
2. Relación activa desde cada tabla hacia `DM_Calendario`. Como el grano es anual y `DM_Calendario` es diario, **evalúa y recomiéndame** la mejor vía: columna `anio` en ambos lados con relación muchos-a-muchos, una dimensión `DM_Anio` intermedia, o `TREATAS` dentro de las medidas. Quiero tu criterio con las ventajas y costos de cada una, no una elección silenciosa.
3. Añadir a `DM_Cliente` y `DM_Proveedor` las columnas de clasificación **vigente** (`clase_abc_actual`, `segmento_rfm_actual`, `perfil_riesgo_actual`) desnormalizadas desde el ETL. Esto recupera el caso de uso de segmentar `FC_Ventas` por clase ABC, que se pierde al quitar las bidireccionales en la Fase 2 — pero por filtrado explícito, no por propagación global.
4. Prefijar las cuatro tablas como hechos para que la nomenclatura refleje lo que son. **Propón el renombrado, no lo ejecutes** — rompe referencias en las medidas y hay que hacerlo en una pasada controlada.

**Entregables:** `sql/fase6-clasificaciones.sql` con las vistas propuestas para `oro`, y `docs/fase6-diseno.md` con el modelo objetivo y la comparación de opciones del punto 2.

---

## Fase 7 — Descripciones

119 de 180 medidas no tienen descripción `///`. En Pro no hay Copilot, así que la descripción es la única documentación que el usuario final ve al pasar el cursor sobre el campo — y lo que permite que un agente genere DAX correcto contra este modelo.

Escribe descripciones siguiendo el estilo de las 61 existentes: **explican la regla de negocio, no la fórmula**. Referencia del tono:

> `/// El mercado real. La venta al grupo no compite por precio: mezclarla distorsiona todo indicador comercial.`

Una o dos frases. Nada de "esta medida calcula la suma de…".

Procesa por `displayFolder` y muéstrame cada lote antes de escribirlo — necesito corregir terminología de negocio que no puedes inferir del TMDL.

---

## Fuera de alcance

- **Refresh incremental.** Ninguna de las 33 tablas lo tiene, y hace falta antes de publicar a Pro. Se configura en Power BI Desktop, que genera la `refreshPolicy` correcta; editarla a mano en TMDL es propenso a error. Solo dime en qué tablas ponerla y con qué política de archivo y refresco.
- **`FC_Campos de usuario`** — estructura EAV (`entidad · tabla_origen · registro_id · campo · valor`) con tres claves foráneas simultáneas de las que solo una aplica por fila. Decisión de arquitectura, la tomo yo.
- **Redundancia `DM_Cliente` / `DM_Proveedor` / `DM_Socio de negocio`** sobre los mismos hechos. Igual.
- **Zona horaria de `oro.dim_tiempo`.** Las 10 columnas volátiles (`es_hoy`, `es_mes_actual`, `dias_desde_hoy`…) se calculan en PostgreSQL al refrescar. Cambio en la vista, no en el modelo.

---

## Al terminar cada fase

1. Resume qué cambiaste y en qué archivos.
2. Commit con mensaje descriptivo.
3. Dime exactamente qué debo validar al abrir Power BI Desktop.
4. **Detente y espera mi confirmación.**
