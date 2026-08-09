# ESTADO — Quilate Analytics · control por fases

> **Producto:** Quilate Analytics — plataforma de BI gobernada. **Empresa:** DigyFenix.
> Organizaciones activas: **Grupo Cresta** (SAP B1) e **Iron Network** (Odoo 18). Ninguna es
> «la del proyecto»: el motor no privilegia a ninguna.
>
> **Al 2026-08-08 (sesión 23) el cuello de botella sigue siendo CONTENIDO, y la construcción es
> de Edwin:** el intento de generar las páginas por código (PBIR) se abortó por decisión suya —
> Edwin construye los dashboards a mano en Desktop sobre los contratos de
> `docs/powerbi/report-architecture.md`; Claude se queda con el modelo (316 medidas, todas las
> del lote 1 de F4 validadas contra el motor al centavo), la guía y la validación.
> El producto Power BI se rige por su propio contrato (`CLAUDE_POWERBI_ANALYTICS_PRODUCT_MASTER_V3.md`);
> su progreso vive en `docs/powerbi/STATE.md` — **F0 a F4-lote-1 cerradas; F5 en manos de Edwin**.

Tablero maestro de avance. Fuente de verdad del progreso. Se actualiza al cerrar cada fase.
Regla: cada fase se valida contra su **DoD** antes de avanzar (salvo instrucción de entregar
varias de una vez). Roadmap conceptual: `docs/arquitectura/04-roadmap.md`.

**Estados:** `pendiente` · `en_curso` · `completada` · `validada`

---

## ⚑ CORRECCIÓN DE RUMBO (2026-07-26) — leer antes que nada

Tras un análisis de viabilidad de negocio, el proyecto **cambia de alcance y de tesis comercial**.
Lo anterior sigue siendo válido como motor; lo que cambia es **para quién y hasta dónde**.

### Modelo de negocio (definido)

No es una plataforma de BI genérica multi-ERP compitiendo con Fabric/Databricks. Es:

> **BI gobernado llave en mano para SAP B1 y Odoo**, con un paquete base preconfigurado que
> engancha al cliente con **sus propios datos en ≤5 días**, y a partir de ahí suscripción
> (hosting + actualizaciones + soporte) + **asesoría cobrada aparte** para sus reglas propias.

- **Clientes de arranque (2):** Grupo Cresta (SAP B1/HANA) y una empresa de equipo tecnológico
  (Odoo) — laboratorio real con dos ERPs distintos.
- **Ventaja defendible:** conocimiento de SAP B1 a nivel de tablas + operar una empresa que lo usa.
- **Lo que se vende:** tiempo-al-valor y certeza en el número. **No** "chat con tus datos".

### Cambios de alcance

| Antes | Ahora |
|---|---|
| Agnóstico a cualquier ERP desde el día 1 | **Dos paquetes base**: SAP B1 y Odoo, a fondo. Nada más. |
| Order-to-cash (solo ventas + CxC) | **Order-to-cash + procure-to-pay**: ventas, compras, CxC **y CxP** |
| Todo config-driven en el portal | **Plantilla base versionada en git + delta configurable**. El config-driven es la excepción, no la norma. |
| Agente de IA en el roadmap cercano | **Pospuesto** hasta tener 3 clientes pagando. No es el diferenciador. |
| Cada tenant expande libremente | **Regla base/extensión**: el paquete base es de *solo lectura* para el tenant; extiende, nunca modifica. |
| Sin protección de IP definida | **SaaS + gateway**: agente ligero read-only en la red del cliente (solo conexión saliente), toda la lógica en servidor propio. |

### Decisiones cerradas en esta corrección

- **Postgres se queda.** Volúmenes de PyME ni lo despeinan; cambiar de motor sería coste puro.
  Aislamiento = **base por tenant en instancia compartida** (no schema por tenant, no contenedor
  por tenant salvo cliente que lo exija).
- **Infra:** VPS (Hetzner/DO/Contabo) para los dos primeros clientes. AWS no todavía.
- **Licenciamiento:** propietario + suscripción. El repo nunca se entrega.
- **Saldo de cartera desde el mayor contable**, nunca desde la factura.
- **Control de cuadre obligatorio**: si el total del DWH no coincide con el del ERP, no se publica.

### Riesgo #1 identificado

**No es técnico, es de alcance.** El plan original (7 fases, agnóstico, multi-tenant, agente,
portal completo) es trabajo de un equipo de 4-6 personas por 12-18 meses. Se corta a un producto
vendible mínimo. Todo lo que no sirva para que un cliente pague, se pospone.

### Orden de trabajo acordado (2026-07-26)

1. Canónico v2 + esquemas en español ✅
2. Paquete base SAP B1 → Plata → Oro → control de cuadre = **flujo completo Cresta**
3. Extractor Odoo + paquete Odoo → **prueba de fuego del diseño agnóstico**: si Plata y Oro no
   cambian ni una línea al conectar Odoo 18, el motor funciona
4. Power BI sobre Oro
5. **Puerta de enlace + licenciamiento** ← DIFERIDO A PROPÓSITO (decisión de Edwin). Motivo:
   ninguno de los dos clientes lo necesita todavía (Iron Network expone Postgres a internet;
   Cresta corre dentro de la red). Se vuelve obligatorio al mover el DWH a un VPS fuera de la red
   de Cresta o al entrar un tercer cliente. Alcance: agente read-only en la red del cliente con
   **solo conexión saliente** + instalador de una línea + validación de licencia por tenant.
6. Agente de IA (tras 3 clientes pagando)

### Estado del rediseño

Propuesta de canónico v2 (Silver + Gold agnósticos B1↔Odoo) escrita en
`data-plane/canonico/PROPUESTA-canonico-v2.md`. **Pendiente de acuerdo (decisiones A1–A7).**
Hallazgo clave: `JDT1` ≈ `account.move.line` y `OJDT` ≈ `account.move` — ambos ERPs comparten el
mismo modelo de doble partida con saldo residual por partida, así que la cartera se modela **una
sola vez** para los dos.

---

## Resumen

| Fase | Nombre | Estado | Cerrada |
|------|--------|--------|---------|
| 0 | Fundación agnóstica | ✅ completada | 2026-07-19 |
| 1 | Datos (Bronce/Plata/Oro) | ✅ **completada — order-to-cash Y procure-to-pay con DATOS REALES de DOS ERPs**: ventas, compras, CxC, CxP, **pagos (cobranza vs tesorería), inventario con valor, tipos de cambio y campos de usuario (UDF, 2.6M de valores)**. Cuadre 7/7 al centavo en ambos tenants. **Refrescado el 2026-08-08: Cresta al día (4.66M filas, 70/70 conceptos cuadrados)**; Iron Network queda pendiente de refresco | 2026-08-01 |
| 2 | Semántica (métricas + catálogo) | ✅ **completada 2026-08-06** — **293 medidas DAX** (de 180) en 11 familias nuevas: ciclo de conversión de efectivo, fugas de margen, precio-volumen-mezcla, inventario ocioso/quiebre, rotación de clientes, ritmo y proyección, inflación de insumos, cumplimiento de pedidos, estructura de P&L, caja proyectada y frescura del dato. **`oro.metrica_valor` de 14 a 28 métricas** en 6 dominios. **Catálogo del portal REPARADO**: apuntaba a dos hechos que nunca existieron (era imposible registrar una métrica real); ahora 15 hechos reales + 28 fichas con fórmula | 2026-08-06 |
| 3 | Gobernanza (linaje, roles, RLS, certificación) | ✅ **completada 2026-08-08** — **IDOR cerrado** (roles frescos de BD por request, tres APP_GUARD, scoping por PK, conexiones con `organizacion_id`, auditoría paginada y filtrada; 8 pruebas en verde). **Certificación multi-aprobador real**: 8 huecos cerrados, 7 reglas duras probadas por API, **7 métricas certificadas** por el flujo. **RLS híbrido**: rol `portal_lector` NOBYPASSRLS + policies recreadas por dbt en cada build, fail-closed sin `app.empresas`; eje empresa en `perfil_alcances` | 2026-08-08 |
| 4 | Agente (tools tipadas + 4 restricciones) | ✅ **construido 2026-08-08** — paquete `@quilate/agente` (dominio puro) + módulo en el portal de usuario. **4 tools tipadas** con SQL constante parametrizado, **las 4 restricciones con test cada una (12/12)**, tarjeta de dato armada del catálogo y no del texto del modelo, conversaciones persistidas y chat en el portal. **Verificado contra el modelo real (2026-08-08)**: responde con tarjetas certificadas que cuadran al centavo con `oro.metrica_valor`, y deniega empresa ajena / métrica fuera de alcance / pregunta ambigua sin inventar una cifra. En esa verificación se descubrió y corrigió que el paquete trataba `empresa_id` como entero cuando en Oro es texto — el agente no habría devuelto un solo dato en ningún tenant (13 tests) | 2026-08-08 |
| 5 | Portal Etapa A | 🔨 en curso — aislamiento por organización cerrado; **onboarding validado con ensayo real** (alta→oro→PBIP con org de prueba); el API asigna `base_datos_dw` y bloquea UDFs sin datos; **NITs afiliados en el portal** (migración 112). **2026-08-08**: baja de organización reparada (chocaba con las FK y devolvía 500), quitar rol ya respeta el alcance (borraba el rol en TODAS las organizaciones), Usuarios filtra por la organización activa y **nueva pantalla de Autorizaciones** — el API de grants existía desde la fase 3 pero ninguna pantalla lo consumía. Falta la UI del canónico v2 y el filtro por campo | — |
| 6 | Consumo (Power BI) | ✅ **modelo vigente (2026-08-08): 36 tablas de datos / 98 relaciones / 294 medidas** — 43 archivos `.tmdl` contando el grupo de cálculo y los 6 parámetros de campo. Las cifras «25/67/140» de este renglón eran de una versión anterior y se corrigieron al regenerar contra el Oro nuevo (formato Q, moneda conmutable por grupo de cálculo, comparativos MTD/QTD/YTD/año anterior, Pareto dinámico, cobranza vs tesorería, rotación de inventario, campos de usuario relacionados) — un solo PBIP para ambos ERPs. **Flujo definido: modelo publicado al servicio + dashboards en archivo aparte.** Edwin construye el análisis. **+ Portal de USUARIO** (`consumo/portal/`, 2026-08-02): tableros Publish to Web por perfil, white-label (color+logo), auto-administración por organización, tenant por hash en URL | 2026-08-01 |
| 7 | Validación (4 criterios) | ✅ **completada 2026-08-08** — consistencia (cuadres al centavo), **seguridad/RLS** (IDOR 8/8, RLS fail-closed, certificación 7/7, guardas del agente 12/12), trazabilidad (auditoría por organización, cada consulta del agente auditada) y explicabilidad (toda respuesta lleva métrica, período y estado de certificación). **Onboarding de tenant nuevo validado E2E**: alta → provisionar → extraer 12 objetos → build 195/195 → cuadre 0 desvíos, sin un solo paso a mano | 2026-08-08 |

## Avance 2026-08-08 (sesión 22) — diseño de los informes + un KPI que mostraba lo contrario

**F1, F2 y F3 del contrato Power BI cerradas**, GAP-01 implementado y validado. El plano de los
12 tableros existe; falta construirlos.

- **Un KPI mostraba lo contrario de la realidad.** Primera ejecución del DAX contra el motor
  (pendiente desde la sesión 17). El calendario llegaba a 2032 y ocho medidas anclaban su
  ventana móvil en `MAX(fecha)`, cayendo en un futuro vacío → BLANK. El **ciclo de conversión
  de efectivo** convertía ese BLANK en cero y marcaba **−41.7 días** («los proveedores financian
  la operación») cuando el real son **80.2 días de capital atrapado**. Corregido con la medida
  auxiliar `_Fecha ancla móvil`.
- **`dim_direccion` tenía la clave duplicada** y rompía el refresco de Power BI: `OCST` tiene
  clave compuesta `(Code, Country)` y la ingesta solo extraía `Code`. `dbt build` pasaba
  195/195 con la dimensión rota porque **ninguna dimensión de Oro tenía test de unicidad**;
  se agregó `not_null, unique` a las 12 que faltaban (build ahora 219/219).
- **Calendario de rango dinámico**: 2023-01-01 → 2027-01-31 (1492 días contra 4749). El extremo
  futuro se calcula del dato porque hay fechas por delante que no son error. Macro
  `clave_tiempo()` manda al miembro No definido lo que caiga fuera, sin claves huérfanas.
- **F2** — 32 oportunidades con pregunta de negocio explícita, 11 P0. **Ocho de las once no
  necesitan una sola medida nueva**: el modelo ya las responde y ningún visual las muestra.
- **F3** — 12 páginas con contrato y coordenadas, 11/11 P0. Tema de Grupo Cresta con su paleta
  oficial; el **rojo corporativo se reserva para estado crítico** y nunca identifica una serie.
- **GAP-01** — tres medidas de eje de vencimiento (`USERELATIONSHIP` sobre las relaciones
  inactivas). Validadas contra SQL con **0.0000% de diferencia**. Destapan que agosto vence con
  **Q26.1M por pagar contra Q19.4M por cobrar**.
- **Hallazgo de negocio:** **Q4.14M de cartera con más de 3 años de vencida**, la más antigua de
  2017. Saldo vivo en el balance, probablemente sin depurar.
- Power BI Desktop borró los visuales del reporte **dos veces**; restaurados desde git ambas.
  `.pbi/localSettings.json` fuera del repo.

## Avance 2026-08-08 (sesión 21) — Cresta al día + herramienta de refresco + navegación del repo

- **Grupo Cresta actualizado end-to-end**: 180 extracciones (10 sociedades × 18 objetos) desde
  HANA, **4,656,070 filas**, cero fallos; `dbt build` **195/195 PASS** en 36 min; control de
  cuadre **70/70 sin un solo desvío**. Datos al 2026-08-08.
- **`herramientas/actualizar.py`** (nuevo): el portal solo extrae por par (sociedad, objeto) —
  180 clics para refrescar Cresta. La herramienta lee sociedades, objetos y conexión de la base
  de control (igual que `correr.py`) y encadena extracción → build. **Si una extracción falla,
  el build no corre**: un Oro construido sobre Bronce incompleto cuadra contra sí mismo y no
  contra el ERP, que es justo lo que el control de cuadre existe para atrapar.
- **PBIP regenerado** contra el Oro nuevo: 36 tablas de datos / 98 relaciones / 294 medidas,
  TMDL válido, reporte OK (1 página, 3 visuales de Edwin intactos). El TMDL no cambió ni un
  byte — el esquema de Oro es el mismo, lo que cambió son los datos.
- **MCP de Power BI reparado**: estaba registrado sin `--start`, y sin ese argumento el wrapper
  imprime un banner y hace `Console.ReadKey()`, que revienta con stdin redirigido. Eso era el
  `-32000: Connection closed`. Ver `docs/powerbi/STATE.md` (bloqueo B4).
- **Navegación del repo**: `docs/MAPA-REPO.md` (qué vive dónde + comandos reales + reglas que
  muerden) y dos skills de proyecto en `.claude/skills/`: `stack-local` y `guardar-sesion`.
- **Migración 122 estaba aplicada** desde el 2026-08-08 (base `quilate_control`, rol
  `quilate_admin`, sin `migrador_temporal` suelto); `SESSION.md` la listaba como pendiente.

## Avance 2026-08-06 (sesión 17) — CAPA SEMÁNTICA AMPLIADA + catálogo de gobierno reparado

De 180 a **293 medidas DAX** y de 14 a **28 métricas materializadas**, cubriendo las áreas
donde una empresa decide y el modelo callaba. Todo local; Power BI solo Cresta.

- **El catálogo de gobierno estaba roto, no desactualizado**: `catalogo_hechos` solo tenía
  `fct_ventas_facturacion` y `fct_cobros_cxc`, nombres de Fase 0 sin modelo dbt. Como
  `hecho_origen` es FK, el portal **no podía registrar una métrica sobre ningún hecho real**.
  Seeds 10 y 20 reescritos (15 hechos con `tabla_oro`, 28 fichas con fórmula) + migración
  **115 con rollback probada en base efímera** (aplicada, revertida al estado exacto,
  reaplicada dos veces).
- **Modelos nuevos**: `oro.analisis_producto` (1:1 con Producto: ocioso, quiebre, cobertura,
  ABC de producto) y `oro.estado_carga` (frescura con dos relojes). `dim_tiempo` ganó
  `dias_habiles_del_mes` y `dias_habiles_transcurridos`, prometidos desde siempre en el
  comentario del modelo y nunca emitidos.
- **Ocioso ≠ sin rotación comercial**: la primera versión ponía Q94.5M de Q99.4M (95%) del
  inventario en rojo. La causa eran 35,568 artículos con stock que nunca se facturaron —
  alimento, medicina y materia prima que se consumen en producción. Separadas las dos
  banderas, Cresta queda en 18 productos ociosos (Q251k) y **94 en quiebre con Q54M de venta
  anual en riesgo**.
- **Hueco cerrado en el validador**: no detectaba nombres de medida duplicados, que producen
  TMDL válido y revientan Desktop al abrir. Atrapó una colisión real al primer intento.
- **Hallazgos del contraste SQL**: ciclo de conversión de efectivo **89 días** ·
  **11.74% de la venta por debajo del costo** (Q45.8M, Q18.2M de margen perdido) · backlog
  vencido **Q9.0M de Q12.2M** · brecha contable −1.1%.

### Auditoría del modelo PBI aplicada (mismo día)

Edwin trajo una auditoría con 12 defectos (`Prompt_ClaudeCode_PulsoCresta.md`). Se corrigieron
en el **generador**, no en el TMDL: `generar_pbip.py` reescribe los `.tmdl` en cada corrida.

- **KEEPFILTERS** en 82 medidas (los segmentadores dejan de ignorarse). `es_intercompania` se
  respeta a propósito: una medida que declara su grupo en el nombre lo conserva.
- **Cero relaciones bidireccionales**; las 3 medidas que dependían de la propagación usan
  TREATAS explícito.
- **Grupo de moneda con fallback de tres niveles**: la `"Q"` del formato discrimina los importes
  no soportados (BLANK) de los conteos y porcentajes (pasan sin conmutar).
- **Pareto O(n²) eliminado** y `AVERAGEX(FILTER(…))` → `CALCULATE`. Regresión en
  `consumo/powerbi/tests/fase4-regresion.dax`.
- **Aging por clave entera** en los 4 hechos de cartera (macro `aging.sql` emite etiqueta y
  clave juntas); las fotos diarias se migraron sin perder histórico.
- **ABC regranulado a (empresa, año, entidad)** + `dim_anio`. RFM y Comportamiento de pago se
  declaran foto: no hay historia de dónde reconstruir un corte anual. La clase vigente se
  desnormaliza en Cliente y Proveedor por post_hook.
- **Las 294 medidas quedaron documentadas** (eran 118).
- Dos huecos cerrados en los validadores: nombres de medida duplicados y el falso positivo de
  las columnas extendidas de ADDCOLUMNS.
- **PBI: un solo proyecto.** `PulsoIronNetwork` se retiró; para Iron se cambia el parámetro
  `BaseDatos` del PBIP de Cresta.

## Avance 2026-08-02/03 (sesión 16) — GRUPO COMPLETO + multi-moneda + SQL Server

**Las 10 sociedades de Grupo Cresta cargadas y cuadradas (0/70 conceptos)**, incluida
Proavisa de El Salvador (USD). Lo estructural, todo regla estándar del producto:

- **NITs afiliados en el portal** (migración 112) + matching normalizado `[0-9K]`; el worker
  pasa `nits_grupo` y `sociedades` solo (gap de /transformar cerrado). `correr.py` versionado
  reemplaza al correr.sh perdido.
- **Retención (WTSum)**: el cuadre detectó el 1% de El Salvador (Q18k); base =
  DocTotal − IVA + retención en canónico y cuadre; seed 68.
- **Multi-moneda (migraciones 113/114)**: Oro con 2 ejes (presentación sin sufijo + `_doc`);
  conversión con la serie del propio ERP, guardas de rango/reciprocidad (serie invertida de SV
  auto-corregida 1/tasa), arrastre 92 días; sin tasa = solo moneda local.
- **dim_socio_negocio** (360° por NIT, 37 duales) + **dim_direccion** (CRD1/OCST + ShipToCode;
  seed 68/69) + `es_trimestre_actual` en calendario.
- **PBIP Cresta: 33 tablas / 93 relaciones / 180 medidas** con prefijos DM_/FC_/MD_ y
  **parámetros de campo** (Vista de ventas/cartera/compras). Reporte de Edwin en formato PBIR
  (definition/), generadores y validadores adaptados; **generar_reporte.py no se corre más**.
- **Onboarding revisado y reparado**: seeds 68/69, init omite seeds parametrizados, runbook al
  día. Validado contra ERP EN VIVO (ene–jul): loreto Q0.56 y proavisa Q0.67 de diferencia
  (redondeo), svproavis exacto.
- **SAP sobre SQL SERVER montado** (fuente pymssql, motor `sqlserver`, base por sociedad):
  smoke test OK; prueba real pendiente con la copia SQL Server de Cresta (datos a nov-2025).

## Avance 2026-08-03 (sesión 15) — Analítica nueva en Oro + jerarquía contable

Revisión "equipo completo de analistas" sobre la capa oro → implementados los **quick wins**
(cero ingesta nueva) y la **jerarquía de cuentas**, validados con dbt build 35/35 PASS × 2 tenants:

- **`clasificacion_rfm_cliente`** — recencia/frecuencia/monto con quintiles por empresa, fecha
  de referencia = última venta (reproducible), 8 segmentos (campeón → dormido). En Cresta: 169
  campeones concentran Q151M de venta 12m; 46 "en riesgo VALIOSO" con Q8.3M en juego.
- **`comportamiento_pago_cliente`** — perfil de riesgo de cartera (vencido ponderado por saldo)
  + actividad de pagos (solo contraparte 'cliente'). Límite documentado: los días reales
  factura→pago requieren la aplicación de pagos (RCT2/reconciliación), no ingestada aún.
- **`proyeccion_caja_semanal`** — entradas (CxC) y salidas (CxP) por semana ISO de vencimiento;
  proyección contractual con bucket "Vencido" anclado al corte.
- **`metrica_venta_diaria`** — serie diaria SIN huecos por empresa (un día sin venta = cero):
  base única para tendencias, medias móviles y forecasting futuro.
- **Feriados de Guatemala** (seed 2024–2028) en `dim_tiempo`: `es_feriado`, `feriado_nombre`,
  `es_medio_dia`, y `es_dia_habil` ahora descuenta feriados.
- **Jerarquía contable multinivel en `dim_cuenta`** (homologada en Plata): SAP B1 = árbol real
  vía OACT.FatherNum (Cresta: 5 niveles exactos, 471 cuentas, títulos marcados con
  `es_titulo`); Odoo = segmentos del código ('1.0.01.01' → 4 niveles). Columnas
  `nivel_1..nivel_5` (código+nombre) con relleno de hoja (sin blancos en drill-down) + `ruta_cuenta`.
- **Power BI**: `generar_pbip.py` extendido — 4 tablas nuevas (RFM y Comportamiento como
  extensiones 1:1 de Cliente; Venta diaria y Proyección como hechos), jerarquía 'Jerarquía
  contable' en Cuenta contable, **23 medidas nuevas** (163 total). Ambos PBIP regenerados:
  **29 tablas / 73 relaciones / TMDL válido**; reportes existentes intactos (72 visuales OK).

**Backlog priorizado que quedó del análisis** (requiere ingesta nueva; en orden de valor):
1) ~~Pedidos/backlog~~ ✅ 2) ~~Gastos del mayor → P&L~~ ✅ (ambos implementados 2026-08-02,
ver abajo). 3) Saldos de apertura por cuenta (31-dic-2025) → BALANCE GENERAL. 4) Metas de
venta administradas desde el portal. 5) Kardex de movimientos (OINM · stock.move) →
mermas/rotación real. 6) Lotes y vencimientos (OBTN · stock.lot) — diferenciador
avícola/alimentos. 7) Aplicación de pagos (RCT2) → días reales de pago.
**DESCARTADO por Edwin (2026-08-02): listas de precios (OPLN/ITM1)** — el análisis de
precio/costo se hace con lo GRABADO en cada documento (precio de venta y costo por línea, ya
al 99.5% de cobertura), que es lo que cuadra con contabilidad. No se ingesta la lista teórica.

### Ingesta nueva 2026-08-02: PEDIDOS + MAYOR CONTABLE (P&L)

- **Seeds 66 (SAP B1) y 67 (Odoo)** — paquetes de extensión parametrizados (onboarding):
  política `pedidos_venta` (ORDR+RDR1 · sale_order+sale_order_line, ventana 2026, solo
  vigentes/confirmados) y **ampliación del objeto `cartera`/`movimientos` a mayor completo**
  (abiertas de cualquier fecha + todo 2026) — mismo destino bronce: dos objetos sobre JDT1 se
  pisarían. `JDT1.ProfitCode` agregado para P&L por centro de costo.
- **Modelos**: `plata_pedido_linea` (backlog homologado: OpenQty · qty−qty_invoiced; Odoo
  convierte a local con tipo de cambio del día) + `oro.hecho_pedido_linea` (es_abierta,
  monto_abierto_local, fecha entrega como relación inactiva); `plata_movimiento_contable`
  (mayor canónico con centro de costo) + `oro.hecho_movimiento_contable` (solo RESULTADOS:
  naturaleza ingreso/gasto/costo, `monto_resultado` en la naturaleza de la cuenta).
- **Verificado en Iron Network** (extraído en vivo: 200 pedidos / 374 líneas): dbt 13/13
  PASS; backlog Q22.9K en 9 líneas abiertas; **CUADRE AL CENTAVO ingresos contables =
  ventas netas facturadas (Q2,235,501.13)**.
- **Power BI**: PulsoIronNetwork **31 tablas / 85 relaciones / 174 medidas** (Pedidos: Monto
  pedido, Backlog, Fill rate…; Resultados contables: Gasto operativo, Resultado contable…).
- **SAP (proavisa) COMPLETADO al recuperar acceso a HANA (mismo 2026-08-02)**: 32,408 pedidos /
  80,768 líneas (**backlog Q7.76M**, fill rate ~96%) y mayor completo 1,540,049 partidas →
  **P&L Cresta vivo** (ingresos Q231.9M / gastos+costos Q238.9M ene–ago, por mes/cuenta/centro
  de costo) con **cuadre 7/7 al centavo intacto**. Correcciones en el camino: ORDR usa `DocCur`;
  el filtro de campo `Account IN` se absorbió al filtro_origen (AND anulaba el OR del período).
  **PulsoCresta regenerado: 31 tablas / 85 relaciones / 174 medidas** (idéntico a Iron).
  Hallazgo de costos: 33,013 líneas a terceros vendidas BAJO COSTO = Q5.36M margen negativo.

## Avance 2026-08-02 (sesión 14) — Portal de USUARIO + camino a producción

- **Portal de usuario nuevo** (`consumo/portal/`, API NestJS :3002 + web Angular :8081, mismo
  stack del admin): cada organización entra por su **URL con hash de tenant**
  (`portal/<hash>/...`, migración 111), con **white-label completo** (color + **logo** subido
  desde el portal admin). Módulos: **Tableros** (Power BI vía **Publish to Web**, riesgo
  aceptado por Edwin — la URL solo se entrega autenticada al abrir el visor y cada apertura se
  audita) y **Chatbot** (placeholder; los **alcances por perfil** ya se administran →
  `portal.perfil_alcances`).
- **La organización se auto-administra**: su admin (sembrado desde el portal admin) crea
  usuarios, perfiles, asigna tableros y alcances; contraseñas temporales con cambio forzado.
  Todo en el **esquema `portal` de la BD del tenant** (migración 110) — aislamiento real:
  token cruzado entre tenants → 401 (verificado).
- **Portal admin**: módulo "Portal usuario" (estado, sembrar admin, CRUD de tableros por
  organización vía `TenantDbService`), logo por organización y URL de ingreso copiable.
- **Producción**: `infra/produccion/` (compose con Caddy TLS automático 2 dominios, respaldos
  diarios `pg_dump` con rotación, `.env.produccion.example`, **RUNBOOK.md** con firewall 5432
  solo-IP-Cresta, rol `portal_app`, migración local→VPS por dump/restore).
- **Reglas Publish to Web verificadas** (documentadas en `consumo/powerbi/README.md`): modelo y
  dashboards en el MISMO workspace; medidas SIEMPRE en el modelo; refresco vía on-premises data
  gateway; Pro + tenant setting. **E2E completo verificado por curl** (alta tablero → siembra →
  login → perfil → visor → auditoría → aislamiento).
- **Hosting decidido: Hetzner Cloud CPX31 (Ashburn, ~US$17/mes) + 1 dominio** con subdominios
  `admin.` / `portal.` (SLA 99.9%, ISO 27001, DDoS incluido). Endurecimiento aplicado al logo
  (allowlist PNG/JPG/WebP + magic bytes + cabeceras nosniff/CSP). Siguiente: montar el VPS con
  `infra/produccion/RUNBOOK.md`.

## Avance 2026-08-01 (sesiones 11–13) — commit `f652b39`

- **Dominios nuevos end-to-end** (portal → bronce → plata → oro → Power BI, ambos ERPs):
  pagos recibidos/efectuados (ORCT/OVPM · account_payment) con `contraparte` — en Cresta el
  67% del monto de ORCT es tesorería contra cuenta contable, no cobranza —, inventario con
  valor contable (OITW.StockValue · stock_valuation_layer), tipos de cambio (ORTT ·
  res_currency_rate) y saldo pendiente prorrateado por línea en facturas.
- **Campos de usuario (UDF)**: `oro.campo_usuario` en formato largo con expansión automática
  del jsonb de Bronce y claves sustitutas resueltas; regla dura en el API (solo UDFs con
  datos); promoción a campo canónico como vía gobernada. Miembro `SERVICIO` en producto.
- **Tres rondas de validación**: cuadre al centavo en 7/7 conceptos × 2 tenants; revisión
  adversarial (9 hallazgos reales corregidos: signos Odoo, ejes _doc de SAP, moneda de
  cartera, media móvil, formato del calculation group…); ensayo de onboarding con
  organización de prueba creada por el portal y eliminada al final (3 huecos corregidos:
  `base_datos_dw`, seeds parametrizados 64/65, primera corrida = build completo).
- **Runbook**: `docs/ONBOARDING-nueva-organizacion.md`.

## Regla de datos vigente (2026-07-28)

**Todo 2026 desde el 1 de enero**, vía `filtro_origen` de política (`"DocDate" >= '2026-01-01'`)
más ventana de 12 meses. **La cartera no se filtra por fecha**: es un saldo, no un flujo — una
partida abierta de 2025 sigue siendo saldo por cobrar hoy. El filtro es una fecha fija: hay que
revisarlo al entrar 2027.

**Control de cuadre con tolerancia mixta**: `greatest(0.05, filas × 0.00001)`. Un umbral absoluto
no escala — con 25k líneas el residuo de redondeo del ERP es 0.03 y con 215k es 0.69, así que el
control se volvía imposible de cumplir al ampliar la ventana. Sigue siendo tres órdenes de
magnitud menor que cualquier error de lógica.

## Decisiones de infraestructura (confirmadas 2026-07-19)

ERP **SAP B1 / HANA** (1 BD HANA por sociedad) · motor **PostgreSQL** · alojamiento **Docker
local** · extracción **Python** · capa semántica **por confirmar** (Cube.dev vs dbt SL — hasta
entonces, métricas como Gold materializado).

Sociedades registradas (6): `proavisa`, `loreto`, `organicos`, `sepesa`, `seragro`, `inavisa`.
**Par piloto Fase 1:** `proavisa` + `loreto`.

## Evolución clave (2026-07-23): plataforma plug-and-play, config-driven, portal = fuente de verdad

El diseño evolucionó a **auto-descriptivo administrado desde el portal**. Detalle vivo en
`.claude/SESSION.md` (sesión 6). Resumen:
- **Acceso:** usuario read-only sobre **tablas base** (sin vistas). Host/puerto en la Conexión;
  credenciales en `.env` por `secreto_ref`.
- **Introspección** (worker): descubre columnas nativas (`SYS.TABLE_COLUMNS`) + UDFs (`CUFD`) +
  perfila datos → `campo_ingesta`.
- **Bronze** dinámico (jsonb + trazabilidad), creado por el extractor.
- **Silver config-driven**: macro dbt `generar_silver` lee el **Modelo canónico** (`canonico_entidad`/
  `canonico_campo`) + el mapeo (`campo_ingesta`) y arma el SELECT. Agregar campo = cero SQL.
- **Modelo canónico administrable** (capa plata) + **filtro por campo** (`filtro_op`/`filtro_valor`).
- **Diseño "Mesa de gobierno"** con color primario **configurable por organización**.
- **Probado EN VIVO** contra HANA (10.10.143.69, `SBOPROAVISA_`): 1928 OCRD→Bronze, 812 clientes
  reales en Silver y en `dim_cliente` (SCD2).
- **Estado actual: "borrón y cuenta nueva"** — config y datos vaciados; Edwin re-arma todo en el
  portal. Mecanismos intactos.

**Evolución (2026-07-24, sesión 7):** la **transformación dbt (Bronze→Silver→Gold) ya se dispara
desde el portal**. El worker corre `dbt build` (dbtRunner) con la selección gobernada
`politica_ingesta.modelos_dbt`; botón **"Transformar (Bronze → Gold)"** en Campos + endpoint
auditado `POST /api/ingesta/transformar`. Migración Nivel 2 `98_politica_modelos_dbt.sql` (+rollback).
Mecanismo verificado en vivo (dbt debug conecta; error gobernado con config vacía). Happy path de
clientes pendiente de validar cuando Edwin re-arme la config en el portal.

**Pendiente inmediato:** validar happy path clientes desde el portal; **encadenado automático**
extracción→dbt (`encadena_transformacion`); UI del filtro por campo; ventas end-to-end; re-armar
métricas sobre datos reales.

---

## Fase 0 — Fundación agnóstica ✅

**DoD:** `docker compose up` levanta Postgres con esquemas medallion + tablas del metadata-store
+ estructura de repo completa + modelo canónico documentado.

- [x] git init + `.gitignore` + `.gitattributes` (LF en scripts)
- [x] Estructura del motor: `control-plane/`, `metadata-store/`, `data-plane/*`, `infra/local/`
- [x] Docker: `infra/local/docker-compose.yml` (Postgres 16 + pgAdmin opcional)
- [x] `.env.example` (sin secretos) + `init/01_esquemas.sql` (bronze/silver/gold/metadata/gobierno)
- [x] Metadata-store: DDL versionado con rollback (catálogo métricas/hechos/dims, certificación
      multi-aprobador, glosario, linaje) + seeds de las 5 métricas en `borrador`
- [x] Modelo canónico agnóstico: `data-plane/canonico/` (md + 10 contratos YAML order-to-cash)
- [x] Esqueletos: extracción Python (`data-plane/extraccion/`) + dbt (`data-plane/transformacion/`)
- [x] Tenant grupocresta: 6 empresas, `config/conexion.md`, subcarpetas mapeo/metricas/gobierno,
      `especificaciones.md` actualizado

**Verificación pendiente de ejecutar por Edwin** (requiere Docker corriendo):
1. `cd infra/local && docker compose up -d` → Postgres sano.
2. `\dn` muestra `bronze/silver/gold/metadata/gobierno`; `\dt metadata.*` muestra el catálogo.
3. `SELECT clave, estado FROM metadata.catalogo_metricas;` → 5 métricas en `borrador`.
4. `dbt debug` (en `data-plane/transformacion/`, con `profiles.yml`) conecta OK.

---

## Fase 1-2 — Datos + Semántica (pipeline probado con datos sintéticos) 🔨

Avanzado **sin HANA** para desbloquear la entrega de vistas. Verificado end-to-end en dbt
(`dbt seed + run + test`, 24 modelos PASS, 12 tests calidad PASS).

- [x] **Spec de mapeo SAP B1→canónico** (`data-plane/mapeos/sap_b1/` + `organizaciones/grupocresta/mapeo/sap_b1/vistas-requeridas.md`) — define las vistas que Edwin debe exponer.
- [x] **Seeds sintéticos** estilo SAP B1 (proavisa + loreto) representando Bronze.
- [x] **Silver** canónico (`stg_ventas_*`, `silver_*` maestros, `silver_documento_venta`, `silver_linea_documento_venta`) + **cuarentena** (`quarantine_ventas_cabecera`, regla cliente inexistente).
- [x] **Calidad §10**: not_null, relationships, accepted_values, unicidad (12 tests PASS).
- [x] **Gold estrella**: dims (cliente/producto/vendedor/organización/centro_costo/cuenta/tiempo) con miembro default + `fct_ventas_facturacion` + `fct_cobros_cxc`.
- [x] **5 métricas** materializadas y verificadas: Ventas Brutas, Devoluciones, Ventas Netas, Saldo CxC, Aging.
- [ ] **Falta (requiere HANA):** extractor Python read-only SAP B1 → Bronze (reemplaza los seeds), y escalar a las otras 4 sociedades.

**Cómo correrlo:**
```bash
python -m pip install dbt-postgres
set -a; source .env; set +a            # (bash) cargar credenciales
cd data-plane/transformacion
dbt seed && dbt run && dbt test --profiles-dir <dir con profiles.yml>
```

**Cuando lleguen las vistas HANA:** solo se implementa el extractor (Bronze); Silver→Gold→métricas
ya está probado. La spec en `vistas-requeridas.md` dice exactamente qué exponer.

_Fases 3–7: ver `docs/arquitectura/04-roadmap.md`; se detallan al entrar a cada una._

---

## Ingesta gobernada — fundación agnóstica (sesión 3, verificada) ✅

Diseño de la arquitectura de ingesta configurable desde el portal (ventana por objeto, table
functions parametrizadas en origen, maestros full_replace vs versionado SCD2, corrida encadenada
Bronze→Gold con un cron). Fundación implementada **sin HANA** y verificada end-to-end. Diseño
detallado en el plan de la sesión.

- [x] **Metadatos de ingesta** (`metadata-store/schema/90_politica_ingesta.sql`, `91_plan_ingesta.sql` + rollback + seed `50`): política por objeto (qué/cómo) + plan por corrida (cuándo). CHECK de coherencia (estrategia por tipo, ventana completa). 8 políticas order-to-cash + plan piloto. Validado en Postgres efímero (DDL + seed + CHECK negativo + rollback).
- [x] **Spec de table functions** (`vistas-requeridas.md`): objetos read-only parametrizados por `p_fecha_desde` para hechos; `TF_CXC` (abiertos) para CxC; vistas para maestros.
- [x] **Modo maestros en dbt**: snapshot SCD2 (`snapshots/snap_cliente.sql`) + `dim_cliente` versionada (sk, rango de vigencia, es_vigente) + `rpt_ventas_region_versionada` (join hecho↔dim por rango de fecha) + macro `columnas_versionado` + test de gobernanza `versionado_coincide_politica` (drift var↔política). `dbt build` = **52 PASS**. SCD2 verificado: cambio de región → 2ª versión; venta antigua toma la versión correcta; cambio en columna no versionada no crea versión.
- [x] **Módulo Ingesta en el portal**: API NestJS (`ingesta/` + tablas Drizzle + Zod con coherencia + auditoría) y frontend Angular (`features/ingesta/`, lista + drawer, ruta + nav). Verificado end-to-end: 401 sin token, GET lista 8 políticas + plan, POST válido, 400 por coherencia/objeto inexistente, auditoría registrada.

**Nota SCD2:** con la estrategia `check` de dbt snapshot, las columnas **no** versionadas quedan
congeladas al valor de su última versión (no se actualizan in-place hasta que cambie una versionada).
Comportamiento estándar; documentado.

**Pendiente (requiere HANA):** extractor Python real, worker de scheduling que ejecuta el plan, y
`bronze_*` como sources reales (reemplazan seeds). Ver plan de la sesión, §7 "Requiere HANA".

---

## Línea paralela — Portal (Fase 5, adelantada) 🔨

**Motivo:** el portal es motor común e **independiente de los datos** (administra el
metadata-store; no mueve datos). Se adelanta en paralelo mientras se define la extracción por
organización. Stack: **NestJS + Drizzle + Zod** (API) · **Angular** (frontend) · Postgres · Docker.

Alcance del primer módulo: **Fundación** (organizaciones + usuarios/roles + autorizaciones +
auditoría + login).

| # | Entregable | Estado |
|---|------------|--------|
| P1 | DDL metadata-store administración (organizaciones, usuarios, roles, usuario_roles, autorizaciones, auditoria) + rollback + seeds | ✅ completada |
| P2 | Scaffolding backend NestJS + Drizzle (config Zod, conexión, respuesta {success,data,error}, health) | ✅ completada |
| P3 | Módulo organizaciones (CRUD + Zod) + auditoría automática de cambios | ✅ completada |
| P4 | Auth (JWT + argon2) + usuarios/roles/autorizaciones + guard global | ✅ completada |
| P5 | Frontend Angular (login, orgs, usuarios/roles, auditoría) | ✅ completada |
| P6 | Docker del portal (`api` + `web` nginx con proxy /api) | ✅ completada |

**Fundación del portal COMPLETA y verificada end-to-end en Docker (2026-07-19).**

**Límite conocido:** el *preview/ejecución* de métricas y *probar mapeos* quedan "en seco" hasta
que existan datos (Fase 1-2); el resto del portal no depende de datos.

**Verificación realizada (todo ✅, corrido en Docker):**
- Postgres init: 5 esquemas, 7 tablas `metadata`, 6 tablas `gobierno`, 5 métricas borrador, 6 roles, org `grupocresta`.
- Backend compila (`npm run build`, exit 0) y corre en contenedor.
- `GET /api/health` → `{success,data:{estado:ok,db:ok}}`; sin token → 401; con token → datos.
- `POST /api/auth/login` (admin bootstrap) → JWT; validación Zod rechaza entradas inválidas (400).
- CRUD organizaciones + auditoría automática (5 entradas: login, bootstrap_admin, crear, eliminar).
- Frontend Angular compila y `web` (nginx) sirve el SPA en `:8080` con proxy `/api` → `api`.

**Cómo levantarlo:**
```bash
cd infra/local && docker compose --env-file ../../.env --profile portal up -d --build
# Portal:  http://localhost:8080   (admin de dev: admin@grupocresta.local / admin_dev_2026)
# API:     http://localhost:3001/api/health
```

### Portal Etapa A — módulos adicionales (verificados end-to-end en Docker, 2026-07-19)

- ✅ **Glosario de negocio** (CRUD, auditado) — backend + vista Angular.
- ✅ **Catálogo de métricas** (CRUD + versionado) — backend + vista Angular.
- ✅ **Certificación multi-aprobador** (§9): flujo versión → enviar a revisión → votos por aprobador
  → se certifica **solo cuando todos aprueban** (un rechazo la devuelve a borrador). Verificado:
  con 2 aprobadores, 1 voto deja `en_revision`; 2º voto certifica y promueve la fórmula.
- Rutas Angular añadidas: Glosario, Métricas (con gestión de versiones y certificación).

**Siguiente en el portal (cuando se retome):** editor de **mapeos ERP→canónico** y **RLS** (el
preview de métricas con datos reales depende de la extracción HANA — Fase 1).

