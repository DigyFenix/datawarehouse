# Auditoría completa — 2026-10-31 (sesión 37)

Validación de todo el sistema: seguridad, portal de usuario (código y uso), portal admin, chatbot
vs capa semántica, Power BI, rendimiento y contraste con la tesis. Cada hallazgo fue verificado en
el código (archivo:línea) o medido en local. Nada de esto se corrigió todavía: es la lista de
trabajo. Prioridad: **P1** = corregir antes de vender a otro cliente · **P2** = próximas sesiones ·
**P3** = cuando toque.

## 1. Veredicto corto

- **Seguridad del agente y multi-tenant: sólida.** SQL constante, tools estrictas, RLS fail-closed,
  JWT ligado al tenant, impersonación auditada. Dos hallazgos altos fuera del agente (ingesta y
  Postgres público).
- **Portal de usuario: sin errores de consola; 2 bugs funcionales** (entrar-como roto en carga
  fría; editar glosario borra el dominio) y un riesgo de render en Firefox/Safari en Inicio.
- **Chatbot: respeta 3 de 4 restricciones en código; la cuarta (ambigüedad) vive solo en el prompt.**
  No verifica que los números del texto existan en los datos. Sin conjunto de evaluación.
- **Power BI: modelo limpio; 3 errores de cálculo** (proyección de cierre, dos definiciones de
  aging, DSO) y 58 solapes de 4 px con el pie; validador desactualizado.
- **Rendimiento: rápido en Iron (todo < 300 ms), pero sin índices en Oro y con 25-30 consultas
  por mensaje de chat**: en Cresta (450k líneas) va a doler.
- **Tesis: ~85 % respetado.** Brechas: RLS en Power BI (Publish to Web) y evaluación medible del
  agente.

## 2. Seguridad

### P1
- **A1 Inyección SQL hacia el ERP vía metadatos de ingesta.** `campoFecha`, `fuenteObjeto`,
  `descubrir.tablas` y `filtroOrigen` van literales al SQL del worker
  (`control-plane/api/src/ingesta/ingesta.dto.ts:34-59`, `extraccion.py:183-186`,
  `fuentes/sap_b1.py:91,123`, `sap_b1_mssql.py:85,102`, `odoo_postgres.py:77,134`). Lo puede usar
  un `admin_organizacion`. Corregir: allowlist `^[A-Za-z0-9_]+$` en DTO y worker; `filtroOrigen`
  solo para `admin_portal` o estructurado (campo/operador/valor).
- **A2 Postgres publicado a internet con `pbi_lector` BYPASSRLS** (`docker-compose.yml:55`,
  `init/04_roles_aplicacion.sh:45`, `05_acceso_red.sh:35`). Corregir: CIDR del gateway en
  `pg_hba`, `CONNECTION LIMIT`, rotación documentada; evaluar túnel.

### P2
- **M1** `PUT /organizaciones/:id` abierto a `admin_organizacion` y permite cambiar `baseDatosDw`,
  `secretoConexionRef`, `moduloAsistente` (`organizaciones.controller.ts:74-82`). Reservar a
  `admin_portal` o schema reducido.
- **M2** Impersonar y restablecer contraseña del portal del cliente sin `@RolesPermitidos`
  (`portal-org.controller.ts:74-95`); la temporal vuelve en claro.
- **M3** JWT sin revocación al cambiar contraseña (ambos portales). Guardar
  `password_cambiada_en` y rechazar `iat` anterior.
- **M4** Prompt injection indirecta: nombres de empresa, socios y glosario entran al prompt sin
  delimitar (`agente.service.ts:384-391`, `prompt.ts:39-58`, `ejecutar.ts:419,562`). Envolver,
  truncar a 80, sanear saltos de línea.
- **M5** Docker sin `read_only`, `cap_drop`, `no-new-privileges`, `user`; `local all all trust`;
  respaldos en claro.
- **M6** Interceptor adjunta el Bearer a cualquier host. Filtrar por `apiUrl`.

### P3
B1 contraseña sin `max` en control-plane · B2 hoja «Ficha» del Excel sin neutralizar fórmulas ·
B3 `admin.service.ts:413` lee `oro` con `portal_app` (fallará en prod sin GRANT) · B4 ticket de
impersonación en query string · B5 `recursoClave` sin regex · B6 Caddy sin `Permissions-Policy`
ni `preload` · B7 `/auth/impersonar` y `/visor` sin rate limit · B8 `crearUsuario` no
transaccional · B9 `ver_tablero` no marca `impersonadoPor` · B10 correr `npm audit` en CI.

### Bien
SQL constante y parametrizado; Zod strict con regex; `strict: true`; RLS por transacción
fail-closed; JWT↔hash del tenant; roles releídos por request; argon2id + hash ficticio + limitador;
logo con magic bytes y CSP sandbox; impersonación de un solo uso y solo lectura; Publish to Web
nunca en JSON; Caddy con CSP/HSTS; auditoría append-only.

## 3. Portal de usuario (código y uso)

### Errores (P1)
- `entrar-como.component.ts:82-91`: nadie llama `tenant.activar(hash)` → `exigirHash()` lanza y
  queda en «Entrando…». El soporte desde el admin está roto en carga fría.
- `glosario.component.ts:236`: el form de edición no incluye `dominio` → cada edición lo borra.
- `inicio.service.ts:76-85`: «recientes» ordena por clave, no por fecha; `max(ocurrido_en)::text`
  no lo parsea `DatePipe` en Firefox/Safari → rompe el render de Inicio.
- `estado_carga.sql:98-111`: el semáforo se calcula en el build → siempre «Al día»; además
  `inicio.service.ts:49` toma `min(estado)` = el MEJOR estado. Frescura miente si el pipeline cae.

### UX (P2)
- Visor de tableros: enlace «← Inicio» aunque se venga de Tableros; iframe con
  `allow-scripts`+`allow-same-origin` (sandbox inefectivo; Power BI lo exige, documentar).
- Chat cita claves técnicas en el texto (`saldo_cxc`) en vez del nombre oficial.
- Cambiar contraseña: sin botón volver ni layout.
- Interceptor solo trata 401; 403/500 silenciosos en varios componentes; Perfiles muestra «el
  proveedor no ha dado de alta tableros» cuando en realidad falló la petición.
- Ningún `(ngSubmit)` comprueba `form.invalid` (todo lo atrapa el 400 del servidor).
- Llamadas redundantes: `/tableros` en cada navegación, perfiles recarga todo tras guardar, chat
  vuelve a pedir todos los mensajes tras responder.
- Menores: `uso-ia` y `admin.controller` arman el mes con `toISOString()` (UTC); demanda usa
  `window.prompt`; auditoría muestra solo `despues`; theme `marca-color` sin prefijo de tenant;
  reorden de Mi tablero sin revertir si falla.

### Medido en local (Iron)
| Endpoint | ms |
|---|---|
| /inicio | 84 (21 caliente) |
| /agente/tablero (3 widgets) | 275 (112) |
| resto admin/agente | 20-70 |
| descarga Excel mensual (2 métricas) | 402 |
| descarga por cliente | 305 |
| turno de chat (Haiku + Opus ×2) | ~6-9 s, $0.063 |

## 4. Portal admin (plano de control)
Rediseñado en esta sesión (Geist, menú por grupos, puesta en marcha guiada, claves generadas,
confirmaciones). Pendiente: 50 `style=""` inline (usuarios, métricas, ingesta, auditoría);
Auditoría sin rediseño; `recursoTipo='portal'` en Autorizaciones no lo evalúa ningún guard;
`GET /conexiones` filtra en cliente.

## 5. Chatbot vs capa semántica

### Cumplimiento de las 4 restricciones
| Restricción | Dónde se impone | Estado |
|---|---|---|
| Sin SQL libre | `tools/consultas.ts:218-419`, `esquemas.ts:8-68`, `agente.ts:263`, test `guardas.spec.ts:81-92` | Cumple |
| Solo certificadas | `consultas.ts:372-385`, `env.ts:46-49`, `ejecutar.ts:250-638`, `derivadas.ts:588-598` | Cumple; hueco: el glosario mete `equivaleA` sin filtrar por alcance (`prompt.ts:56-58`) |
| RLS siempre | `lector-pools.service.ts:67-70`, `aplicar_rls_oro.sql:52-56`, `alcances.ts:623-632` | Cumple |
| Ambigüedad → aclarar | solo `prompt.ts:86-89` | **Solo prompt**: nada en código impide que el modelo elija métrica y período |

### Anti-alucinación (P1)
- El texto del modelo no se verifica contra los datos (`agente.ts:290-348` solo recorta).
  Corregir: extraer números del texto, comprobar que existan en tarjetas/conjuntos/períodos; si
  no, sustituir por plantilla desde tarjetas y auditar `respuesta_regenerada`.
- Historial: el modelo recibe cifras previas como texto y puede recitarlas sin tool (regla 1 vs
  regla 7 del prompt se contradicen).
- Tarjetas sin `empresas` ni `unidad` (un % derivado sale «35.00»); corte y próxima carga solo en
  el prompt, la UI no los muestra en cada tarjeta.
- Falta `temperature: 0`.
- Descargas: derivadas en nivel mensual consultan una clave que no existe en `metrica_valor` →
  hoja vacía en silencio (`descargas.ts:167-223`).

### Conversaciones cortas y útiles (P2)
Faltan: desambiguación por botones (compuerta ampliada a `{intención, métricas candidatas,
período, empresa}` → el clic ejecuta la tool sin modelo); sugerencias contextuales generadas en
código desde el alcance (hoy 4 fijas que pueden nombrar métricas sin acceso); memoria de
empresa/período en la conversación; detección de repetición; panel «qué puedo preguntar» con
dimensiones y períodos.

### Prompt (`prompt.ts`, ~9 KB)
Contradicciones (regla 1 vs 7; «no cierres con preguntas» vs «pregunta antes de consultar»),
30 % redundante, reglas 8-9 obligan a una tool extra por turno. Faltan: formato de cifras y moneda
del tenant, cómo decir «no está en el catálogo», plantilla de aclaración en una frase, «este año»
= desde enero, qué hacer si el período supera `periodoHasta`.

### Evaluación (P1 para que el chat sea «un éxito medible»)
No existe. Diseño mínimo: `data-plane/agente/eval/casos.json` con 20 casos (6 consultas directas,
3 rankings, 2 aging, 3 ambiguas, 2 fuera de catálogo, 2 manipulación, 1 empresa fuera de alcance,
1 no certificada) + `eval.ts` que mide exactitud tool+params, aclaraciones correctas, rechazos,
alucinaciones (misma función del punto anterior), tokens y latencia. Umbrales: ≥90 % tool/params,
100 % rechazos, 0 alucinaciones, p95 < 8 s. Correr 3 veces por caso; gate antes de desplegar.

### Rendimiento del chat
1 Haiku + 1-4 Opus por turno; 6-8k tokens por llamada (solo ~2.7k cacheados); `resolverAlcance`
abre 6-7 transacciones. Reducir: segundo `cache_control` en el bloque dinámico (fecha al mensaje
de usuario) → ~85 % cacheado; cachear alcance+glosario 5 min; Sonnet para elegir tool; recortar
`tool_results` (top 5 + total); saltar la compuerta en clics; streaming del texto.

## 6. Power BI

### Cálculo (P1)
- `generar_pbip.py:1439` Proyección de cierre divide por días hábiles hasta `TODAY()`, no hasta
  `[Corte de ventas]`: con atraso de extracción subestima. `KEEPFILTERS(fecha <= [Corte])`.
- `:2744-2770` dos definiciones de aging (columnas DAX 1-15/16-30/… vs `DM_Antigüedad`
  1-30/31-60/…). Llevar el rango fino a Oro y borrar las columnas.
- `:989` DSO usa saldo filtrado por fecha de documento; en Resumen convive con KPIs «hoy».
  Numerador `[Por cobrar terceros hoy]` (igual DPO).
- `:1533` Fill rate 100 % sin pedidos (quitar el 0 de `DIVIDE`).

### Modelo (P2)
35 columnas calculadas (`primera_compra_cliente`, `Meses sin compra`, `Sector`… con `FILTER(ALL)`
por fila: cuadrático en Cresta) que deben venir de Oro; 28 medidas sin `///`; duplicadas
(`Venta 12m clasificada` ≡ `Venta del cliente 12m`; alias Ganancia/Costo de lo vendido); formatos
de variación inconsistentes; 16 auxiliares visibles en el panel de campos.

### Hojas (P1/P2)
- `pbir.js:18-20,148`: el pie en y=940 solapa 4 px con la fila 3 en las 23 hojas (58 solapes).
- Tema en dos copias divergentes (`organizaciones/.../theme/` paleta Kraken vs
  `RegisteredResources/` Azul profundo) + `quilate-theme.json` sin usar.
- Contraste: `C.ACENTO #e0a526` (2.19:1) y `PIZARRA_CLARA` (2.43:1) usados como texto; pareto a 7 pt.
- Segmentadores sin un eje de tiempo común por familia (`anio` vs `anio_mes` vs `mes_nombre`).
- Año/mes inicial quemado al generar (`ANIO_ACTUAL`): en enero el reporte abre en el período
  viejo. Columna `es_anio_corte` en calendario.
- UX gerente: Histórico/Seguimiento/Pulso y Por cobrar/Cartera 12m/Cobros se solapan; sin
  metas/presupuesto; subtítulo «al 16 oct (79 %)» no dice qué es el 79 %.

### Proceso (P1)
`validar_reporte.py` desactualizado (lienzo 720, paleta Cresta, medidas sin tabla): nadie lo
corre con gate. `generar_reporte.py` sigue siendo destructivo. Medidas sincronizadas a mano al
TMDL. Automatizar: `regenerar_paginas.js` único (6 generadores en orden + validador), modo
`--solo-medidas` en `generar_pbip.py`, check de hash del tema, pre-commit que cuente visuales.

## 7. Rendimiento (P1 antes de Cresta)
- Ningún índice en `oro.*`: agregar `config(indexes=[...])` en `metrica_valor`
  (metrica_clave, empresa_id, periodo), `metrica_valor_dimension` (+dimension),
  `metrica_aging` (tipo_cartera, empresa_id, fecha_corte).
- `resolverAlcance`: 6-7 consultas secuenciales = ~28 viajes por turno. `Promise.all` + una
  transacción por request.
- `ejecutarTablero`: ~15 consultas × widget en serie sobre pool de 5. Resolver alcance una vez y
  concurrencia 3.
- `sesion.contexto` se llama dos veces por request (21 sitios): guardar en `req` o caché 60 s.
- `estadoSesion` dos veces por mensaje; `uso-ia` con `to_char` no sargable (rango de fechas).
- Pools de 5: subir a 10-15.
- Descargas: tope global por libro y ExcelJS en streaming.

## 8. Contraste con la tesis (sesión en `C:\Claudews\proyecto_graduacion`)
Respeto ≈ **85 %**. Cumple íntegramente: fuentes read-only, ELT por capas, estrella, capa
semántica única, 7 métricas con 8 atributos, ciclo de certificación (ampliado), catálogo/glosario,
4 reglas de calidad + cuarentena, linaje, 4 roles, flujo del agente y 4 restricciones (más
estricto: sin SQL generado), bitácora, auditoría de cambios, 4 criterios como aceptación.
Parcial/No: RLS solo en eje empresa y **Power BI Publish to Web fuera del RLS** (contradice el
perímetro declarado); detección de manipulación sin registro de patrones; SSO/cifrado en reposo/
revisión periódica de accesos no documentados; sin matriz de riesgos; sin métricas de exactitud,
alucinación, aclaración, explicabilidad reconstruible, consistencia entre consumidores ni
adopción.

Lo que el proyecto aporta y la tesis no tiene (actualizar la tesis): dos planos + metadata-store,
canónico agnóstico probado con SAP B1 y Odoo, multi-tenencia en dos niveles, certificación
multi-aprobador, consulta tipada sin SQL del LLM, compuerta de intención, glosario por tenant,
cuadre contra el ERP, frescura honesta y demanda no atendida, autoservicio sin LLM, schema Nivel 2,
costo de IA por usuario.

## 9. Orden de ejecución propuesto
1. **Hoy / antes de otro cliente (P1):** A1 ingesta, A2 pg_hba+connection limit, entrar-como,
   glosario dominio, Inicio recientes/fechas, frescura real, verificación de números en el chat,
   derivadas en descargas, Power BI proyección/aging/DSO/pie, índices en Oro.
2. **Siguiente sesión:** evaluación del chat (20 casos + script + gate), desambiguación por
   botones y sugerencias en código, caché del bloque dinámico, `resolverAlcance` en una
   transacción, tablero concurrente, interceptor 403/500 + validación de formularios, M1-M6.
3. **Después:** columnas calculadas a Oro, validador PBI al día, `regenerar_paginas.js`, metas en
   Oro, B1-B10, docs de Power BI.
