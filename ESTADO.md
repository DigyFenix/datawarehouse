# ESTADO — Control por fases (Tenant: Grupo Cresta)

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
| 1 | Datos (Bronce/Plata/Oro) | ✅ **completada con DATOS REALES de DOS ERPs** — canónico v2, paquetes base SAP B1 y Odoo 18, Oro 13 dims + 6 hechos, cuadre 5/5 al centavo en ambos tenants sobre todo 2026 (215k líneas de venta en Cresta) | 2026-07-28 |
| 2 | Semántica (métricas + catálogo) | 🔨 **14 métricas materializadas** + `clasificacion_abc_cliente` y `dim_rango_aging`; 74 medidas DAX en el modelo BI. Falta recablear el catálogo del portal al canónico v2 | — |
| 3 | Gobernanza (linaje, roles, RLS, certificación) | ⏳ pendiente — trazabilidad, cuarentena y control de cuadre implementados; faltan RLS y certificación | — |
| 4 | Agente (tools tipadas + 4 restricciones) | ⏸ **POSPUESTA** — hasta 3 clientes pagando (corrección de rumbo 2026-07-26) | — |
| 5 | Portal Etapa A | 🔨 en curso — **aislamiento por organización cerrado** (selector global, API filtrada, `/transformar` cableado). Falta la UI del canónico v2 y el filtro por campo | — |
| 6 | Consumo (Power BI) | 🔨 **modelo de 19 tablas / 48 relaciones / 74 medidas + 5 páginas y 72 visuales, un solo PBIP para ambos ERPs**; Edwin construye las visuales y el análisis | — |
| 7 | Validación (4 criterios) | 🔨 consistencia y trazabilidad demostradas por el control de cuadre; faltan seguridad/RLS y explicabilidad | — |

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

