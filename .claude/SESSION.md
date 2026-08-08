# SESSION — datawarehouse

## ══════ SESIÓN 18 (2026-08-07/08) — TODAS LAS FASES CERRADAS EN LOCAL — leer esto primero ══════

**Foco: cerrar el roadmap completo sin salir de local. Gobernanza real (IDOR, RLS,
certificación), agente de IA (Fase 4, que estaba pospuesta), UX profesional del portal de
usuario, genericidad total del motor y onboarding validado con un tenant nuevo de punta a
punta. Sin VPS, sin publicar nada.**

### Lo que desbloqueó todo: el FileFallocate era el bind mount

`infra/local/data` (bind mount de Windows) era la causa del `FileFallocate: Interrupted system
call` que tumbaba un modelo pesado en cada build de Cresta. Migrado a **volumen Docker nativo**
(`pgdata`, mismo patrón que producción) con `pg_dump`/`pg_restore` de las tres bases —
conteos verificados antes y después. El build completo de Cresta ahora pasa con 4 hilos.
El datadir viejo queda intacto como respaldo; los dumps están en `infra/local/respaldos/`
(ignorado por git).

### Genericidad: el motor ya no sabe de ningún cliente

Una instalación limpia arranca con **CERO organizaciones**. Antes el init creaba Grupo Cresta e
Iron Network con sus NIT y sociedades reales en cualquier instalación.

- **8 seeds de tenant** salieron del init: los de organización/sociedades/políticas a
  `organizaciones/<tenant>/seeds/`, y los 60–63 (historia ya aplicada) a `seeds/historicos/`.
- **Datos de tenant fuera de las migraciones DDL**: los 10 NIT de Cresta (112) y el UPDATE a
  `svproavis` (114) pasaron a seeds del tenant. Las migraciones quedaron solo con estructura.
- **Generador PBI parametrizado por moneda**: `FMT_Q` era `"Q" #,0` fijo. Ahora
  `moneda_presentacion_de()` lee la moneda de la organización de la BD de control y
  `aplicar_moneda()` reescribe el símbolo del formatString, el discriminador del calculation
  group y el nombre del modo local. Un tenant en USD sale con `$`. Verificado con GTQ (sin
  cambios) y USD.
- Los 3 tooltips con estadísticas de Cresta ahora explican la regla de negocio sin cifras de
  ningún cliente. `generar_reporte.py` exige el nombre de empresa (antes caía a "Grupo Cresta").
- **PulsoCresta.\* movido** a `organizaciones/grupocresta/powerbi/` con `git mv` (los visuales
  de Edwin intactos: el .Report no se regenera nunca).
- Marca neutra en el chasis: título, eyebrow del login, claves de localStorage, `.env.example`.
- **Feriados por país**: el seed `feriados_guatemala` pasó a `feriados` con columna `pais` y
  `dim_tiempo` filtra por la var `pais_feriados` (default GT).
- `moneda_local` ahora sí viaja en las vars de dbt (antes solo salvaba el coalesce de sociedades).

### Gobernanza (Fase 3) — cerrada y probada

**IDOR del portal admin.** El JWT sigue siendo `{sub, email}`, pero el guard **relee usuario y
roles de la BD en cada request**: desactivar a alguien lo saca al siguiente request. Tres
APP_GUARD en orden: autenticación → roles (`@RolesPermitidos` / `@RolesGlobales`) → membresía
por organización (`@AlcanceOrg`). Las mutaciones por PK llaman `exigirAccesoOrg()` DESPUÉS de
cargar la fila. Migración **116**: `gobierno.conexiones` gana `organizacion_id` (era la fuga
grande: host, puerto y `secreto_ref` de todos los tenants a cualquier autenticado) y su unicidad
de nombre pasa a ser por organización. Migración **117**: auditoría con organización y
paginación por cursor obligatoria.

*Rol de proveedor* = `admin_portal` con `organizacion_id NULL`. No hizo falta un rol nuevo:
`gobierno.usuario_roles` ya lo modelaba. Seed 70 de compatibilidad da alcance global a los
usuarios existentes — **recortarlo a mano es un paso pendiente de Edwin**.

Verificado con un usuario acotado a una organización: listado filtrado, 404 al leer la ajena,
404 al mutar su política **por PK sin mencionar el id**, conexiones filtradas, 403 al dar de
alta un tenant, auditoría sin fugas y 401 inmediato al desactivarlo.

**Certificación.** Migración **118**: default `borrador` en `metrica_versiones` (el DDL decía
`en_revision` y el servicio insertaba `borrador`) e índice único parcial "una sola versión en
revisión por métrica". Los 8 huecos cerrados: `deprecada` ahora es alcanzable
(`POST /metricas/:id/deprecar`), los aprobadores se validan (usuario activo + rol `data_owner`),
el creador de una versión no puede aprobarla, una certificada no se re-envía, y hay bandeja
"pendientes de mi voto". **7 reglas probadas por el API real, todas en verde.**

**7 métricas certificadas por el flujo real** (ventas brutas/netas, devoluciones, saldo CxC/CxP,
margen bruto, cobros de clientes) con dos aprobadores `data_owner`. El catálogo quedó 21
borrador + 7 certificada. Se crearon `aprobador1@ejemplo.local` y `aprobador2@ejemplo.local`
con contraseña temporal — **Edwin decide si los conserva o los reemplaza por personas reales**.

**RLS del warehouse — híbrido, sin teatro.** Rol Postgres `portal_lector` (LOGIN, NOBYPASSRLS,
sin ownership) con acceso a `oro` y a las tres tablas de alcances de `portal`; **sin acceso a
bronce ni plata**. La macro `aplicar_rls_oro()` corre como post-hook a nivel de carpeta oro, así
que **cada `dbt build` recrea las policies** y todo modelo oro futuro queda cubierto sin
acordarse de nada. Es **fail-closed**: sin `app.empresas` en la sesión, cero filas. Verificado:
49 policies en Iron, 0 filas sin variable, solo la empresa autorizada con variable, y `plata`
denegada. dbt (dueño) y Power BI (superusuario) no se ven afectados — el riesgo de Publish to
Web sigue aceptado y documentado, no disfrazado.

Migración **120**: `portal.perfil_alcances` acepta `recurso_tipo = 'empresa'` (el eje de filas).
Fail-closed permanente, con seed de compatibilidad `('empresa','*')` de una sola vez para los
perfiles que ya existían.

### Agente de IA (Fase 4) — construido y con guardas verificables

**Arquitectura:** el dominio vive como paquete TypeScript puro en `data-plane/agente`
(`@pulso/agente`) — tools, guardas, prompt y loop, sin NestJS ni pg, con el ejecutor de SQL
inyectado. El endpoint es un módulo delgado en `consumo/portal/api` que reusa el guard JWT por
tenant-hash, los pools y la auditoría que ya existían.

**4 tools tipadas** (Zod `.strict()`): `listar_metricas_disponibles`, `consultar_metrica`,
`consultar_aging`, `explicar_metrica`. Todo el SQL vive como **constantes con placeholders** en
`tools/consultas.ts`; ninguna función concatena texto dentro de una consulta.

**Las 4 restricciones de CLAUDE.md §11, con test cada una (12/12 en verde):**
1. *Sin SQL libre* — test estático de que ninguna plantilla lleva interpolación; una clave con
   `'; DROP TABLE …` la rechaza Zod antes de tocar la base.
2. *Solo certificadas* — el único filtro de estado del paquete es
   `estado in ('certificada','exploratoria')`; una métrica en borrador ni aparece en el prompt.
3. *Alcance siempre* — `empresa_id = any($n)` en toda consulta; pedir una empresa ajena se
   deniega **antes** de ir a la base y queda auditado como `consulta_agente_denegada`. El RLS
   de Postgres es el piso por debajo.
4. *Ambigüedad → aclarar* — en el system prompt, reforzado porque las tools exigen una clave
   exacta: ante "¿cómo van las ventas?" no hay clave que pasar sin preguntar antes.
5. La **tarjeta de dato** (métrica + período + valor + estado) se arma del catálogo y del
   resultado SQL, **nunca del texto del modelo**, y la UI la renderiza con badge propio.

Migración **121**: `portal.chat_conversaciones` y `portal.chat_mensajes` (tarjetas en jsonb).
Sin `ANTHROPIC_API_KEY` el chat responde **503 y el resto del portal sigue en pie** — verificado.

### Portal de usuario — UX profesional

Tokens de espaciado y tipografía, **modo oscuro completo** (3 estados, persistido por tenant,
sin FOUC), 7 componentes reutilizables nuevos (`app-tabs`, `app-skeleton`, `app-empty`,
`app-confirm`, `app-icon`, `app-page-header`), skeletons donde antes la pantalla quedaba en
blanco, spinner sobre el iframe de Power BI, tablas de admin que se vuelven tarjetas en móvil,
sidebar off-canvas, `confirm()` nativo eliminado, favicon y metadatos propios, auditoría con
JSON expandible, y accesibilidad (fieldset/legend, scope, aria-labels).

**Inicio** dejó de ser dos cajas: ahora responde de entrada "¿hasta cuándo llega el dato?"
(frescura por dominio desde `oro.estado_carga`), cuántos tableros tienes y cuáles viste hace
poco. **Chat** con dos paneles, burbujas, indicador de "consultando las métricas", tarjetas de
dato con su badge de certificación y sugerencias iniciales.

### Onboarding: de tres pasos manuales a un botón

`POST /organizaciones/:id/provisionar` crea la BD del tenant, le aplica el DDL
(101/110/119/120/121) y siembra el paquete de ingesta de su ERP — con los MISMOS archivos
versionados del repo (`metadata-store` montado read-only en el API). Idempotente y auditado.
La **fecha de corte** dejó de ser el literal `2026-01-01` de los seeds: ahora es un parámetro
con default "1 de enero del año en curso".

**Ensayo real completo** con una organización nueva (`ensayo18`, Odoo de Iron como origen):
alta → provisionar (5 DDL + 4 seeds, 12 políticas, 54 campos) → conexión → sociedad →
descubrir y extraer los **12 objetos** → primer build **195/195** → cuadre **0 desvíos** →
portal de usuario con su admin sembrado y el chat respondiendo. **Cero pasos que requieran
editar código o SQL a mano.**

**Hueco encontrado y cerrado**: `correr.py <org> "plata oro"` dejaba los seeds fuera y un tenant
nuevo reventaba en `dim_tiempo` (que cruza el calendario de feriados). Ahora, sin selección,
corre el **proyecto completo**.

### Estado al cierre (2026-08-08)

Los tres tenants construidos con el motor nuevo: **Cresta 195/195 y cuadre 0/70**,
**Iron 195/195 y cuadre 0/7**, **ensayo18 195/195 y cuadre 0/7**. RLS verificado en Cresta:
sin `app.empresas` → 0 filas; con `'*'` → 382,175; con una empresa inexistente → 0;
`plata` denegada al rol de lectura. PBIP regenerado y validado (36 tablas · 98 relaciones ·
294 medidas · TMDL válido · los 3 visuales de Edwin intactos). Suites verdes: guardas del
agente 12/12, IDOR 8/8, certificación 7/7. Árbol **sin commitear**.

### Pendientes / avisos

- **ANTHROPIC_API_KEY sin configurar**: el agente está completo y probado salvo la conversación
  real contra el modelo. Al ponerla en el `.env` y reiniciar `api-usuario`, el chat funciona.
- **Recortar el alcance global** de los usuarios que no deban ser operadores del producto
  (el seed 70 se lo dio a todos por compatibilidad).
- La organización `ensayo18` sigue viva como banco de pruebas. Se elimina con
  `DELETE /organizaciones/5` + `dropdb dw_ensayo18` cuando ya no haga falta.
- **Power BI Desktop** sigue pendiente de abrir (las 294 medidas nunca se evaluaron contra el
  motor DAX) y la terminología de las descripciones sigue esperando la revisión de Edwin.
- El `.dockerignore` de la raíz es nuevo: el build de `api-usuario` ahora usa la raíz del repo
  como contexto porque la API depende de `@pulso/agente` por ruta relativa.

## ══════ SESIÓN 17 (2026-08-06) — CAPA SEMÁNTICA AMPLIADA — leer esto primero ══════

**Foco: pasar la capa semántica de 180 a 293 medidas cubriendo las áreas donde una empresa
decide y el modelo callaba, y reparar el catálogo de gobierno, que estaba ROTO. Todo local
(Edwin pidió explícitamente nada de VPS ni publicación). Power BI solo Cresta.**

### El hallazgo que cambió el planteamiento

`metadatos.catalogo_hechos` solo conocía `fct_ventas_facturacion` y `fct_cobros_cxc`, nombres
de la Fase 0 que **nunca se materializaron** como modelo dbt. Como `catalogo_metricas.hecho_origen`
es FK a esa tabla, **el portal era incapaz de registrar una métrica sobre un hecho real**: el
desplegable de `GET /api/hechos` solo ofrecía dos claves fantasma. Y había tres definiciones
paralelas de "Ventas Netas" que no se referenciaban: la ficha del portal (sin fórmula, hecho
inexistente), `metrica_valor` (14 claves hardcodeadas) y la medida DAX.

### Habilitadores nuevos en el warehouse

- **`dim_tiempo.dias_habiles_del_mes` + `dias_habiles_transcurridos`** — la primera estaba
  prometida en el comentario del modelo desde siempre y nunca se emitía. Habilitan ritmo real
  y proyección de cierre. Verificado 2026: 21/20/22/20/20/21/23/21 hábiles por mes.
- **`oro.analisis_producto`** (nuevo, 1:1 con `dim_producto`, bothDirections en PBI) — cruza
  demanda 12m contra existencia: última venta, cobertura, rotación, clase ABC de producto,
  `es_ocioso`, `es_sin_rotacion_comercial`, `es_quiebre`, `estado_producto`.
- **`oro.estado_carga`** (nuevo) — frescura por (empresa, dominio) leída de Plata, con DOS
  relojes: `ultima_extraccion` (¿vive el pipeline?) y `fecha_dato_mas_reciente` (¿opera el ERP?).

### DECISIÓN DE DISEÑO IMPORTANTE — ocioso ≠ sin rotación comercial

La primera versión marcaba como ocioso todo lo que tuviera stock y no se vendiera. Resultado:
**Q94.5M de Q99.4M (95%) en rojo** — inútil. La causa: **35,568 artículos con existencia que
NUNCA se facturaron**, porque en una avícola el inventario grande es alimento, medicina y
materia prima que se CONSUME en producción y jamás pasa por una factura.

Se separaron en dos banderas: `es_ocioso` exige historia de venta previa (se compró para
vender, se vendió, dejó de venderse → accionable) y `es_sin_rotacion_comercial` para lo que
nunca se facturó (en comercializadora es alarma; en productora es normal). Con eso Cresta queda
en **18 productos ociosos por Q251k** y —el hallazgo de verdad— **94 productos en QUIEBRE que
movieron Q54M en 12 meses**.

### Medidas: 180 → 293 (113 nuevas)

Familias nuevas, todas en `MEDIDAS_POR_TABLA` de `generar_pbip.py`:
ciclo de efectivo (DPO + **CCC**, reutilizando el DSO y los días de inventario existentes, sin
redefinirlos) · fugas de margen · precio-volumen-mezcla · rotación de clientes (nuevos, activos,
antigüedad) · ritmo y proyección de cierre · inventario ocioso/quiebre · inflación de insumos ·
cumplimiento de pedidos · caja proyectada acumulada · estructura de P&L · frescura del dato.
Las tablas de cartera histórica diaria, que no tenían NI UNA medida, ahora sostienen la
efectividad de cobranza.

3 parámetros de campo nuevos: Vista de liquidez / de inventario / de rentabilidad.

### Hueco cerrado en el validador

`validar_referencias` no detectaba **nombres de medida duplicados**. El nombre es global en el
modelo: dos homónimas en tablas distintas producen TMDL válido, el generador termina en verde y
**Desktop revienta al abrir**. Se agregó el chequeo — y atrapó de inmediato una colisión real
que yo había introducido (`Clientes con saldo vencido` ya existía en Comportamiento de pago;
se eliminó la duplicada en vez de renombrarla, porque era la misma definición).

### Gobierno: catálogo reparado

- `seeds/10_hechos.sql` y `seeds/20_metricas.sql` **reescritos**: 15 hechos reales con
  `tabla_oro`, y 28 métricas cuyas claves son EXACTAMENTE las que emite `oro.metrica_valor`,
  cada una con fórmula en lenguaje de negocio. Todas en `borrador`.
- **Migración `115_catalogo_hechos_reales.sql` + rollback** para bases ya instaladas: inserta
  los reales, reapunta las 5 métricas v1 (conservando su historia de versiones y votos) y
  retira los fantasma. **Probada en base efímera**: aplicada, verificada, revertida al estado
  exacto original, y reaplicada dos veces (idempotente). Seed 20 también idempotente.
- `oro.metrica_valor` pasó de 14 a **28 métricas** en 6 dominios (se sumaron rentabilidad,
  inventario y pedidos).

### Contraste SQL de las métricas nuevas (Cresta)

| Métrica | Valor |
|---|---|
| Ciclo de conversión de efectivo | **89.1 días** (DSO 20 + DIO 128 − DPO 59) |
| Ventas bajo costo | **Q45.8M en 65,175 líneas** · margen perdido Q18.2M · **11.74% de la venta** |
| Brecha contable vs facturado | −Q4.29M (Q385.5M contable vs Q389.8M facturado) = **−1.1%** |
| Inventario ocioso | Q251,660 en 18 productos (0.25%) |
| Sin rotación comercial | Q94.3M en 4,360 artículos (insumos de producción) |
| Quiebre de stock | 94 productos · **Q54.1M de venta anual en riesgo** |
| Backlog | Q12.2M, de los cuales **Q9.0M VENCIDOS** (2,033 líneas) · lead time 3.4 días |

### Auditoría del modelo PBI aplicada (`Prompt_ClaudeCode_PulsoCresta.md`)

Edwin trajo un prompt con 12 defectos detectados en una auditoría. **Cambio de enfoque
obligado: las correcciones van al GENERADOR, no al TMDL** — `generar_pbip.py` reescribe todos
los `.tmdl` en cada corrida y una edición manual se perdería en la siguiente regeneración.
Además el prompt daba por bloqueadas las fases 5 y 6 «por ETL»; no lo estaban (dbt y el
warehouse corren local), así que se ejecutaron de verdad.

- **Fase 0**: `consumo/powerbi/inventario_modelo.py` (nuevo) → `docs/powerbi/inventario-modelo.md`,
  regenerable tras cada corrida.
- **Fase 1**: KEEPFILTERS en 82 medidas. **Decisión de Edwin: `es_intercompania` NO se toca** —
  una medida que declara su grupo en el nombre lo conserva, y ya respetaba los demás filtros
  (el predicado solo reemplaza el filtro de esa columna). Detalle en `docs/powerbi/fase1-keepfilters.md`.
- **Fase 2**: 0 bidireccionales. Las 3 medidas que dependían de la propagación → TREATAS.
- **Fase 3**: fallback en TRES niveles, no dos. `BLANK()` a todo habría borrado conteos y
  porcentajes, que no tienen moneda; el discriminador es la `"Q"` del formatString, así que se
  amplía solo con cada medida de importe nueva.
- **Fase 4**: los 3 Pareto con `ADDCOLUMNS` (dejan de ser O(n²)) y `AVERAGEX(FILTER(…))` →
  `CALCULATE`. Regresión lista en `consumo/powerbi/tests/fase4-regresion.dax` para DAX Studio.
- **Fase 5**: aging por clave entera en los 4 hechos. Macro `aging.sql` emite etiqueta y clave
  del mismo bloque. Las fotos diarias usan `on_schema_change='append_new_columns'` + post_hook
  de relleno: un full-refresh habría destruido el histórico, que es justo lo irrecuperable.
- **Fase 6**: ABC regranulado a (empresa, año, entidad) + `dim_anio`. **RFM y Comportamiento de
  pago NO se regranulan** (decisión de Edwin tras el hallazgo): el RFM mide recencia contra la
  última venta y el comportamiento se arma sobre partidas abiertas, de las que solo hay 4
  cortes — no hay historia que cortar por año. Diseño y alternativas en `docs/powerbi/fase6-diseno.md`.
- **Fase 7**: las **294 medidas quedaron documentadas** (eran 118). Las descripciones explican la
  regla de negocio o la trampa de lectura, no la fórmula. `inventario_modelo.py` ahora las
  imprime junto a cada medida, así que `docs/powerbi/inventario-modelo.md` sirve para
  revisarlas de corrido y corregir terminología — que es lo que falta de esta fase.

**Dos huecos cerrados en los validadores**: nombres de medida duplicados (TMDL válido que
revienta Desktop al abrir — atrapó una colisión real al primer intento) y el falso positivo de
las columnas extendidas `[@x]` de ADDCOLUMNS.

### Ojo operativo

- **`PulsoIronNetwork.*` se retiró del repo, confirmado por Edwin**: el PBI se trabaja con UN
  solo proyecto (Cresta) y para Iron solo se cambia el parámetro `BaseDatos`. Ya no hay dos
  modelos que mantener sincronizados.
- **`FileFallocate` DIAGNOSTICADO — no es concurrencia ni disco.** El error trae
  `HINT: Check free disk space` y despista: hay **168 GB libres**. Y falla igual con **1 thread**,
  así que tampoco es contención. La causa es que el volumen de datos de Postgres es un **bind
  mount de Windows** (`./data` en `infra/local/docker-compose.yml`): sobre NTFS vía WSL2, la
  llamada `posix_fallocate` recibe EINTR al extender un archivo grande y Postgres aborta la
  sentencia. Por eso golpea a los modelos pesados y siempre en la base grande — Iron Network
  (26 MB) pasó 185/185 limpio, Cresta (4.7 GB) no.
  **Arreglo de fondo: mover los datos a un volumen Docker NATIVO en vez del bind mount.** Es
  `pg_dump` → cambiar el compose → `pg_restore`; no se hizo porque toca infraestructura y no
  estaba en el alcance de la sesión. Mientras tanto: reintentar el modelo caído, que pasa.
- `correr.py` acepta un tercer argumento `threads` (`correr.py <org> "plata oro" 2`). Reduce la
  probabilidad del fallo y evita el atasco de 31 minutos en `hecho_venta_linea`, pero **no lo
  elimina**: el build de Cresta terminó 181/185 con `hecho_pago_efectuado` caído, y pasó al
  reintentarlo.

### Pendientes / avisos

- **Efectividad de cobranza** necesita historia: solo hay **4 cortes** de cartera diaria
  (2026-07-27 a 08-02). La medida es correcta; gana sentido conforme se acumulen cortes.
- `costo`/`margen` son 0 en Odoo → las medidas de fuga de margen salen en 0 ahí. Degradan, no
  rompen. Documentado en la guía y en la ficha del catálogo.
- El PBIP debe abrirse en Desktop: el validador comprueba referencias, duplicados y sintaxis
  TMDL, pero **no evalúa DAX**. Las 176 medidas nuevas no se han ejecutado nunca contra el motor.
- Sigue vigente: VPS Hetzner sin montar, SQL Server sin probar con credencial real.

### Estado al cierre (2026-08-06)

Árbol **commiteado y limpio**: `4ea8268`, `f86a238`, `d612751`, `f88547a`. Sin push.

Warehouse reconstruido en los dos tenants — Iron 185/185 y cuadre 0/7; Cresta 181/185 con
`hecho_pago_efectuado` caído por el bind mount y **pasado al reintentarlo**, cuadre 0/70.
Modelo: **36 tablas · 98 relaciones · 294 medidas · 0 bidireccionales**, TMDL válido, 3 visuales
de Edwin intactos.

### Próximo paso concreto (SESIÓN 18)

1. **Edwin abre `PulsoCresta.pbip` en Desktop.** Es lo único que falta para dar por buena la
   sesión: confirmar que las medidas nuevas evalúan sin error, que el segmentador de antigüedad
   ahora sí acota los tramos (era el defecto que corrigió KEEPFILTERS) y correr
   `consumo/powerbi/tests/fase4-regresion.dax` en DAX Studio — la columna `dif` debe ser 0 en
   todas las filas. Si Desktop reporta un error de TMDL, **agregar el caso al validador**, que
   es el patrón establecido.
2. **Revisar terminología** en `docs/powerbi/inventario-modelo.md`: las 294 descripciones están
   escritas pero hay vocabulario de negocio que solo Edwin puede corregir.
3. **Mover el volumen de Postgres a un volumen Docker nativo** (`pg_dump` → compose →
   `pg_restore`). Es la causa raíz del `FileFallocate`; mientras siga el bind mount, cada build
   completo de Cresta tumba un modelo pesado.
4. Backlog anterior sin tocar: saldos de apertura → BALANCE GENERAL, metas de venta desde el
   portal, kardex, lotes, aplicación de pagos (RCT2 → días reales de cobro, que desbloquearía
   el DSO real). Y la brecha ingresos contables vs facturados con el contador — ahora hay una
   medida que la vigila (`Brecha contable vs facturado`, −1.1%).

## ══════ SESIÓN 16 (2026-08-02) — GRUPO COMPLETO EN EL DW ══════

**Foco: prefijos DM_/FC_/MD_ en el modelo PBI · dim_socio_negocio (360° por NIT) · NITs
afiliados en el portal · LAS 10 SOCIEDADES de Cresta extraídas y transformadas · retención
(WTSum) · multi-moneda con moneda de presentación. Cuadre 0/70 desvíos. PBIP 32 tablas /
92 relaciones / 180 medidas, TMDL válido; el reporte de Edwin migró a formato PBIR
(definition/) y sus visuales están intactos.**

### Lo grande

- **10 sociedades registradas** (portal → OADM: nombre/NIT/moneda) y cargadas: proavisa,
  com502, inavisa, ingenieria, lacria, loreto, organicos, sepesa, seragro, svproavis (USD).
  Extracción con intersección de columnas por sociedad (los UDF de Proavisa no existen en las
  demás — fix en extraccion.py `columnas_existentes`).
- **NITs afiliados** (migración 112): tabla + UI (Sociedades) + API auditada; worker los pasa
  a dbt (`nits_grupo`) — gap de /transformar CERRADO. Matching por NIT normalizado
  (`[0-9K]`, macro `es_nit_afiliado`); es_intercompania sin NULLs.
- **dim_socio_negocio** + `socio_clave` en 7 hechos (llave_socio). Duales = 2 registros
  CardCode con mismo NIT (37 en Cresta): el 360° unifica por `socio_unificado` (nombre por
  NIT) + `es_cliente_y_proveedor`. Históricos diarios SIN socio_clave (incrementales).
- **Retención WTSum**: DocTotal llega neto de retención (El Salvador 1%, Q18,232 en 1,372
  facturas). base = DocTotal − VatSum + WTSum en documento canónico y cuadre; WTSum/WTSumFC
  agregados a campo_ingesta. Tolerancia de cuadre ahora 0.0005/fila (redondeo por documento).
- **Multi-moneda** (migraciones 113/114): sociedad declara moneda y moneda_presentacion; si
  difieren se convierte con la serie de la PROPIA sociedad (`plata_tasa_presentacion`, guardas
  de rango y reciprocidad; sin tasa válida → montos `_grupo` NULL = no consolida). Hechos con
  `*_grupo`; medidas base del PBI ya consolidan en GTQ. **svproavis: serie QTZ capturada
  INVERTIDA en SAP (7.63 en vez de 0.131) → estado_serie='invertida', NO consolida hasta que
  corrijan la captura** (proavisa además tiene 1 tasa basura 765,176 el 2026-04-04, la guarda
  la ignora).
- **PBIR**: Desktop migró el reporte a `definition/`; generar_pbip ya no escribe stub si
  existe; validar_reporte valida visual.json PBIR. **NUNCA correr generar_reporte.py** (los
  visuales son de Edwin).

### Cierre multi-moneda (decisión de Edwin, mismo día)

- Serie invertida se **auto-corrige con 1/tasa** (reciprocidad la PRUEBA contra la serie
  espejo del grupo; estado_serie='invertida_corregida'). svproavis YA CONSOLIDA:
  USD 2,491,317 → Q19,042,344 (tasa implícita 7.643). Arrastre de tasa: 92 días (svproavis
  estuvo 69 días sin capturar, ene→abr). Sin serie válida → montos _grupo NULL (solo moneda
  local). Cuadre grupocresta 0/70.
- **Iron Network: SOLO capa Oro actualizada** (168/168 PASS, cuadre 0/7, 76 socios/2 duales,
  tasa 1). Su PBIP NO se regenera — PBI solo Cresta (instrucción explícita). plata_tipo_cambio
  ya normaliza la convención de Odoo (invierte rate): reglas idénticas en ambos ERPs.
- validar_reporte.py ahora valida TODOS los pares modelo/reporte de la carpeta.

### Refactor 2 ejes de moneda (decisión de Edwin, mismo día)

- ORO quedó con DOS ejes: columnas SIN SUFIJO = moneda de PRESENTACIÓN (rigen todo:
  hechos, métricas certificadas, ABC/RFM/comportamiento, proyección, venta diaria) y `_doc`
  = moneda del documento (referencia). El eje `_local` se ELIMINÓ de Oro (vive en Plata,
  donde cuadra contra el ERP). Diarias incrementales conservan el nombre viejo con alias.
- Serie invertida se auto-corrige (1/tasa, estado 'invertida_corregida'); arrastre 92 días;
  svproavis consolida: USD 2.49M → Q19.04M (tasa implícita 7.643).
- PBIP Cresta: medidas base sobre columnas de presentación + PARÁMETROS DE CAMPO
  (MD_Vista de ventas/cartera/compras, generados en TMDL con extendedProperty).
- ⚠ El PBIP de IronNetwork quedó DESINCRONIZADO de su warehouse (columnas renombradas en su
  oro; su modelo PBI aún referencia _local). PBI solo Cresta por instrucción de Edwin — al
  retomar Iron en PBI, REGENERAR su PBIP antes de refrescar.

### Dimensión de DIRECCIONES (hecha, mismo día)

- Ingesta: socios = 'OCRD+CRD1' (9 campos principal), objeto nuevo 'departamentos' (OCST),
  OINV.ShipToCode incluido. plata_direccion (ramas SAP/Odoo) + llave_direccion +
  dim_direccion (DM_Dirección de entrega) + direccion_clave en hecho_venta_linea (join por
  cab.direccion_entrega_codigo, tipo entrega). PBIP Cresta: 33 tablas / 93 relaciones.
- Cobertura Cresta: ~27% de líneas con ShipToCode; depto 21% / municipio 29% de las
  direcciones (calidad de captura del ERP). Mejora futura: fallback a dirección default del
  socio (OCRD.ShipToDef, no extraído aún).
- Se detectó y corrigió una CARRERA de extracción: 10 facturas de proavisa quedaron con
  cabecera sin líneas (posteadas durante la ventana) → re-extraer el objeto la resuelve;
  el cuadre la atrapó (Q208k).
- PBI de Iron: NO SE HACE — decisión de Edwin: cuando el de Cresta esté terminado, solo se
  cambia la base de datos (parámetros Servidor/BaseDatos del PBIP).

### Revisión de onboarding (cierre de sesión 16) — 3 roturas encontradas y reparadas

1. **Seeds faltantes**: lo de direcciones/retención se había configurado solo para org 1 →
   NUEVOS seeds de onboarding `68_paquete_sap_b1_direcciones_retencion.sql` y
   `69_paquete_odoo_direcciones.sql` (probados idempotentes contra ambos tenants; sin el 68,
   plata_direccion revienta el primer build de un tenant nuevo).
2. **`/tmp/correr.sh` estaba PERDIDO** (se borró al recrear el worker) → reemplazado por
   `data-plane/transformacion/herramientas/correr.py` (versionado, montado en /dbt): lee
   erp/base/nits/sociedades de la base de control igual que el worker. Probado.
3. **Init de instalación limpia**: aplicaba TODOS los seeds y los parametrizados con :'org'
   (9 archivos) truenan sin la variable → 02_aplicar_catalogo.sh ahora los omite (son de
   onboarding, no de init). Bug preexistente, agravado por 68/69.

Validación final: cuadre 0/70 (cresta) y 0/7 (iron) · ERP en vivo vs warehouse ene-jul:
loreto Q0.56 y proavisa Q0.67 de diferencia (redondeo), svproavis 0.00 · modelo PBI sin
columnas _local residuales, 93 relaciones coherentes (Calendario 19, Empresa 14, Socio 7,
Dirección 1), parámetros de campo apuntando a medidas existentes, reportes validados.

### SAP sobre SQL SERVER — estructura montada (2026-08-03), PROBAR con credencial real

- Fuente nueva `fuentes/sap_b1_mssql.py` (pymssql; espejo de sap_b1.py): [base].dbo.[tabla],
  INFORMATION_SCHEMA, CUFD igual, SET QUOTED_IDENTIFIER ON (los filtros citan "columnas").
- Despacho por motor 'sqlserver' en extracción/introspección; ERP_POR_MOTOR sqlserver→sap_b1
  (dbt corre idéntico a HANA). Entorno `sap_b1_sqlserver` ya existía; driver → pymssql
  (BD + seed 52). Compose/.env.example: MSSQL_USER/MSSQL_PASSWORD (secreto_ref=MSSQL).
- Worker reconstruido: pymssql 2.3.13 importa, MOTORES = hana|sqlserver|postgres. Smoke OK.
- MAÑANA (Edwin): crear conexión en el portal (entorno sap_b1_sqlserver, secreto MSSQL,
  puerto 1433), credencial al .env, sociedad de prueba con Esquema de origen = nombre de la
  BD (copia SAP de Cresta a nov-2025) → Descubrir → Extraer → correr.py → validar cuadre.

### Pendientes / decisiones abiertas

- IDOR conocido del portal admin (organizacionId por query en todos los controladores):
  enforcement por usuario-org es trabajo de Etapa A.
- Postgres en WSL2 tira "FileFallocate: Interrupted system call" esporádico —
  hecho_pago_efectuado falla ~3 de cada 4 corridas y pasa al reintento (PG 16.14):
  SUBIR imagen de Postgres pronto.
- Guía de páginas del dashboard: consumo/powerbi/GUIA-PAGINAS.md (Edwin arma lo visual).

## ══════ CIERRE DE SESIÓN 15 (2026-08-03) — leer esto primero ══════

**Foco: analítica nueva en Oro (quick wins sin ingesta) + jerarquía contable multinivel +
modelo Power BI actualizado. Todo con dbt build 35/35 PASS en ambos tenants y PBIP regenerado
(29 tablas / 73 relaciones / TMDL válido / 72 visuales existentes intactos).**

### Qué se construyó

- **4 modelos oro nuevos**: `clasificacion_rfm_cliente` (quintiles por empresa, referencia =
  última venta, 1:1 con Cliente como el ABC), `comportamiento_pago_cliente` (riesgo de cartera
  ponderado por saldo + actividad de pagos con contraparte='cliente'),
  `proyeccion_caja_semanal` (CxC/CxP por semana ISO de vencimiento, 'Vencido' anclado al
  corte, etiqueta con año DD/MM/YY por el sortByColumn), `metrica_venta_diaria` (serie densa
  sin huecos, `es_dia_sin_venta`). Los 2 últimos llevan `organizacion_clave` (join por
  empresa_id a dim_organizacion, mismo patrón que los hechos).
- **Feriados GT**: seed `feriados_guatemala` (2024–2028, jueves/viernes/sábado santo, medio
  día 24/31 dic) + `dim_tiempo.es_feriado/feriado_nombre/es_medio_dia`; `es_dia_habil` ahora
  descuenta feriados (es_fin_semana quedó por día de semana, ya no `not es_dia_habil`).
- **Jerarquía contable** (pedido de Edwin): homologada EN PLATA (plata_cuenta) → dim_cuenta
  expone `nivel`, `es_titulo`, `cuenta_padre_codigo`, `nivel_1..5_codigo/nombre` (relleno de
  hoja = ragged aplanada, sin blancos) y `ruta_cuenta`. SAP B1 = recursivo por OACT.FatherNum
  (Cresta: 5 niveles, 10 raíces→342 hojas, títulos = Postable='N'); Odoo = segmentos del
  código visible (4 niveles; nombres intermedios = prefijo, los reales viven en account.group
  no ingestado). VERIFICADO con datos reales de ambos tenants.
- **generar_pbip.py**: +4 tablas (RFM/Comportamiento = extensiones 1:1 bothDirections de
  Cliente; Venta diaria/Proyección = hechos con relación a Calendario y Empresa), jerarquía
  'Jerarquía contable' en dim_cuenta, ORDENAR_POR de semana_etiqueta→semana_offset, **23
  medidas nuevas** (163 total). Regenerados PulsoCresta y PulsoIronNetwork.

### Cómo correr los modelos nuevos (targeted, sin build completo)

El worker tiene `/tmp/dbt/profiles.yml` multi-target (grupocresta/ironnetwork, password por
env_var — lo reescribe el botón /transformar del portal; regenerarlo si hace falta):
`docker exec cresta-worker sh -c 'cd /dbt && DBT_PROFILES_DIR=/tmp/dbt dbt build --select <modelos> --vars "{erp: sap_b1}" --target grupocresta'`

### Hallazgos de datos (sesión 15)

- `hecho_venta_linea` de Cresta solo tiene **proavisa** (loreto sin ventas cargadas).
- Pagos: contraparte 'cliente' 114,918 vs 'cuenta_contable' 1,727; estado siempre 'otro'.
- Cartera se extrae SOLO con partidas abiertas → días reales factura→pago imposibles hoy
  (documentado en el modelo); la ficha usa vencido ponderado + actividad de pagos.
- RFM Cresta: 169 campeones = Q151M (12m); 46 en_riesgo_valioso = Q8.3M; 605 clientes sin saldo.

### Ingesta nueva (misma sesión, continuación): PEDIDOS + MAYOR CONTABLE

- **Seeds 66/67** aplicados a grupocresta e ironnetwork (política pedidos_venta + cartera→
  mayor completo con filtro `(abiertas OR RefDate>=2026)` + JDT1.ProfitCode). DECISIÓN: no
  se crea otro objeto sobre JDT1 — dos objetos con la misma fuente pisan el mismo bronce.
- **Modelos**: plata_pedido_linea / hecho_pedido_linea (backlog: OpenQty · qty−qty_invoiced,
  es_abierta, fecha entrega = relación inactiva) y plata_movimiento_contable /
  hecho_movimiento_contable (solo resultados; monto_resultado en la naturaleza de la cuenta;
  centro de costo: ProfitCode · primera clave de analytic_distribution). Fuentes nuevas en
  _fuentes.yml (ordr/rdr1/sale_order/sale_order_line).
- **Iron Network verificado en vivo**: extracción 200 pedidos/374 líneas → 13/13 PASS →
  **cuadre al centavo ingresos contables = ventas facturadas (Q2,235,501.13)**. PBIP 31
  tablas/85 relaciones/174 medidas; visuales intactos.
- **HANA estaba INALCANZABLE (connection refused a 10.10.143.69:30015)**: la extracción SAP
  quedó configurada pero NO corrida. PulsoCresta se regeneró con 30 tablas (sin Pedidos;
  Resultados contables existe vacío).

### Extracción SAP COMPLETADA (con HANA ya alcanzable, misma sesión)

- **Pedidos proavisa**: 32,408 ORDR / 80,768 RDR1 → hecho_pedido_linea con **backlog vivo de
  Q7.76M en 2,000 líneas abiertas** (fill rate ~96%). CORRECCIÓN: ORDR usa `DocCur` (una R),
  no DocCurr — seed 66 y plata corregidos.
- **Mayor completo proavisa**: 1,540,049 JDT1 / 394,296 OJDT. CORRECCIÓN IMPORTANTE: el
  paquete base tenía filtro de CAMPO `Account IN (cuentas de control)` que se combinaba con
  AND y anulaba el OR del período → el seed 66 ahora ABSORBE la lista dentro del
  filtro_origen: `((Account IN (...) AND BalDue<>) OR RefDate>=2026)` y retira el filtro de
  campo (con guardián de idempotencia).
- **Cuadre 7/7 sigue al centavo** tras la ampliación (los saldos cambiaron vs 2026-08-01
  porque el snapshot es más fresco — el control contra el ERP del día cuadra exacto).
- **P&L Cresta vivo**: ingresos contables Q231.9M / gastos+costos Q238.9M (ene–ago 2026);
  por mes y por centro de costo (mucho gasto con centro 'No definido' — los asientos sin
  ProfitCode; normal). OJO: ingresos contables 231.9M vs ventas facturadas 236.6M (~2%) —
  revisar la naturaleza de esa brecha con el contador (anticipos/ajustes/cuentas no-I).
- **PulsoCresta regenerado: 31 tablas / 85 relaciones** (igual que Iron), visuales intactos.
- Nota operativa: plata_partida_cartera falló 2 veces de forma TRANSITORIA con 1.5M filas
  (dos modelos pesados en paralelo, threads 4); al reintentar pasó. Si se repite: bajar
  threads o correr en serie.

### Próximo paso concreto (SESIÓN 16 — plan dicho por Edwin al cierre)

1. **Edwin hará una REVISIÓN del modelo de datos de PBI** (abrir PulsoCresta.pbip en Desktop:
   31 tablas / 85 relaciones / 174 medidas), **lo publicará al servicio y empezará a crear sus
   análisis** (dashboards en archivo aparte conectado en vivo, mismo workspace — reglas
   Publish to Web en consumo/powerbi/README.md). Apoyarlo en lo que encuentre en la revisión.
2. Montaje del VPS Hetzner (pendiente de sesión 14: contratar CPX31 Ashburn + dominio →
   RUNBOOK.md).
3. Posible siguiente dato: **saldos de apertura por cuenta** (al 31-dic-2025) para armar el
   BALANCE GENERAL. Estado de resultados, libro mayor, cartera e inventario valorizado YA
   funcionan; balance solo necesita la apertura. Revisar con el contador la brecha ingresos
   contables (231.9M) vs ventas facturadas (236.6M) de Cresta (~2%).
4. Backlog restante: metas desde el portal → kardex → lotes → aplicación de pagos.
   **Listas de precios DESCARTADAS por Edwin**: el precio de venta y el costo se analizan
   con lo grabado en cada documento (ya cubierto por hecho_venta_linea), no con la lista.
5. Árbol sin commitear (sesiones 14 y 15 completas).

## ══════ CIERRE DE SESIÓN 14 (2026-08-02) — leer esto primero ══════

**Foco: PORTAL DE USUARIO nuevo (`consumo/portal/`) + camino a producción en VPS. Todo
implementado y verificado E2E por curl en Docker local.**

### Decisiones de Edwin (esta sesión)

1. **Power BI vía Publish to Web, riesgo aceptado** (URLs públicas, sin RLS de PBI). Control de
   acceso a nivel aplicación; la URL solo se entrega autenticada al abrir el visor + auditoría
   `ver_tablero`. No se puede proteger del todo (vive en el DOM del iframe) — Edwin lo sabe.
   Futuro real = Power BI Embedded (el modelo de perfiles ya quedaría compatible).
2. **Tenant por HASH en la URL**: `gobierno.organizaciones.hash_tenant` (migración 111);
   URL de ingreso `portal.<dominio>/<hash>`. Un solo dominio de usuario; onboarding no toca Caddy.
3. **Producción: VPS único con Docker Compose** (Hetzner/DO/Contabo) + Caddy TLS, 2 dominios.
4. **Mismo repo, app separada** (`consumo/portal/` = api NestJS :3002 + web Angular :8081).
5. **Tablas de acceso en la BD del TENANT** (esquema `portal`, migración 110) — aísla errores.
6. **Branding (color + logo) se carga en el portal admin** y el portal usuario lo toma.
7. Frontend en **Angular + TS** (lo que Edwin domina).

### Qué se construyó (compilado, contenedores corriendo, E2E verificado)

- **Migraciones** (+rollbacks, probadas en BD efímera y aplicadas al stack local):
  `110_portal_tenant.sql` (esquema `portal` por tenant: usuarios, perfiles, usuario_perfiles,
  tableros, perfil_tableros, **perfil_alcances** (preparación chatbot), auditoria) y
  `111_hash_tenant_branding.sql` (hash_tenant UNIQUE NOT NULL con backfill + logo bytea/mime).
  OJO: `02_aplicar_catalogo.sh` ahora OMITE `*_tenant.sql` (solo van a bases dw_*).
- **Portal admin**: `TenantDbService` (pools por `base_datos_dw`), módulo `portal-org`
  (GET estado / POST admin siembra / CRUD tableros bajo `/api/organizaciones/:id/portal/*`),
  logo por organización (PUT/GET/DELETE `:id/logo`, base64 JSON máx 300KB, body limit 2mb en
  main.ts), hash generado al crear org, feature Angular **"Portal usuario"** (URL de ingreso
  copiable + estado + sembrar admin + logo + CRUD tableros). `environment.portalUsuarioUrl`.
- **API portal usuario** (`consumo/portal/api`): rutas `/api/t/:hash/...`; guard global con
  JWT PROPIO (`PORTAL_JWT_SECRET`), token↔hash del path (cruzado → 401), usuario releído de la
  BD en cada request (revocación inmediata), `@SoloAdmin()` con es_admin fresco. Branding/logo
  públicos con 404 genérico. Tableros: listado SIN url_publica; detalle con URL + auditoría.
  Admin org: usuarios (crear/editar/restablecer password/asignar perfiles — no puede
  auto-quitarse admin), perfiles (CRUD + tableros + alcances), auditoría paginada.
- **Web portal usuario** (`consumo/portal/web`): Angular 17 standalone bajo `/:hash`; login
  white-label, cambio de contraseña forzado, inicio (tarjetas Tableros/Chatbot-próximamente),
  grid de tableros, visor iframe (sandbox), admin (usuarios/perfiles con drawers de asignación
  /auditoría), página neutra sin hash. Token en localStorage POR tenant (`portal_token_<hash>`).
- **Compose local**: servicios `api-usuario` (:3002) y `web-usuario` (:8081), perfil portal.
  `.env` raíz: PORTAL_USUARIO_PORT, WEB_USUARIO_PORT, PORTAL_JWT_SECRET, PORTAL_JWT_EXPIRA_EN
  (agregados también a `.env.example`).
- **Producción** (`infra/produccion/`): docker-compose (postgres+api/web admin+api/web usuario+
  worker+caddy+respaldo diario pg_dump c/rotación), Caddyfile (2 dominios; REEMPLAZAR
  example.com), `.env.produccion.example` (rol dedicado `portal_app` para el portal usuario),
  `respaldo.sh`, **RUNBOOK.md** (ufw 5432 solo IP Cresta + advertencia iptables de Docker,
  grants de portal_app, migración local→VPS SOLO por pg_dump/pg_restore, onboarding prod).
- **Fix transversal**: parser pg de int8→Number en ambos APIs (los ids salían como string).

### E2E verificado por curl (datos de prueba creados y LIMPIADOS al final)

Alta tablero (admin) → fila en dw_grupocresta.portal.tableros ✔ · siembra admin (2º intento
409) ✔ · login con temporal → cambio forzado ✔ · perfil+tablero+alcances+usuario final ✔ ·
listado sin URL / visor con URL + auditoría ver_tablero ✔ · token cruzado a ironnetwork 401 ✔ ·
no-admin a /admin 403 ✔ · dw_ironnetwork intacta ✔.

### Reglas Publish to Web verificadas (documentadas en consumo/powerbi/README.md)

Modelo y dashboards en el MISMO workspace · medidas SIEMPRE en el modelo (nunca en el archivo
del dashboard) · sin RLS/DirectQuery/R/paginados · refresco programado del modelo requiere
on-premises data gateway (Windows) hacia el Postgres · Pro + tenant setting Publish to web ·
validar con un embed code de prueba ANTES de construir todos los dashboards.

### Correcciones post-implementación (misma sesión)

- **Seguridad (XSS almacenado por logo SVG)**: allowlist reducido a PNG/JPG/WebP (SVG excluido:
  puede llevar script y se sirve same-origin), validación de **magic bytes** en el upload, y
  cabeceras de defensa en ambos endpoints de logo (`nosniff`, `Content-Disposition: inline`,
  `CSP default-src 'none'; sandbox`) — verificadas en vivo con un PNG temporal.
- **Bug NG0600**: el feature "Portal usuario" del admin se quedaba en "Cargando estado…" —
  `cargar()` escribe signals síncronamente dentro de `effect()`; corregido con
  `allowSignalWrites: true`. OJO: `sociedades.component` tiene el mismo patrón latente (solo
  dispara si no hay organización activa).
- **Fix pg int8**: parser global int8→Number en ambos APIs (los ids salían como string).

### Decisión de hosting (2026-08-02, cierre)

**Hetzner Cloud, plan CPX31 (4 vCPU/8 GB/160 GB NVMe/20 TB) en Ashburn, ~US$17/mes** + 1 solo
dominio (~$12/año) con subdominios `admin.` y `portal.`. Evaluados y descartados: Vultr Miami
(mejor latencia, doble precio), DO (caro), Contabo (estabilidad/soporte mixtos). Hetzner: SLA
99.9% (superado en la práctica), ISO 27001 + GDPR + BSI C5, DDoS incluido. Ver memoria
`hosting-hetzner-produccion`.

### Próximo paso concreto (SESIÓN 15 — mañana)

1. **Edwin contrata**: cuenta Hetzner + CPX31 Ashburn + dominio → montamos producción con
   `infra/produccion/RUNBOOK.md` paso a paso (secretos NUEVOS, ufw 5432 solo IP Cresta, rol
   `portal_app`, dump/restore, Caddyfile con dominios reales, `portalUsuarioUrl` en el
   environment del web admin antes del build).
2. Edwin: probar la UI local (admin :8080 → Portal usuario → sembrar admin; usuario
   :8081/<hash>), publicar un dashboard real con Publish to Web y pegar la URL.
3. Power BI Service: tenant setting Publish to web + gateway en la oficina para el refresco.
4. Pendientes vivos de sesiones anteriores: `nits_grupo` en /transformar, `medio_pago` Odoo
   null, filtro_origen 2027, recablear catálogo del portal al canónico v2.
5. **Árbol sin commitear** (toda la sesión 14): commitear al retomar si Edwin lo pide.

## ══════ CIERRE DE SESIÓN 13 (2026-08-01, noche) — leer esto primero ══════

**Foco: onboarding de organización nueva VALIDADO con un ensayo real de punta a punta, y la
estrategia de campos de usuario (UDF) implementada — 2.6 millones de valores UDF de Cresta ya
viven en `oro.campo_usuario`.**

### Onboarding probado EN VIVO (org de prueba `demotest`, creada y eliminada)

Camino completo: alta por el API del portal → `createdb dw_demotest` + esquemas → paquete base
59 + extensión 65 → Descubrir/Extraer (6,632 filas) → primera carga completa → **cuadre 7/7 y
oro idéntico a ironnetwork** (mismo origen) → PBIP generado y válido → segunda corrida POR
OBJETO desde el portal (67 nodos OK) → limpieza total.

**Huecos encontrados y corregidos:**
1. **El portal no manejaba `base_datos_dw`** (el worker la exige): schema Drizzle + DTO +
   servicio ahora la derivan (`dw_<codigo>`) al crear la organización. API reconstruida.
2. **Los seeds 60–63 estaban clavados a grupocresta/ironnetwork**: una org nueva no recibía
   pagos/inventario/TC. Nuevos **64_paquete_sap_b1_extension.sql** y
   **65_paquete_odoo_extension.sql** parametrizados por `-v org=` (y `company=` en Odoo), con
   los nombres VERIFICADOS (Canceled/Status/CredSumFC/StockValue). Son el camino de onboarding;
   60–63 quedan como historia aplicada.
3. **La PRIMERA corrida no puede ser por objeto** (los selectores `modelo+` cruzan dimensiones
   de otros objetos que aún no existen → todo falla): primera vez = `correr.sh <org> <erp>
   "plata oro"`; después el botón Transformar funciona por objeto en cualquier orden.
4. **Runbook nuevo: `docs/ONBOARDING-nueva-organizacion.md`** con el paso a paso verificado.
5. OJO operativo: el worker REESCRIBE `/tmp/dbt/profiles.yml` con un solo target en cada
   /transformar → correr.sh puede fallar con "target no existe"; regenerar el profiles
   multi-target antes de corridas manuales.

### Campos de usuario (UDF) — estrategia de 3 niveles, implementada

Pedido de Edwin: UDFs distintos por cliente, sin romper las tablas estándar, modelando solo
a nivel visual en Power BI.

1. **`oro.campo_usuario`** (nuevo): formato largo (registro × campo × valor), expande
   AUTOMÁTICAMENTE el jsonb de Bronce (claves `U_%` en SAP, `x_%` en Odoo) — cero config por
   tenant: todo UDF que la extracción incluya aparece solo. Cresta: **2,619,439 valores**
   (facturas 2.1M/18 campos — incluye el documento fiscal U_FacSerie/U_FacNum/U_FacNit,
   piloto y vehículo—, líneas 458k/3, productos 41k/11, socios 11k/11 —Segmento, Subcanal,
   Afiliado—, pagos 2.8k/1). Iron: 0 (no usa campos de estudio; el mecanismo queda listo).
2. **Claves sustitutas resueltas dentro de la tabla** (cliente_clave/proveedor_clave/
   producto_clave — 0 sin resolver): en Power BI 'Campos de usuario' se relaciona directo a
   Cliente/Proveedor/Producto y filtra las tablas estándar SIN tocarlas. Los UDF de documento
   quedan como consulta/rastreo por entidad + registro_id (relacionarlos al grano línea sería
   ambiguo).
3. **Promoción gobernada**: cuando un UDF importa de verdad, se mapea a campo canónico en el
   portal (columna real con contrato). Es la vía existente, nada nuevo que construir.

Para activar UDFs: Descubrir el objeto → incluir los que tengan datos → re-extraer →
transformar (campo_usuario está en los selectores de socios/productos/documentos/pagos).

**REGLA DURA en el API (pedida por Edwin): un UDF SIN DATOS no se puede incluir NI mapear**
(`ingesta.service.actualizarCampo` → 400 con mensaje que indica re-correr Descubrir).
Probada en vivo: incluir sin datos = rechazado, con datos = aceptado, mapear sin datos =
rechazado. Evita saturar Bronce/oro con las decenas de U_* vacíos de cada instalación.

### Estado final

- Descubrir corrido sobre OCRD/OITM/OINV+INV1 (diccionario completo con UDFs: 421/379/963
  columnas); 49 UDFs con datos incluidos y re-extraídos.
- dbt 125/125 PASS ambos tenants · cuadre 7/7 y 7/7 · PBIP **25 tablas · 67 relaciones ·
  140 medidas** (nueva tabla 'Campos de usuario' con 2 medidas), validadores en verde.

### Pendientes (sin cambios de fondo)

- `nits_grupo` por el botón Transformar (runbook lo advierte).
- Abrir PBIP en Desktop.
- `medio_pago` Odoo null.

---

## ══════ CIERRE DE SESIÓN 12 (2026-08-01, tarde) — leer esto primero ══════

**HANA volvió: Cresta quedó AL DÍA con todos los dominios nuevos, y se cerró una tercera ronda
de validación (Descubrir contra HANA corrigió 3 supuestos; la lógica de negocio destapó y
resolvió la mezcla cobranza/tesorería).**

### Extracción HANA completa (proavisa, 2026-08-01)

15 objetos extraídos: maestros + documentos (137,026 OINV / 217,851 INV1 — ventas hasta
2026-08-03, facturas adelantadas normales) + cartera (9,092) + **pagos_recibidos 116,645 ORCT**
+ **pagos_efectuados 8,084 OVPM** + **inventario 2,213 OITW** + **tipos_cambio 313 ORTT**.
dbt 122/122 PASS ambos tenants · cuadre CRESTA 7/7 AL CENTAVO (incluye pagos).

### Lo que Descubrir corrigió (3 supuestos míos, 1 acierto del revisor)

- **ORCT/OVPM usan `Canceled`**, no CANCELED (el revisor tenía razón). Config y filtro movidos.
- **La columna FC de tarjeta es `CredSumFC`**, no CreditSumFC (que no existe). FC incluidos:
  CashSumFC/CheckSumFC/TrsfrSumFC/CredSumFC/NoDocSumFC.
- **ORCT/OVPM no tienen DocStatus** (tumbó la primera extracción con error ruidoso — el mejor
  caso): el estado del pago es `Status`.
- **`OITW.StockValue` EXISTE**: el valor de inventario ahora es el contable del ERP
  (OnHand×AvgPrice queda de respaldo). Cresta: Q61.6M en 2,213 posiciones, 0 negativos.

### Hallazgo de negocio: ORCT mezcla cobranza y TESORERÍA

De Q728M "cobrados" en 2026, **Q487M son DocType 'A'** (operaciones contra cuenta contable:
depósitos/traslados, sin cliente) y **Q241M son cobranza real de clientes** — 91% de la venta
con IVA del período (lógico). Nueva columna **`contraparte`** (cliente | proveedor |
cuenta_contable) en plata_pago y ambos hechos + medidas 'Cobros de clientes', 'Cobros de
tesorería', 'Pagos a proveedores', '% Cobrado vs facturado'. Sin esto la "cobranza" del tablero
se triplicaba.

### Nuevo en el motor

- **Miembro `SERVICIO` (-2) en dim_producto**: línea sin código de artículo = servicio/flete/
  gasto (pedido de Edwin). Cresta: 15,104 líneas de compra = Q61.3M (59.5%) ahora son una
  categoría real, no "No definido". producto_clave -1 restante: 0.
- **`tipos_cambio`** end-to-end: ORTT (SAP, 313 tasas, USD≈7.62) y res_currency_rate (Odoo,
  invertida 1/rate para igualar convención). plata_tipo_cambio + oro.tipo_cambio + seed 63.
  INFORMATIVA: los hechos no se reconvierten (C1).

### Power BI: 24 tablas · 64 relaciones · 138 medidas (validadores en verde)

Nuevas: tabla **Tipo de cambio** (promedio/cierre) · **Pareto dinámico** (ranking y % acumulado
para clientes, productos y proveedores — coherente con el ABC del warehouse: desvío máx 5e-7) ·
Ventas/Compras de servicios · Rotación de inventario 12M y Días de inventario · cobranza vs
tesorería. Con las 138 medidas el modelo cubre importes, conteos, promedios, rentabilidad,
comparativos de tiempo, Pareto, aging, caja e inventario — suficiente para construir tableros
sin DAX adicional; lo que falte ya es específico de un análisis.

### Validaciones de esta ronda (todas en verde)

Cuadre 7/7 y 7/7 · prorrateo de saldo = cabecera (4/4 combinaciones, 0.00) · metrica_valor
cuadra al centavo con los hechos (ventas_netas_sin_iva 2026-06 = 32,935,084.74 = ERP) ·
-1 en ventas Cresta: 0 en cliente/producto/moneda · **portal end-to-end probado**: login,
políticas por organización, campos, y POST /ingesta/transformar (organizacionId numérico)
corrió 53 nodos dbt OK.

### Pendientes

- `/transformar` del portal sigue sin pasar `nits_grupo` (gap conocido, solo afecta a Cresta si
  se dispara desde el portal; registrar las 6 sociedades con NIT es el arreglo de fondo).
- Abrir los PBIP en Desktop (calculation group + 138 medidas: si algo truena, agregar el caso
  al validador).
- `medio_pago` Odoo = null (no se extrae el diario).

---

## ══════ CIERRE DE SESIÓN 11 (2026-08-01) — leer esto primero ══════

**Foco: dominio de tesorería (pagos) + inventario + trazabilidad de series + modelo Power BI
"versión completa" (122 medidas, moneda conmutable, formato Q) para que Edwin publique el modelo
al servicio y construya sus dashboards en un archivo aparte.**

### Qué entró al motor (dbt, mismos modelos para ambos ERPs)

- **`plata_pago` + `hecho_pago_recibido` / `hecho_pago_efectuado`.** SAP: ORCT/OVPM — el monto es
  la SUMA DE MEDIOS (CashSum+CheckSum+TrsfrSum+CreditSum; ORCT no tiene DocTotal), filtro
  `CANCELED='N'` (misma trampa que documentos). Odoo: `account_payment` (526 filas; se excluyen
  draft/canceled/rejected; `amount_company_currency_signed` es negativo en outbound → abs()).
  Ambos tipos POSITIVOS; el sentido lo da `tipo_pago`. Conceptos `pagos_recibidos` /
  `pagos_efectuados` agregados a `plata_control_cuadre` (7/7 cuadran).
- **`plata_inventario` + `hecho_inventario`** — foto por (empresa, almacén, producto). SAP: OITW
  (valor = OnHand × AvgPrice, filtro `"OnHand" <> 0`). Odoo: stock_quant (solo ubicaciones
  `internal`) + stock_location; el VALOR sale de `stock_valuation_layer` por producto y se
  prorratea a almacenes por cantidad. El almacén Odoo se resuelve por el prefijo de
  `complete_name` contra `stock_warehouse.code`.
- **`clasificacion_abc_proveedor`** — espejo del ABC de clientes sobre compras (sin margen).
- **Saldo en facturas:** `hecho_venta_linea` y `hecho_compra_linea` llevan
  `saldo_pendiente_local` **prorrateado por línea** (SUM reproduce el saldo del documento;
  documentos con total 0 se reparten en partes iguales) + `estado_pago`. INFORMATIVO — la
  cartera oficial sigue saliendo del mayor.
- **Trazabilidad:** `serie_codigo` (SAP `Series`; Odoo `sequence_prefix` con fallback al prefijo
  del name), `tipo_documento_origen` y `referencia_externa` ahora llegan a los hechos de línea;
  los pagos llevan `serie_codigo` también.
- **Bugs corregidos:** (0) **Las compras del tenant Odoo salían NEGATIVAS** (−43,556.92): los
  `*_signed` de Odoo van en perspectiva de compañía (compra negativa) mientras SAP las trae
  positivas — el mismo indicador con signo distinto por ERP. La convención canónica es factura
  positiva / NC negativa EN AMBOS FLUJOS; corregido en cabecera, línea (`balance` solo se
  invierte en venta) y control de cuadre. (1) `dim_tiempo` emitía meses/días EN INGLÉS — `TMMonth` depende del
  lc_time del contenedor; ahora arreglos explícitos en español. (2) `es_local` de moneda era
  false para TODAS en Cresta: SAP usa **QTZ** (no GTQ); `plata_moneda` acepta alias
  (`codigos_moneda_local`, default GTQ+QTZ). (3) En Odoo `moneda_documento` era el
  **currency_id numérico** → el join a dim_moneda caía siempre al -1; ahora se traduce con
  res_currency en documento/línea/cartera/pago.

### Metadata-store (seeds 60 y 61, aplicados en vivo)

Políticas nuevas — grupocresta: `pagos_recibidos` (ORCT), `pagos_efectuados` (OVPM),
`inventario` (OITW); ironnetwork: `pagos` (account_payment), `inventario`
(stock_quant+stock_location), `valor_inventario` (stock_valuation_layer). Entidades canónicas
`pago` e `inventario` + contrato `data-plane/canonico/entidades/pago.yml`. Campos `Series` en los
4 documentos SAP y en ORCT/OVPM; `sequence_prefix`/`journal_id` en account_move.
**Los `*SumFC` de ORCT/OVPM quedaron sugeridos SIN incluir** — confirmar con Descubrir contra
HANA antes de incluirlos (una columna inexistente tumba la extracción del objeto).

### Estado de los datos

- **Iron Network: TODO al día (2026-08-01).** Bronce re-extraído completo + pagos (526) +
  inventario (82 quants, 717 capas). dbt 118/118 PASS. 380 cobros Q2.0M / 146 pagos.
- **Grupo Cresta: recargado con el motor nuevo pero los datos siguen al 2026-07-28 — HANA
  inaccesible toda la sesión (timeout: se necesita la red corporativa).** Al estar en la red:
  extraer `pagos_recibidos`, `pagos_efectuados`, `inventario` y re-extraer los 4 documentos
  (la ventana 2026 recarga todo y trae `Series`). `bronce.orct/ovpm/oitw` existen VACÍAS (se
  crearon para que dbt compile); la extracción las llena.
- El worker se recreó: `/tmp/dbt/profiles.yml` y `/tmp/correr.sh` se regeneraron. OJO: el compose
  hay que levantarlo con `--env-file ../../.env` (el .env vive en la RAÍZ del repo, no junto al
  compose; sin eso api/worker arrancan con credenciales vacías).

### Power BI (regenerado, ambos proyectos idénticos salvo BaseDatos)

**23 tablas · 61 relaciones · 122 medidas** (Ventas 36, Compras 22, CxC 18, CxP 9, Pagos 6+7,
Inventario 5, ABC 10+9) · validadores en verde · 5 páginas/72 visuales regenerados en ambos.
- **Toda medida de importe lleva formato `"Q" #,0`** (sin decimales).
- **Grupo de cálculo «Moneda de análisis»** (pedido de Edwin): *Quetzales (local)* /
  *Moneda original* — conmuta las medidas base a las columnas `*_doc` vía SWITCH +
  ISSELECTEDMEASURE; las derivadas pasan sin conmutar. Solo tiene sentido con filtro de Moneda.
- Comparativos completos para ventas/compras/pagos: mes anterior, año anterior, MTD, QTD, YTD,
  **YTD año anterior**, variaciones, media móvil 3M, 12 meses móviles. Promedios: diario, por
  documento, por línea, por cliente/proveedor.
- ABC Proveedor ↔ Proveedor con bothDirections (1:1), igual que el ABC de clientes.
- **`generar_pbip.py` ya NO pisa `report.json`** (solo lo crea si no existe) — el flujo de Edwin
  es: regenerar modelo → publicar al servicio → dashboards en archivo aparte conectado en vivo
  (documentado en el README de powerbi).
- Validadores extendidos: PALABRAS acepta calculationGroup/calculationItem/formatStringDefinition
  y las referencias DAX de los calculation items también se verifican.

### Segunda ronda: validación adversarial (pedida por Edwin) — 9 hallazgos, todos corregidos

Revisor adversarial sobre el código nuevo + batería de integridad (grano/duplicados 0, plata↔oro
0 filas y 0 centavos de desvío en 6 dominios × 2 tenants, 0% de -1 inesperados, 123 medidas sin
duplicados ni colisiones, portal API OK por organización). Correcciones aplicadas y recargadas:

1. **Compras del tenant Odoo salían NEGATIVAS** (los `*_signed` van en perspectiva compañía) →
   convención canónica factura+/NC− en ambos flujos, aplicada en cabecera/línea/cuadre.
2. **"Con IVA" era igual a "sin IVA" en Odoo** (el balance de línea excluye impuesto) → IVA local
   derivado con la razón price_total/price_subtotal de la propia línea. Verificación: da
   exactamente 12% en Iron (el IVA guatemalteco).
3. **`saldo_documento_local` Odoo estaba en moneda del documento y positivo en NC** → ahora usa
   `amount_residual_signed` (extraído nuevo, seed 62) con el factor de flujo.
4. **La cartera de Cresta caía 98.95% al miembro moneda -1**: JDT1.FCCurrency solo se llena en
   moneda extranjera → nulo se resuelve a la moneda local del ERP (QTZ).
5. **Los ejes `_doc` de SAP valían 0 en documentos de moneda local** (DocTotalFC/TotalFrgn/FC*
   solo se llenan en extranjera) → en moneda local el eje _doc = local (cabecera, línea, cartera
   y pagos). Sin esto la conmutación 'Moneda original' mostraba Q0 para el 99.9% de Cresta.
6. **Prorrateo de saldo sobrecontaba con pesos nulos** → coalesce en peso y suma.
7. **Valor de inventario Odoo se duplicaba si un producto sumaba cantidad 0 en ≥2 almacenes** →
   reparto en partes iguales en ese caso.
8. **'Media móvil 3 meses' promediaba DÍAS, no meses** (DATESINPERIOD itera fechas) → 
   `AVERAGEX(VALUES(Calendario[anio_mes]), …)` dentro del período. Ambas (ventas y compras).
9. **`formatStringDefinition` del item 'Moneda original' pisaba el formato de TODAS las medidas**
   (los % salían como "0") → IF(ISSELECTEDMEASURE(las 10 conmutadas), "#,0",
   SELECTEDMEASUREFORMATSTRING()).
   Además: `CANCELED` de ORCT/OVPM puede llamarse `Canceled` según versión → plata y cuadre
   aceptan ambas grafías; campo variante sembrado sin incluir (Descubrir confirma) — seed 62.
   Y las medidas de descuento dejaron de ser 0: descuento por línea real en ambos ERPs
   (SAP: (PriceBefDi−Price)×Qty; Odoo: discount%) — Cresta: Q256k en 53,986 líneas.

Estado final: dbt 118/118 en ambos · cuadre 5/5 y 7/7 · saldo prorrateado = cabecera al centavo ·
PBIP regenerado y validado (23 tablas, 61 relaciones, 122 medidas, 5 páginas/72 visuales).

### Pendientes

- **HANA (red corporativa):** extraer pagos+inventario+documentos de Cresta (arriba). Luego
  `correr.sh grupocresta sap_b1 "plata oro" '<nits>'` y regenerar PulsoCresta.
  **Antes de extraer pagos: correr Descubrir sobre ORCT/OVPM** y confirmar la grafía de
  CANCELED/Canceled y la existencia de los *SumFC (hoy excluidos).
- **`/transformar` del portal no pasa `nits_grupo`** — si Edwin dispara Transformar desde el
  portal, `es_intercompania` se recalcula con lista vacía. Las corridas manuales lo pasan bien.
  Arreglo correcto: registrar las 6 sociedades de Cresta con su NIT y que el worker arme la
  lista desde `gobierno.sociedades`.
- El PBIP **no se abrió en Desktop** esta sesión (calculation group nuevo: si Desktop reporta
  error de TMDL, agregar el caso al validador — patrón establecido).
- `medio_pago` en Odoo va null (el diario no se extrae); si se quiere, agregar `account_journal`.
- Carpeta basura `metadata-store;C` (vacía, accidente del 22-jul) eliminada.

---

## ══════ CIERRE DE SESIÓN 10 (2026-07-28) — leer esto primero ══════

**Foco: el portal dejó de mezclar tenants, el pipeline se recargó con la regla de datos nueva
(todo 2026) y el modelo de Power BI se rehízo para presentarlo a un cliente.**

### Regla de datos vigente (decisión de Edwin, 2026-07-28)

**Todo 2026 desde el 1 de enero.** Implementada como `filtro_origen` de política:
`"DocDate" >= '2026-01-01'` en los 4 documentos de Cresta + ventana de 12 meses (el filtro es el
que manda; la ventana solo evita que el lookback recorte por encima).

**La cartera NO se filtra por fecha** — es un saldo, no un flujo: una partida abierta de
noviembre 2025 sigue siendo saldo por cobrar hoy. `hecho_cartera_cobrar` arranca 2025-11-30 a
propósito. Iron Network tampoco lleva filtro de fecha porque su objeto `movimientos` alimenta
cabecera, líneas Y cartera: filtrarlo recortaría la cartera.

ATENCIÓN: el filtro es una fecha FIJA. Al entrar 2027 hay que revisarlo (o convertirlo en una
estrategia "año en curso" del motor, que hoy no existe).

### Estado de los datos (verificado, cuadre 5/5 en ambos tenants)

```
                          Grupo Cresta (SAP B1)   Iron Network (Odoo 18)
plata_documento_comercial         141,992                   452
oro.hecho_venta_linea             214,702                   540
oro.hecho_compra_linea             24,500                   157
rango de ventas            2026-01-01 -> 07-28     2026-01-08 -> 07-24
control de cuadre             5/5 al centavo          5/5 al centavo
```

### Bugs reales corregidos (todos estaban en producción)

1. **El portal mezclaba los dos tenants.** `listarPoliticas()` y `listarCampos(objeto)` no
   filtraban por organización: `productos` mostraba OITM (SAP) y product_product +
   product_template (Odoo) en la misma lista. La BD ya era multi-tenant (migración 102); el API
   y la UI estaban atrasados. `schema.ts` ni declaraba `organizacionId` y marcaba `objeto` como
   `.unique()`.
2. **`/transformar` nunca se cableó con `organizacion`** (pendiente que ESTADO.md marcaba): el
   worker exige el código de la organización y el API le mandaba `sociedad` → 422 siempre.
3. **`_selector_de_objeto` del worker** buscaba `where objeto = %s` sin organización → con dos
   tenants tomaba la política de cualquiera.
4. **Las políticas de documentos no reconstruían las líneas.** `plata_documento_linea` lee de
   Bronce directo (no desciende de `plata_documento_comercial`), así que
   `plata_documento_comercial+` no lo alcanzaba y el cuadre comparaba cabeceras nuevas contra
   líneas viejas.
5. **Tolerancia del cuadre no escalaba**: absoluto de 0.05. Con 25k líneas daba 0.03 (pasaba),
   con 215k da 0.69 (bloqueaba). Ahora mixta: `greatest(0.05, filas * 0.00001)`.
6. **El portal abortaba el fetch al worker a los 5 min** y reportaba "no se pudo contactar el
   worker" mientras dbt terminaba bien. Ahora `WORKER_TIMEOUT_MS` (30 min por defecto).
7. **Sociedades huérfanas**: el portal las creaba sin `organizacion_id` (era nullable). Una
   sociedad sin organización es inextraíble (el worker deduce el tenant desde ella).
8. **`ODOO_USER` / `ODOO_PASSWORD` no llegaban al worker** — faltaba inyectarlas en el compose.

### Migraciones nuevas (Nivel 2, con rollback)

- `104_plan_por_organizacion.sql` — `plan_ingesta` era global; `nombre` era UNIQUE global.
- `105_sociedad_organizacion_obligatoria.sql` — `organizacion_id` → NOT NULL.

`sociedades.empresa_id` sigue UNIQUE **global** a propósito: el worker resuelve la sociedad por
`empresa_id` y es la etiqueta de trazabilidad en Bronce. Cambiarlo obliga a tocar el worker.

### Portal: eje de configuración = ORGANIZACIÓN

Decisión tomada con Edwin: la política de ingesta pertenece a la **organización** (el ERP es de
la organización; las 6 sociedades de Cresta leen las mismas tablas). La **sociedad se elige al
ejecutar** (Descubrir / Extraer). Lo contrario obligaría a duplicar 12 políticas × 6 sociedades.

- Nuevo `core/organizacion.service.ts` + selector en la barra superior (persiste en
  localStorage, arrastra el color de marca). Ingesta, Campos y Sociedades lo siguen.
- Los GET de `/ingesta/politicas|planes|campos` y `/sociedades` **exigen** `organizacionId`.
- `descubrir` / `extraer` / `transformar` verifican que la sociedad pertenezca a la organización.
- En "Mapea a" el desplegable ofrece solo los campos canónicos **sin asignar**; los tomados
  salen deshabilitados con el nombre de la columna que los ocupa. Las filas con duplicado
  preexistente se marcan en rojo. (Había 4: `estado` desde CANCELED y desde DocStatus.)

### Oro: dos objetos nuevos

- **`clasificacion_abc_cliente`** — Pareto sobre venta a terceros, calculado en el WAREHOUSE
  (no en DAX) para que Power BI, reportes y el futuro agente usen la misma definición. Grano:
  una fila por (empresa, cliente); los ámbitos año/histórico son COLUMNAS — con dos filas la
  clase no puede filtrar Ventas sin volver ambiguo el modelo. Excluye intercompañía.
  Cresta: 43 clientes = 79.6% de la venta. Iron Network: 12 = 79.0%.
- **`dim_rango_aging`** — rangos con columna de orden (sin ella `+90` sale antes que `1 a 30`).
  Se relaciona con los 4 hechos de cartera por `rango_aging` (texto, 6 valores) para no tocar
  los hechos. Test de `relationships` para que el `case` y el catálogo no se desincronicen.

### Power BI (regenerado)

19 tablas · 48 relaciones · **74 medidas repartidas en sus tablas** (Ventas 27, CxC 18,
Compras 10, CxP 9, ABC 10) · 5 páginas · 72 visuales. La tabla `_ Métricas` **desapareció**.

**Prueba clave del producto:** el modelo generado desde `dw_grupocresta` y desde
`dw_ironnetwork` es idéntico archivo por archivo salvo el valor por defecto del parámetro
`BaseDatos`. Un solo PBIP sirve para SAP B1 y para Odoo.

Nuevo `consumo/powerbi/validar_reporte.py`: cruza report.json contra el TMDL (tablas, columnas,
medidas), detecta visuales fuera del lienzo y solapes. Atrapó 8 solapes reales.

El generador ahora **borra las tablas de fecha automáticas de Desktop** (`LocalDateTable_*`,
`DateTableTemplate_*` — eran 33 archivos huérfanos) y escribe
`annotation __PBI_TimeIntelligenceEnabled = 0` para que no vuelvan.

### Próximo paso

Edwin abre `consumo/powerbi/PulsoCresta.pbip` en Desktop y construye las visuales y el análisis.
Si sale un error de TMDL, **agregarlo al validador** (patrón establecido en la sesión 9).

### Pendientes conocidos

- **No se abrió en Desktop** — los validadores cubren sintaxis TMDL, referencias cruzadas,
  requisitos del calendario y geometría, pero hay errores que solo aparecen al abrir.
- **`generar_plata` no la usa ningún modelo** (quedó huérfana al pasar al paquete base en git).
  Decidir: retirarla o reactivarla. Mientras siga ahí, la cobertura "8/18 campos cubiertos" de
  la pantalla de Campos mide contra algo que no se ejecuta.
- **`clientes_perdidos` = 0** y es correcto: con datos solo de 2026, histórico y año en curso son
  el mismo período. Cobra sentido con más de un año cargado.
- **El proyecto se llama `PulsoCresta`** y se va a mostrar a Iron Network. Renombrarlo a un
  nombre neutro es cambiar un argumento del script (implica renombrar carpetas).
- **Tablas del metadata-store aún globales que deberían ser por tenant**: `conexiones`,
  `glosario_negocio`, `linaje`. Decisión pendiente en `catalogo_metricas` (+ versiones y
  aprobaciones): separar por organización o marcar "base vs extensión".
- **Bind mount de Postgres en NTFS**: `FileFallocate(): Interrupted system call` intermitente al
  materializar tablas grandes (no es falta de espacio; hay 186 GB libres). Reintentar funciona.
  Mover el volumen a uno nombrado de Docker lo elimina y acelera mucho la escritura.

---

## ══════ CIERRE DE SESIÓN 9 (2026-07-26) — leer esto primero ══════

**Sesión larga y muy productiva: se construyó el pipeline completo end-to-end sobre DOS ERPs
reales, con datos productivos y cuadre al centavo.** Detalle abajo.

### Dónde quedó todo

```
cresta_dw        control: metadatos + gobierno, 2 organizaciones, 19 objetos, 320 campos mapeados
dw_grupocresta   bronce (17 tablas) → plata (13) → oro (11 dims + 6 hechos + 2 métricas)
dw_ironnetwork   bronce (9)         → plata (13) → oro (idéntico, mismo código)
consumo/powerbi  PulsoCresta.pbip y PulsoIronNetwork.pbip (18 tablas, 43 relaciones, 24 medidas,
                 3 páginas, 35 visuales)
```

### Cómo correr las capas

```bash
# extraer (CLI local; venv en data-plane/extraccion/.venv, POSTGRES_HOST=localhost)
PYTHONPATH=src .venv/Scripts/python.exe -m cresta_extraccion.main extraer \
  --sociedad proavisa --objeto ventas_factura --desde 2026-06-01 --hasta 2026-07-01

# transformar (worker; OJO con el escapado de --vars, ver más abajo)
export MSYS_NO_PATHCONV=1
docker exec cresta-worker /tmp/correr.sh grupocresta sap_b1 "plata oro" '["109967739","5333814","P05011105181019","90738772","1230263"]'
docker exec cresta-worker /tmp/correr.sh ironnetwork odoo "plata oro"

# regenerar Power BI
POSTGRES_HOST=localhost python consumo/powerbi/generar_pbip.py dw_grupocresta PulsoCresta consumo/powerbi
```

### PRÓXIMO PASO CONCRETO

1. **Edwin abre el PBIP regenerado y valida los 35 visuales** (cerrar Desktop primero: no detecta
   cambios en archivos del proyecto mientras está abierto). Si algún visual falla, agregar el caso
   al validador de `generar_reporte.py`.
2. Cablear la API NestJS: `/api/ingesta/transformar` todavía llama al worker **sin** `organizacion`,
   que ahora es obligatoria.
3. Recablear el catálogo de métricas del portal al canónico v2 (las 14 métricas nuevas).
4. Escalar a las otras 5 sociedades de Cresta (loreto, organicos, sepesa, seragro, inavisa): es
   registrar sociedad + correr el paquete base, el motor no cambia.

### DUDAS ABIERTAS PARA EDWIN

- **¿Los saldos intercompañía de +90 días son reales o migrados?** `JDT1.DueDate` llega a 2017 y la
  migración de SQL Server fue en noviembre 2025. Cambia la lectura del hallazgo principal.
- **¿Qué pasó el 30 de junio?** Q2,993,549 de venta con Q2,049,042 de margen (68%) contra ~Q1.3M y
  ~20% de un día normal. Parece ajuste de cierre más que venta.
- **¿Se activarán las otras 3 compañías de la base Odoo?** Hoy solo `company_id=1` tiene movimiento.

### Bloqueantes

Ninguno. Ambos ERPs conectan (HANA requiere estar en la red corporativa: desde fuera da timeout
`rc=10060`, no es problema de configuración).

---

## Estado sesión 9 (2026-07-26) · DOS TENANTS CARGADOS Y CUADRANDO

**Hecho y verificado en vivo.** Nomenclatura española (migración 99), tenencia multi-organización
(100/101/102/103), canónico v2 sembrado, paquetes base SAP B1 y Odoo 18, y **carga real de las dos
empresas** con cuadre exacto contra sus ERPs.

**Arquitectura de aislamiento:** 1 instancia Postgres · `cresta_dw` = plano de control
(metadatos+gobierno, un solo portal para ambos tenants) · `dw_grupocresta` y `dw_ironnetwork` =
planos de datos separados (bronce/plata/oro). Los datos de dos clientes nunca comparten base.

**Cargado (junio 2026 para documentos por DocDate — decisión de Edwin para poder cuadrar; la
política de producción queda por UpdateDate/write_date):**
- **Cresta**: 7 maestros + ventas 18,310 docs/25,196 líneas + compras 944/3,597 + NC 51/77 +
  cartera 9,684 partidas. Ventas junio con IVA 37,419,526.89 · sin IVA 33,708,774.89 ·
  CxC 92,353,298.03 · CxP −47,933,183.12.
- **Iron Network**: 6 maestros + movimientos 968 asientos/2,631 líneas.
  CxC 553,009.54 (74 partidas) · CxP −14,668.06 (5) — **idéntico al diagnóstico directo**.

**TRES BUGS QUE LOS DATOS DELATARON (ninguno se habría visto sin cuadrar):**
1. **`CANCELED='C'` en SAP B1.** Por cada documento anulado ('Y') B1 crea uno de cancelación ('C')
   por el MISMO importe (1,819 y 1,819 en el histórico, Q132,639,220.39 cada grupo). Filtrar
   `<> 'Y'` inflaba junio en **Q1,634,294.22**. El filtro correcto es `= 'N'`.
2. **Claves distintas padre/hija en Odoo.** `account_move.id` → `account_move_line.move_id`.
   El encadenamiento trajo 842 líneas en vez de 2,631. Formato nuevo: `clave_natural='id>move_id'`.
3. **Contraseña y clave de negocio en la misma variable** (`clave`) en extraccion.py — riesgo de
   fuga a logs. Separadas en `clave_acceso` / `clave_padre`.

**Otros hallazgos incorporados:**
- La cartera de SAP B1 se acota por las **cuentas de control de socios** (`OCRD.DebPayAcct`):
  de 1,043,823 partidas del mayor a **9,682**. Es lo ÚNICO propio de cada instalación SAP B1.
- El mayor NO es todo cartera (incluye inventario y producción) → `plata_cuenta` es obligatoria.
- La tabla hija no lleva el campo de fecha: se encadena por la clave del padre en lotes de 900.

**Regla cambiada por Edwin:** ahora YO siembro la configuración de ambas empresas y él corrige
encima desde el portal (antes era al revés). Ver memoria [[portal-fuente-de-verdad]].

**CAPA PLATA COMPLETA — 43/43 tests PASS en los dos tenants, cuadre 0.00 en los 5 conceptos.**
13 modelos + cuarentena, SQL explícito por ERP con `var('erp')`. Corrida:
`dbt build --select plata --target <tenant> --vars "{erp: sap_b1|odoo, moneda_local: GTQ, ...}"`

| | Cresta | Iron Network |
|---|---|---|
| socio_negocio | 1,932 | 73 (+1 en cuarentena) |
| producto / cuenta | 10,353 / 471 | 647 / 100 |
| documento_comercial | 19,305 | 452 |
| documento_linea | 28,870 | 699 |
| partida_cartera | 9,684 | 975 |

**Cuatro problemas resueltos durante la construcción (todos con la causa documentada en el código):**
1. **`erp_actual()` emitía whitespace** → `{% if erp == 'sap_b1' %}` fallaba y TODOS los modelos
   compilaban la rama de Odoo sin error visible. El macro ahora es whitespace-free + `| trim`.
2. **`FileFallocate(): Interrupted system call`** en `plata_documento_linea` — se reporta como
   falta de disco con 942 GB libres. Son los *parallel workers* de Postgres 16 sobre el volumen
   de Docker Desktop/WSL2. `pre_hook: set local max_parallel_workers_per_gather = 0`.
   En Postgres sobre Linux nativo se puede quitar.
3. **`numeric field overflow` en descuento_pct** → el ERP trae porcentajes imposibles:
   **−260,073% en PCH1** y −35,902% en INV1 (4,387 líneas con descuento negativo). Plata debe
   REFLEJAR el origen, así que se amplió a `numeric(18,6)` y la calidad lo marca. **Pendiente de
   revisar con Edwin: qué significan esos descuentos.**
4. **`jsonb_object_keys` sobre escalar** — Odoo guarda `analytic_distribution` como escalar
   (no objeto vacío) cuando la línea no tiene analítica. Guarda con `jsonb_typeof(...)='object'`.

**Cuarentena (§10) implementada** con el patrón correcto: `prep_socio_negocio` efímero alimenta
a `plata_socio_negocio` (válidos) y `cuarentena_socio_negocio` (violaciones) sin duplicar el
mapeo. Caso real: el socio 337 de Iron Network tiene rango de cliente y NIT pero nombre vacío
(es un contacto hijo de la empresa 336). Sin cuarentena una fila tumbaba toda la corrida.

**Test de gobernanza** `cuadre_sin_desvios`: si un concepto no cuadra, la corrida FALLA y Oro no
publica.

**CAPA ORO — dimensiones y hechos LISTOS (17/17 en ambos tenants), métricas pendientes.**

**Miembro NO DEFINIDO implementado** (pedido de Edwin, §8): toda dimensión lleva la clave `-1`
con código `NO_DEFINIDO` / nombre `No definido`, y todo hecho resuelve con LEFT JOIN +
`coalesce(clave, -1)`. `dim_centro_costo` lleva además el miembro `-2` = `MULTIPLE` (Odoo reparte
una línea entre varios centros con porcentaje). **Ya está trabajando: 152 líneas de venta de
Cresta sin vendedor caen al miembro No definido en vez de perderse** — con INNER JOIN el total
habría dejado de cuadrar sin aviso.

**Clave sustituta = hash md5 determinista** de la clave natural (60 bits → bigint), NO
row_number: las dimensiones se reconstruyen completas cada corrida y con row_number insertar un
socio correría todas las claves siguientes, dejando las relaciones de Power BI apuntando a filas
equivocadas en silencio.

**Oro cuadra EXACTO con Plata** (ninguna fila perdida en los joins):
ventas 25,273 filas / 32,935,084.74 · compras 3,597 / 29,262,725.19 · CxC 8,339 / 92,353,298.03.

| | Cresta | Iron Network |
|---|---|---|
| dim_cliente / dim_proveedor | 815 / 1,119 | 67 / 10 |
| hecho_venta_linea | 25,273 | 542 |
| hecho_compra_linea | 3,597 | 157 |
| hecho_cartera_cobrar / pagar | 8,339 / 1,345 | 74 / 5 |

Fotos diarias de cartera materializadas como `incremental` con `unique_key` (empresa, partida,
fecha_corte): repetir una corrida el mismo día no duplica.

**Bug: `do` es palabra reservada en Postgres** — usarlo de alias para dim_organizacion tumbaba
los 4 hechos. Renombrado a `dorg`.

**Descuento corregido en la documentación:** Edwin confirma que los descuentos grandes
(−260,073%) son REALES — el negocio aplica descuentos muy altos y casos especiales para llegar al
monto pactado. NO es dato sucio: se conserva tal cual, no entra a cuarentena y no se marca en
calidad. Contrato, seed y modelo actualizados.

**LLAVES SUSTITUTAS = AUTOINCREMENTALES (decisión de Edwin, reemplaza el hash).**
Mapas `oro/llaves/llave_*.sql`: modelos `incremental` que guardan (llave natural del ERP → entero)
y **nunca reasignan**. Un código que ya tiene llave la conserva, así que insertar un socio nuevo no
corre las llaves siguientes ni descuadra las relaciones guardadas en Power BI. Rangos en Cresta:
clientes 1-814, productos 1-10,353, cuentas 1-471. Miembro No definido = -1.
La llave de NEGOCIO es la del ERP y queda visible: `cliente_codigo`=CardCode, `documento_id`=DocEntry.
El macro de hash (`clave_sustituta`) quedó marcado OBSOLETO, no borrado.

**DocNum validado y agregado al hecho.** SAP B1: `DocEntry` 155906 (interna) + **`DocNum` 53000128**
(visible). Odoo: `id` 1095 + **`name` "INV/2026/00325"**. Cero nulos en ambos (19,305 y 452).
Los hechos de línea ahora llevan `documento_numero` vía join a la cabecera.

**14 MÉTRICAS en `oro.metrica_valor`** (formato largo: empresa/métrica/período→valor) + `metrica_aging`
(por rango y socio). Una sola tabla en vez de 14: Power BI agrega solo; esta tabla existe para
validar contra el ERP, para el agente (consulta por clave, sin SQL libre) y para cerrar el catálogo.

**Corrección: las métricas CON IVA salen de la CABECERA, no de las líneas.** El IVA se calcula a
nivel documento; sumar el total-con-IVA de las líneas daba **Q25.37 de diferencia** en junio de
Cresta por prorrateo. Ahora "con IVA" cuadra al centavo con el ERP.

**Validación final contra SAP:** Ventas Brutas con IVA 37,419,526.89 = ERP exacto · Saldo CxC
92,353,298.03 = exacto · Saldo CxP 47,933,183.12 = exacto · las de "sin IVA" difieren 2-3 centavos
por redondeo línea/documento.

**⚑ HALLAZGO DE NEGOCIO (pendiente de validar con Edwin): el 60% de la cartera de Proavisa está en
+90 días — Q55,081,420.54 en 3,006 partidas concentradas en 25 socios.** Contra Q22.2M corriente.
Puede ser real o un artefacto de los saldos migrados de SQL Server en noviembre 2025. Si es real,
es el hallazgo más vendible del proyecto.

**Modelo Power BI:** especificación técnica escrita en `data-plane/semantico/MODELO-POWER-BI.md`
(tablas, relaciones 1:N unidireccionales, dim_tiempo como tabla de fechas, medidas DAX, la doble
relación de cartera con USERELATIONSHIP). **El CONTENIDO —qué reportes, qué audiencia, si "ventas"
es con o sin IVA por defecto, RLS— queda pendiente de conversar con Edwin.**

**⚑⚑ HALLAZGO PRINCIPAL — LA CARTERA DE CRESTA ES 72.7% INTERCOMPAÑÍA.**
De los Q92,353,298 de CxC, **Q67,155,038 (5 socios) son empresas del propio grupo**: Avícola
Loreto (Q50.4M), Industrias Avícolas Integradas (Q10.8M), Proavis (Q5.8M), Orgánicos El Paraíso y
la propia Productos Avícolas. **La cartera real a terceros son Q25,198,259 (247 socios).**
Un aging estándar habría reportado "60% vencido a +90 días" y desatado una crisis inexistente:
de los Q55.1M en +90, **Q51.0M son intercompañía**. La mora real de terceros es Q4.1M, y el 51%
de esa se concentra en 2 clientes con el saldo 100% vencido (Ledy Marleni Ramírez Caal Q1.28M,
Innovaciones Agropecuarias C&T Q0.83M). Días de venta en la calle: **84 aparentes vs 29 reales**.
*Pendiente de validar con Edwin si los saldos intercompañía +90 incluyen partidas migradas.*

**`es_intercompania` implementado** en dim_cliente/dim_proveedor. La lista de NIT llega por
`var('nits_grupo')` — la administra el portal en `gobierno.sociedades`, NO se fija en el modelo.
Iron Network da 0 (correcto, no tiene grupo configurado).

**BUG GRAVE CORREGIDO — el costo estaba mal mapeado.** `StockPrice` de SAP B1 es el costo
**UNITARIO**, no el de la línea: el costo real es `StockPrice × Quantity`. Verificado contra
`GrssProfit` del propio ERP (doc 1600345: 20,000 × 10.00 = 200,000 y 230,357.14 − 200,000 =
30,357.14 = GrssProfit exacto). Con el mapeo viejo el margen daba **95%**; el real es **22.6%**.
Además el signo se aplicaba a cada factor y en las notas de crédito los dos negativos se
cancelaban. Cualquier análisis de rentabilidad habría sido basura.

**`dim_tiempo` reconstruida: 46 columnas, grano DÍA sin hora.** Jerarquía natural + ISO (semanas
comparables) + año fiscal configurable + perspectivas relativas a hoy (`es_mes_actual`,
`es_anio_hasta_hoy`, `meses_desde_hoy`) + comparativos precalculados (`tiempo_clave_anio_anterior`)
+ operativas (`es_dia_habil`, `dias_del_mes`) + columnas `*_orden` para Ordenar por columna.

**Dashboard publicado** (artifact): análisis "Pulso financiero" con datos reales, paleta validada
con el script de dataviz (CVD ΔE 24.7 light / 25.2 dark, todos los checks PASS en ambos modos).

**Notas de operación:** para pasar `--vars` con listas al worker hay que usar
`docker exec cresta-worker /tmp/correr.sh <target> <erp> "<selección>" '<json>'` y exportar
`MSYS_NO_PATHCONV=1` en Git Bash (convierte `/tmp/...` a ruta Windows). Un comentario Jinja con
`-#}` antes de una línea SQL se come el salto de línea y mete el SQL dentro de un comentario `--`.

**MODELO POWER BI GENERADO** en `consumo/powerbi/` — un proyecto **PBIP** por organización
(`PulsoCresta` → dw_grupocresta, `PulsoIronNetwork` → dw_ironnetwork). 18 tablas, 43 relaciones,
24 medidas DAX.

**No se puede generar `.pbix`**: es binario propietario, solo Power BI Desktop lo escribe. PBIP es
la versión en carpeta/texto del mismo proyecto (formato oficial de Microsoft para control de
versiones): se abre igual en Desktop y al guardar produce el .pbix. Ventaja: el modelo vive en git
y se **regenera** con `python consumo/powerbi/generar_pbip.py <base> <proyecto> <salida>`, que
introspecciona `oro` — no puede quedar desincronizado del warehouse. Regenerar NO toca los visuales.

**Decisiones ya aplicadas en el modelo:** relaciones 1:N unidireccionales · `Calendario` con
`dataCategory: Time` · `discourageImplicitMeasures` + `summarizeBy: none` (nadie arrastra una
columna y obtiene una suma que nadie definió) · segunda relación al calendario por vencimiento
**inactiva** (USERELATIONSHIP) · llaves y columnas técnicas ocultas · `sortByColumn` en meses/días ·
nombres de negocio (Ventas, Cliente, Cartera por cobrar) en vez de `hecho_`/`dim_` · medidas en
carpetas 01-06 · pares terceros/grupo apoyados en `Cliente[es_intercompania]`.

**Validación automática que pasa:** identificadores TMDL con comillas donde llevan acento o espacio,
relaciones apuntando a columnas existentes, medidas sin referencias huérfanas.
**NO verificado:** la apertura real en Power BI Desktop (no está disponible en el entorno). Si
Desktop reporta error indica archivo y línea exactos.

**Requisitos para Edwin:** habilitar en Desktop las preview *«Guardar el modelo semántico con
formato TMDL»* y *«Proyectos de Power BI (.pbip)»*, y el conector Npgsql para PostgreSQL. Servidor
y base son **parámetros** M, así que cambiar de entorno no toca las 17 consultas.

**PBIP ABRE Y CARGA BIEN** (verificado por Edwin, guardó como .pbix). Dos errores corregidos en el
camino, ambos solo detectables en Desktop:
1. **`///comentario` después del `=` + expresión DAX multilínea** → `InvalidLineType: Other`. En TMDL
   el comentario va en la línea ANTERIOR y la expresión en una sola línea. Afectaba 4 medidas.
2. **`dim_tiempo` con miembro No definido de `fecha` nula** → Power BI rechaza el modelo completo:
   una tabla marcada como calendario exige columna clave única, SIN NULOS y CONTIGUA. `dim_tiempo`
   es ahora la ÚNICA dimensión sin miembro No definido, y está documentado por qué (con centinela
   1900-01-01 rompería la contigüidad). Los hechos con clave -1 caen en la fila en blanco automática
   de Power BI y el total sigue cuadrando. Hoy son 0 de 25,273 y 0 de 8,339.

**El generador ahora valida en TRES capas** (cada una nació de un fallo real):
sintaxis línea por línea del TMDL · integridad de relaciones y referencias de medidas ·
requisitos de datos del calendario (nulos, duplicados, contigüidad).

**PÁGINAS Y VISUALES GENERADOS** — `consumo/powerbi/generar_reporte.py`: 3 páginas, 35 visuales.
Edwin reclamó con razón que el primer entregable traía el modelo pero ninguna página.
- **Pulso**: 8 tarjetas (arriba el período, abajo terceros vs grupo, días de cartera reales,
  margen de terceros) + antigüedad de cartera en barras partidas azul/naranja + venta diaria.
- **Cartera**: tabla de saldo por cliente, saldo por antigüedad, mayor vencido por cliente en rojo.
- **Ventas**: terceros vs grupo, los dos márgenes lado a lado, venta por producto, margen por
  cliente, venta por día de semana.
- Segmentadores en las tres: período y **¿Es empresa del grupo?**.

`report.json` se genera por código (el `config` de cada visual es un JSON escapado DENTRO del JSON)
y se valida: JSON parseable y alias del `prototypeQuery` consistentes con el `From`.
**OJO: `generar_reporte.py` sobrescribe `report.json`** — se lleva los visuales hechos a mano.

**Próximo:** que Edwin abra el PBIP regenerado y valide los visuales. Pendientes menores: la API NestJS
todavía llama a `/transformar` sin `organizacion`; el `profiles.yml` de los dos targets se genera
a mano en `/tmp/dbt` del worker (el worker ya lo genera solo al disparar desde el portal).

---


## Estado actual (2026-07-26) — sesión 8 · CORRECCIÓN DE RUMBO + CANÓNICO v2 (B1 ↔ Odoo)

**Sesión de estrategia y rediseño, no de implementación.** Edwin pidió un diagnóstico franco de
viabilidad. Resultado: cambia el alcance y la tesis comercial. Detalle completo en `ESTADO.md`
(sección "⚑ CORRECCIÓN DE RUMBO") y en `data-plane/canonico/PROPUESTA-canonico-v2.md`.

### Modelo de negocio definido (esto es lo que ordena todo lo demás)

Producto llave en mano para **SAP B1 y Odoo** (no BI genérico multi-ERP). Gancho con los datos
propios del cliente en ≤5 días → suscripción (hosting+updates+soporte) → asesoría cobrada aparte.
**Dos clientes de arranque:** Grupo Cresta (SAP B1/HANA) y un amigo con **Odoo** que pidió CxC+CxP.

### Cambios de rumbo (resumen)

- **Entra CxP / procure-to-pay.** El alcance ya no es solo order-to-cash.
- **Agente de IA POSPUESTO** hasta 3 clientes pagando. No es el diferenciador; se comoditiza.
- **Plantilla base en git + delta configurable** > todo config-driven. Bajar el nivel de
  meta-programación en dbt (era deuda de complejidad para un dev solo).
- **Regla base/extensión** obligatoria antes del 2º tenant: el paquete base es solo-lectura para
  el tenant; el tenant extiende, nunca modifica.
- **Postgres se queda** (base por tenant en instancia compartida). **Gateway SaaS** para proteger
  la IP: agente read-only en la red del cliente, solo conexión saliente, lógica en servidor propio.

### Hallazgo técnico de la investigación (el que simplifica todo)

SAP B1 y Odoo comparten el mismo modelo contable de doble partida:
`JDT1` ≈ `account_move_line` · `OJDT` ≈ `account_move` ·
`BalDueDeb−BalDueCred` ≈ `amount_residual` · `DueDate` ≈ `date_maturity`.

→ **La cartera (CxC+CxP) se modela UNA sola vez para los dos ERPs.** Eso es lo que abarata el
segundo cliente. Igual con documentos: B1 separa `OINV/ORIN/OPCH/ORPC` (ObjType 13/14/18/19) y
Odoo unifica en `move_type` (`out_invoice`/`out_refund`/`in_invoice`/`in_refund`) — el canónico
los recibe como un `documento_comercial` con `flujo` (venta/compra) + `tipo_documento`.

### Problemas del canónico v1 que v2 corrige

1. Sesgado a ventas (`documento_venta`, `documento_cobro`) → con CxP se duplicaría todo.
2. **El saldo salía de la factura** → incorrecto con pagos parciales, NC conciliadas, anticipos.
   v2 lo toma del **mayor**.
3. Sin multimoneda ni impuesto separado → totales mal en cuanto haya USD/GTQ.

### Propuesta v2 (PENDIENTE DE ACUERDO — decisiones A1–A7)

- **Silver (11):** maestros (socio_negocio *unificado cliente+proveedor*, item, vendedor,
  organizacion, cuenta *con tipo normalizado*, centro_costo, **moneda**) · documentos
  (`silver_documento_comercial` + `silver_linea_documento_comercial`) · **`silver_partida_cartera`**
  (CxC+CxP desde el mayor) · **`silver_control_cuadre`** (si no cuadra con el ERP, no publica).
- **Gold:** 9 dims (`dim_socio_negocio` SCD2 reemplaza `dim_cliente`; nueva `dim_moneda` y
  `dim_tipo_documento`) · 3 hechos (`fct_documento_linea`, `fct_cartera`,
  **`fct_cartera_snapshot`** diario — sin él no hay aging histórico y no se recupera después).
- **Métricas: 5 → 10** (entran Compras Brutas/NC Compra/Compras Netas, Saldo CxP, Aging CxP).
- **Bronze se deriva**: paquete B1 (17 tablas) + paquete Odoo (12 tablas). No hay que construir
  nada nuevo en Bronze — el mecanismo config-driven ya funciona; solo declarar objetos.

### Diferencias B1↔Odoo resueltas en la propuesta (D1–D10)

multi-empresa (conexión vs columna `company_id`) · impuestos (Odoo genera líneas de impuesto
aparte → filtrar `display_type='product'`) · sucursal (`BPLId` vs no existe) · centro de costo
(`analytic_distribution` JSON con % → `MULTIPLE` en v1) · vendedor · **borradores (Odoo
`state='draft'` en la MISMA tabla — filtrar `state='posted'` siempre)** · moneda · signo de NC ·
cliente/proveedor unificados en ambos · estado de pago (informativo, no fuente del saldo).

### VALIDADO EN VIVO CONTRA LOS DOS ERPs (2026-07-26)

Diagnósticos read-only ejecutados. Detalle completo en `PROPUESTA-canonico-v2.md` §8bis (SAP B1) y
§8ter (Odoo). Scripts en el scratchpad de la sesión (`diagnostico_sap_b1.py`, `diagnostico_odoo.py`,
`diagnostico_odoo2.py`) — **promoverlos a herramienta de onboarding del producto**.

**SAP B1 / Proavisa** (`SBOPROAVISA_`): ~2.5M filas · 814 clientes + 1,118 proveedores ·
**35 NIT duales** · `BPLId` NULL (sin sucursal) · **49% del valor de compras en USD** ·
centro de costo en **99.8%** de líneas · `JDT1.DueDate` sin nulos ·
saldo mayor vs documento: diferencia **0.07%** (Q62,946).

**Odoo 18.0.1.3** (con `l10n_gt`): ~5k filas · 74 socios comerciales de 225 `res_partner` ·
2 duales · analítica casi sin uso (1 línea) ·
saldo mayor vs documento: **diferencia 18.1%** (Q84,873) — 516 asientos `entry` mueven cartera
sin factura. **A2 demostrada.**

**Correcciones al diseño que salieron del diagnóstico:**
- **C1** Multimoneda es barata: ambos ERPs ya guardan monto local + moneda del documento
  (`balance`/`amount_currency`, `DocTotal`/`DocTotalFC`). **No recalcular con tasas propias**
  (este Odoo tiene 1 sola tasa registrada).
- **C2** Odoo 18 usa **jsonb**: `account_account.code_store->>'<company_id>'` y `name->>'es_GT'`.
  No hay columnas `code` ni `company_id`. El mapeo Odoo necesita **expresiones**
  (`campo_ingesta.transformacion`) desde el día uno.
- **C3** `res_partner` ≠ socios de negocio: filtrar `customer_rank>0 OR supplier_rank>0` + `active`.
- **C4** 4 compañías en Odoo, solo `company_id=1` con movimiento. Preguntar si activarán las otras.
- **C5** **IVA guatemalteco = 12% INCLUIDO** → efectivo sobre base 13.64%. Explica el 9.71% de
  Cresta (≈29% de ventas exentas). **"Ventas Netas" debe declarar con/sin IVA en el catálogo.**
- **Filtro de cartera = `account_type`/tipo de cuenta, NO `display_type`** (370 líneas `product`
  apuntan a cuentas por cobrar). `display_type` se guarda como `origen_partida` (documento vs asiento).
- El mayor incluye inventario y producción → `plata_cuenta` es **pieza obligatoria** del pipeline.

**Pendiente técnico nuevo:** el extractor solo habla HANA. Odoo requiere
`fuentes/odoo_postgres.py` (psycopg ya está en el venv).

### Próximo paso concreto

1. **Edwin confirma A1–A8** (tabla al final de `PROPUESTA-canonico-v2.md`).
2. Con eso: contratos YAML v2 → paquete base SAP B1 como **seeds versionados en git** → Silver →
   Gold → control de cuadre → paquete base Odoo.
3. Validar `BalDueDeb`/`BalDueCred` contra la instalación real de Grupo Cresta (anticipos y
   reconciliaciones internas) y **preguntar la versión de Odoo del 2º cliente** (`account_type`
   solo existe en Odoo ≥16; en ≤15 es `user_type_id` y el mapeo cambia).

**Pendientes heredados de sesión 7 (siguen vivos):** validar happy path de clientes desde el
portal; encadenado automático extracción→dbt; UI del filtro por campo.

**Advertencia registrada:** definir por escrito la **propiedad intelectual** frente al empleo en
Grupo Cresta antes de que el producto tenga valor. Si se construye en horario/recursos de la
empresa, puede argumentarse que es de ellos.

---

## Estado sesión 7 (2026-07-24) · TRANSFORMACIÓN DISPARABLE DESDE EL PORTAL

**Rumbo acordado:** de aquí en adelante todo lo que se construya debe quedar **operable y
verificable desde el portal** (Edwin construye la config en el portal; yo cablo los mecanismos
para que el portal los dispare).

**Diagnóstico de inicio:** solo `Descubrir` y `Extraer a Bronze` cruzaban al plano de datos.
La transformación dbt (Bronze→Silver→Gold) era 100% CLI manual; `encadena_transformacion`/`cron`
eran metadatos huérfanos. El worker no tenía dbt ni el proyecto montado.

**Entregado en esta sesión (botón manual, sin encadenado todavía — decisión de alcance):**
1. **Migración Nivel 2**: `metadata.politica_ingesta.modelos_dbt text` (selección `dbt build
   --select`, ej. `silver_socio_negocio+`). `schema/98_politica_modelos_dbt.sql` (idempotente) +
   rollback `98_..._down.sql`; columna también en el CREATE de `90_`. Aplicada en vivo.
2. **Worker corre dbt** (`data-plane/extraccion`): dep `dbt-postgres>=1.7` en pyproject; módulo
   `transformacion.py` (`transformar_objeto`: lee `politica.modelos_dbt`, genera profiles desde
   el entorno, corre `dbtRunner build --select`); endpoint `POST /transformar` en `worker.py`;
   subcomando `transformar` en `main.py`. Proyecto dbt montado en el worker vía compose
   (`../../data-plane/transformacion:/dbt`, `DBT_PROJECT_DIR=/dbt`, `DBT_PROFILES_DIR=/tmp/dbt`).
3. **API**: `POST /api/ingesta/transformar` (auditado, entidad `gold`) + `modelosDbt` en política
   (schema Drizzle + Zod). 4. **Portal**: campo "Modelos dbt" en el drawer de política; botón
   **"Transformar (Bronze → Gold)"** en la pantalla Campos.

**Verificado EN VIVO (mecanismo):** worker con dbt 1.12.0/postgres 1.11.0, proyecto montado,
`dbt debug` conecta OK al Postgres del stack; login OK; `POST /ingesta/transformar {clientes}`
→ error gobernado `"'clientes' no tiene política de ingesta."` (config vacía); 401 sin token.
API+web+worker compilan y levantan.

**PENDIENTE DE VALIDAR CON EDWIN (happy path):** requiere que Edwin re-arme config en el portal
(entidad canónica → política de clientes con `modelos_dbt='silver_socio_negocio+'` → descubrir →
incluir/mapear → extraer a Bronze) y luego pulsar **Transformar** → validar 812 clientes en
`gold.dim_cliente`. No sembré config ni datos (respeta "portal = fuente de verdad").

**Nota:** el worker no tiene `git` (dbt lo pide solo para `dbt deps` con paquetes git; no usamos
paquetes, `dbt build` corre sin él). `pgadmin` reinicia en loop (irrelevante). Cambios sin commit.

**Próximo:**
1. Validar happy path de clientes con Edwin (arriba).
2. **Encadenado automático**: que `Extraer` dispare `Transformar` cuando el plan tiene
   `encadena_transformacion=true` (siguiente incremento del rumbo).
3. UI del filtro por campo (`filtro_op`/`filtro_valor`).
4. Ventas end-to-end (OINV/INV1).

---

## Estado sesión 6 (2026-07-23) · PLUG-AND-PLAY REAL + BORRÓN Y CUENTA NUEVA

**Principio de trabajo acordado:** de ahora en adelante **la fuente de verdad es lo que Edwin
configura en el portal**. Se rehará el ejercicio **desde 0** en el portal. Yo NO siembro, restauro
ni sobreescribo su config; construyo mecanismos genéricos que la LEEN y respetan; pregunto solo
ante una duda real.

**Estado tras "borrón y cuenta nueva" (limpieza aprobada):**
- **Vaciado (BD en vivo):** `politica_ingesta`, `plan_ingesta`, `campo_ingesta`, `canonico_entidad`,
  `canonico_campo`, `catalogo_dominios`; y esquemas `bronze`/`silver`/`gold` (drop+create, sin datos).
- **Conservado:** `metadata.entornos_ejecucion` (3), `gobierno.conexiones` (Hana GrupoCresta →
  10.10.143.69:30015, secreto_ref `HANA_USER`), `gobierno.sociedades` (proavisa, esquema
  `SBOPROAVISA_`), `gobierno.organizaciones` (grupocresta, color `#2d5aa0`), usuarios/roles (login).

**TODOS los mecanismos están construidos, probados EN VIVO y quedan listos** para lo que Edwin configure:

1. **Introspección auto-descriptiva** (worker `cresta-worker`, FastAPI+hdbcli): `POST /descubrir` →
   lee `SYS.TABLE_COLUMNS` (nativos) + `CUFD` (UDFs con descripción) + perfila no-nulos (excluye LOB)
   → llena `campo_ingesta`. Probado: OCRD real = 421 cols, 30 UDFs, 247 con datos.
2. **Extractor read-only → Bronze** (worker `POST /extraer`): lee política + campos INCLUIDOS, SELECT
   read-only con filtro/ventana, aterriza en `bronze.<tabla>` como **jsonb + trazabilidad**
   (source_origen, extraido_en, empresa_id). Probado: 1928 clientes reales en `bronze.ocrd`.
3. **Silver config-driven** (macro dbt `generar_silver('<entidad>')`): lee `canonico_campo` (columnas)
   + `campo_ingesta` (mapeo/transformación/filtro) en runtime y arma el SELECT desde el jsonb.
   Agregar campo/mapeo en el portal = cero SQL. Probado: `silver_socio_negocio` = 812 clientes reales.
4. **Gold SCD2** (`dim_cliente` vía snapshot + `columnas_versionado`). Probado: 812 clientes reales.
5. **Modelo canónico administrable** (capa plata): `canonico_entidad` + `canonico_campo`, pantalla
   lista→detalle en el portal. **Filtro por campo**: `campo_ingesta.filtro_op`/`filtro_valor`.
6. **Config del origen administrable**: entornos, conexiones (server+secreto_ref), sociedades
   (conexión+esquema). **Acceso: usuario read-only sobre tablas base** (sin vistas).
7. **Diseño "Mesa de gobierno"**: fuentes self-hosted (Space Grotesk/Inter/JetBrains Mono en
   `portal/src/assets/fonts`), metales medallion (firma), login hero, **color primario configurable
   por organización** (`--marca` derivado por color-mix; ThemeService).

**Cómo correr las capas (por ahora manual; el encadenado automático es lo siguiente):**
- Worker: contenedor `cresta-worker` (perfil portal). Botones en Campos: *Descubrir* / *Extraer a Bronze*.
- Extractor CLI local: venv en `data-plane/extraccion/.venv`, `POSTGRES_HOST=localhost`,
  `PYTHONPATH=src python -m cresta_extraccion.main {descubrir|extraer} --sociedad proavisa --objeto <x>`.
- dbt contra la BD real: profile en `<scratchpad>/dbt_real/profiles.yml` (localhost:5432). Ej.:
  `dbt run --select silver_socio_negocio` → `dbt snapshot --select snap_cliente` → `dbt run --select dim_cliente`.

**Próximo (cuando se retome):**
1. **Edwin reconstruye la config desde 0 en el portal** (modelo canónico → entidades/políticas →
   descubrir → incluir/mapear/filtrar → extraer).
2. **Encadenar extracción → dbt** (que `plan_ingesta.encadena_transformacion` dispare Silver→Gold
   tras Bronze; el worker corre dbt).
3. **UI del filtro por campo** en Campos (DDL `filtro_op`/`filtro_valor` ya existe; hoy se setea por SQL).
4. **Ventas end-to-end** (OINV/INV1) con el mismo patrón.
5. (Opcional) desactivar los seeds de config del repo para que un reset de volumen también arranque en blanco.

**Bloqueantes:** ninguno. HANA conecta y todo el flujo corre en vivo.

**Nota:** `region` en `socio_negocio` lo borró Edwin a propósito; NO restaurar. Si se quita definitivo,
ajustar `columnas_versionado` (política) + var `cols_versionado_clientes` (dbt) para mantener consistencia.

---

## Estado sesión 5 (2026-07-23)

**Introspección real HANA CONSTRUIDA y VALIDADA contra el ERP en vivo.** El extractor descubre
campos auto-descriptivamente y llena `metadata.campo_ingesta`.
- **Motor** (`data-plane/extraccion/src/cresta_extraccion/`): `config.py` (credenciales por
  `secreto_ref` desde .env, tolerante a sufijo `_USER`), `catalogo.py` (resuelve sociedad→conexión→
  entorno desde Postgres; upsert en campo_ingesta preservando `incluido`), `diccionario.py` (OCRD/
  OINV/INV1 → canónico + sugeridos + descripción ES), `fuentes/sap_b1.py` (hdbcli con fallback
  cifrado; `SYS.TABLE_COLUMNS` + `CUFD` para UDFs + perfilado de no-nulos excluyendo tipos LOB),
  `introspeccion.py` (orquestador), `main.py` (comando `descubrir`).
- **Validado en vivo** contra `10.10.143.69:30015` schema `SBOPROAVISA_`, tabla OCRD: **421 columnas,
  30 UDFs con descripción de CUFD, 247 con datos, 9 sugeridos, 5 auto-incluidos** (los de mapeo
  canónico). Hallazgo real: `Territory` sin datos (región probablemente en UDF), existe `U_NIT`.
- **Portal — pantalla Campos** (página completa, no drawer): filtro **Sugeridos/Con datos/Incluidos/
  Todos**, búsqueda, badges UDF/sugerido/sin-datos + tipo, acciones masivas. Maneja las 421 columnas.
- **Config real creada por Edwin en el portal**: conexión `Hana GrupoCresta`, sociedad `proavisa`,
  política `clientes` (maestro/versionado/OCRD).
- Correr: `PYTHONPATH=src .venv/Scripts/python -m cresta_extraccion.main descubrir --sociedad proavisa
  --objeto clientes --tabla OCRD` (venv en `data-plane/extraccion/.venv`, POSTGRES_HOST=localhost).
- **Decisión Edwin:** NO generar permisos read-only; el usuario del .env ya los tiene.
- **Falta:** trigger desde el portal (botón "Descubrir" → worker), y el extractor dinámico
  read-only → Bronze (siguiente etapa del DWH).

---

## Estado sesión 4 (2026-07-23)

**Sesión 4 — Config de origen administrable (plug-and-play) construida y verificada (sin HANA).**
Foco: que dar credenciales de una sociedad arme la organización. Verificado E2E en Docker.
- **Modelo:** `metadata.entornos_ejecucion` (SAP B1·HANA / SAP B1·SQL Server / Odoo) · `gobierno.conexiones`
  (server/host/puerto/secreto_ref, NUNCA credencial) · `gobierno.sociedades` (empresa_id + NIT +
  conexión + esquema_origen) · `metadata.campo_ingesta` (columna origen→canónico, es_udf, descripción
  ES, transformación, sugerido/incluido, tabla_origen). DDL 93-96 + rollback + seeds 52-54.
- **Diccionario base sembrado** (investigado de SAP B1): OCRD (clientes), OINV+INV1 (ventas) con
  descripciones en español y sugeridos (precios=Price, IVA=VatSum, costos=StockPrice, margen=GrssProfit).
  48 campos. Solo nativos; los UDFs (U_*) los agrega la introspección real.
- **Portal:** módulos Conexiones y Sociedades (CRUD auditado) + vista **Campos** por entidad en Ingesta
  (toggle incluir, badges sugerido/UDF, mapeo canónico). Nav + rutas. API + frontend compilan; E2E OK.
- **Decisiones:** acceso = usuario read-only sobre tablas base (SELECT generado, sin vistas por objeto);
  introspección en el plano de datos; auto-mapeo 1:1 + semánticas del motor. `politica_ingesta.fuente_objeto`
  reconciliado a objeto nativo (OCRD, OINV+INV1...). Etapas: **DWH ahora**, semántica después, agente al final.
- **Alcance primer flujo:** solo OCRD + OINV (SAP HANA) para probar todo el sistema; luego las demás.
- **Falta (requiere HANA):** introspección real (SYS.TABLE_COLUMNS + CUFD) que hace merge en campo_ingesta
  y perfila no-nulos; extractor dinámico read-only → Bronze; correr primer flujo y validar/corregir.
- Plan de diseño detallado: `.claude/plans/cual-es-el-estado-crystalline-bunny.md`.

---

## Estado previo (2026-07-22)

**Sesión 3 — Fundación de INGESTA GOBERNADA completada y verificada (sin HANA).** Se diseñó y
construyó la arquitectura de ingesta configurable desde el portal. Detalle y verificación en
`ESTADO.md` (sección "Ingesta gobernada"). Resumen:
- **Metadatos** `metadata.politica_ingesta` (qué/cómo por objeto: ventana, campo_fecha, estrategia,
  clave, columnas_versionado) + `metadata.plan_ingesta` (cuándo: un cron por corrida, empresas,
  objetos, encadena Bronze→Gold). DDL 90/91 + rollback + seed 50 (8 objetos + plan piloto).
- **Table functions** parametrizadas por fecha (spec en `vistas-requeridas.md`).
- **Maestros en dbt**: full_replace (SCD1) vs versionado (SCD2 vía snapshot + `dim_cliente` con
  rango de vigencia + `rpt_ventas_region_versionada` + test de gobernanza). `dbt build` = 52 PASS.
- **Portal**: módulo Ingesta (API NestJS + Angular, auditado) sobre política/plan. Verificado E2E.
- **Decisiones**: worker dedicado en el plano de datos (orquestación); corrida encadenada, un cron
  por plan (no por objeto); CxC = estrategia `abiertos`; clientes = versionado (nombre/región).

**Próximo paso concreto:** ver "FOCO PRÓXIMA SESIÓN" abajo — extractor Python real + worker de
scheduling (bloqueado por vistas/credenciales HANA de Edwin). La capa de configuración ya está lista.

---

## Estado previo (2026-07-19)

**Fase 0 (Fundación agnóstica) COMPLETADA.** Motor en pie: git, estructura, Docker/Postgres
(medallion), metadata-store con DDL versionado + rollback, modelo canónico agnóstico, esqueletos
extracción (Python) y dbt. Tablero de avance: `ESTADO.md` (raíz).

**Portal (Fase 5) — FUNDACIÓN COMPLETA y verificada end-to-end en Docker** (motor común,
independiente de datos). Stack: **NestJS + Drizzle + Zod (API) · Angular (frontend) · nginx · Docker**.
Entregado y probado:
- Metadata-store de administración (organizaciones/usuarios/roles/usuario_roles/autorizaciones/auditoria) con DDL versionado + rollback + seeds (6 roles, org grupocresta).
- Backend: auth JWT+argon2 (guard global, admin de arranque por bootstrap), CRUD organizaciones, usuarios + asignación de roles, autorizaciones (grants), auditoría automática de cambios, health. Respuesta {success,data,error}, validación Zod.
- Frontend Angular (standalone): login, layout, organizaciones, usuarios/roles, auditoría.
- Docker perfil `portal`: `api` (:3001) + `web` nginx (:8080, proxy /api). `docker compose --profile portal up -d --build`.
- Admin dev: admin@grupocresta.local / admin_dev_2026 (cambiar).

**Pendiente portal (Etapa A restante):** mapeos ERP→canónico, glosario, catálogo de métricas +
certificación multi-aprobador, RLS (preview con datos depende de Fase 1-2).

**Frente Datos (Fase 1-2) — pipeline probado con datos sintéticos, sin HANA.** Verificado
end-to-end en dbt (24 modelos, 12 tests calidad, métricas correctas):
- Spec mapeo SAP B1→canónico + `organizaciones/grupocresta/mapeo/sap_b1/vistas-requeridas.md` (lo que Edwin debe exponer en HANA).
- Seeds sintéticos estilo SAP B1 (proavisa+loreto) = Bronze. Silver canónico + cuarentena. Gold estrella (dims con default + fct_ventas_facturacion + fct_cobros_cxc). 5 métricas verificadas.
- Falta (requiere HANA): extractor Python read-only → Bronze; escalar a otras 4 sociedades.
- dbt 1.12 + dbt-postgres instalados; profiles.yml.example usa env_var; correr con `set -a; source .env; set +a` y `--profiles-dir`.

**Frente B — Portal Etapa A COMPLETO y verificado end-to-end (2026-07-19):**
glosario, catálogo de métricas (CRUD + versionado) y **certificación multi-aprobador** (§9).
Backend NestJS + Angular. UI rediseñada con sistema de diseño propio (verde + ámbar, mono para
datos), patrón lista + **drawer** para crear/editar (con Editar en todas las entidades), toasts.
**Auditoría mejorada:** muestra el diff antes→después y filtros por acción/entidad/usuario.

**Repositorio publicado en GitHub:** https://github.com/DigyFenix/datawarehouse.git (branch
`master`). Primer commit 6f3c90e con toda la fundación + portal + pipeline dbt (2026-07-19).

**Pendiente Portal (cuando se retome):** editor de mapeos ERP→canónico y RLS.

**Estado global de frentes:**
- (a) Datos: pipeline dbt probado con sintéticos; **falta el extractor/transporte real desde HANA** (bloqueado por vistas + credenciales read-only de Edwin).
- (b) Portal: Fundación + Etapa A COMPLETOS y en GitHub. Falta mapeos + RLS.

## Marco del proyecto

Producto de producción multi-tenant (BI gobernado + agente IA), agnóstico a ERP. La tesis es
solo la **base conceptual**. Detalle en memoria: `naturaleza-proyecto`, `decisiones-arquitectura-datawarehouse`.

El `CLAUDE.md` del repo ya representa el marco real (producto), reescrito 2026-07-19.

## Fuente de verdad

- Arquitectura completa: `docs/arquitectura/` (README + 01 visión/principios, 02 técnica, 03 gobernanza, 04 roadmap).
- Repo = **base (motor común)** + `organizaciones/<tenant>/` (instancias independientes).
- Tenant activo: `organizaciones/grupocresta/` (avícola, multi-empresa).

## Decisiones clave (resumen)

- Dos planos: control (portal) + datos (medallion), unidos por `metadata-store`.
- Agnóstico: canónico + mapeos por ERP; **Silver = costura agnóstica**.
- Grano de hecho = **línea**. `dim_organizacion` = empresa→sucursal (default). Centro de costo y cuenta = dims aparte a nivel línea.
- Semántica de 3 ejes (definición / certificación / autorización). Catálogo de metadatos = el "mapa" del agente (no lee tablas físicas).
- Agente: guía proactiva + 4 restricciones duras (sin SQL libre, solo certificadas, RLS siempre, ambigüedad→pregunta).
- Certificación multi-aprobador; RLS = admin + auditoría.
- Portal Nivel 2 (migración versionada + rollback), nunca Nivel 3.
- Tenencia: instancia por tenant + `empresa_id`/RLS para las empresas del grupo.

## Infraestructura confirmada (2026-07-19)

- **ERP:** SAP Business One / HANA (cada sociedad = una BD HANA).
- **Motor plano de datos:** PostgreSQL (medallion en Docker local, `infra/local/`).
- **Extracción:** Python (read-only → Bronze).
- **Sociedades (6):** proavisa, loreto, organicos, sepesa, seragro, inavisa. **Piloto: proavisa + loreto.**

## FOCO PRÓXIMA SESIÓN — Extractor real + worker (requiere HANA)

La capa de configuración de ingesta ya está lista (política/plan en el portal). Falta lo que
depende de HANA:
1. **Extractor Python real** (`data-plane/extraccion/`): `fuentes/sap_b1.py` (hdbcli read-only, llama
   las table functions con `p_fecha_desde` = hoy − lookback), `destino_bronze.py` (delete-insert por
   ventana / delete-all abiertos / full maestros según `estrategia`), `main.py` (lee `politica_ingesta`).
2. **Worker de scheduling** en el plano de datos: lee `plan_ingesta`, ejecuta la corrida encadenada
   (extracción → Bronze → `dbt run + test` → Gold) según `cron`.
3. `bronze_*` como sources reales (reemplazan los seeds sintéticos).

Prerrequisitos de Edwin: vistas/table functions HANA según `vistas-requeridas.md` (actualizada) +
credenciales read-only en `.env`. Confirmar schema (`DW_READONLY`) y si expone hechos como
cabecera+líneas unidas o separadas.

## Detalle Fase 1 (Datos), par piloto proavisa + loreto

1. Confirmar vía de extracción HANA: **vistas dedicadas read-only** (recomendado) vs Service Layer.
2. Extractores Python read-only SAP B1 → Bronze (facturas/NC, CxC, maestros) para el piloto.
3. Silver: mapeo `sap_b1`→canónico (`OINV/INV1/ORCT/OCRD/OITM/...`) + `dbt tests` calidad + cuarentena.
4. Gold: estrella (`fct_ventas_facturacion`, `fct_cobros_cxc`, dims con miembro default).
5. Validado el flujo, escalar a las otras 4 sociedades.

Detalle vivo del avance en `ESTADO.md`. DoD de Fase 0 (verificación Docker) documentado ahí,
pendiente de correr por Edwin cuando levante Docker.

## Alcance primer corte

Order-to-cash: dominios `datos_maestros`, `ventas`, `tesoreria`, `gobierno`; métricas Ventas
Brutas, Devoluciones, Ventas Netas, Saldo CxC, Aging (5 de 7). Rentabilidad = stretch.

## Bloqueantes

Ninguno. Para Fase 1 se necesita: acceso read-only a HANA (host/usuario/password en `.env`,
NUNCA en repo) y confirmar la vía de extracción. El grupo tiene más sociedades que las 6
registradas; se escala después del piloto.
