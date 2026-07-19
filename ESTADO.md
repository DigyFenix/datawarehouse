# ESTADO — Control por fases (Tenant: Grupo Cresta)

Tablero maestro de avance. Fuente de verdad del progreso. Se actualiza al cerrar cada fase.
Regla: cada fase se valida contra su **DoD** antes de avanzar (salvo instrucción de entregar
varias de una vez). Roadmap conceptual: `docs/arquitectura/04-roadmap.md`.

**Estados:** `pendiente` · `en_curso` · `completada` · `validada`

## Resumen

| Fase | Nombre | Estado | Cerrada |
|------|--------|--------|---------|
| 0 | Fundación agnóstica | ✅ completada | 2026-07-19 |
| 1 | Datos (Bronze/Silver/Gold) | 🔨 pipeline probado con datos sintéticos (falta extracción real HANA) | — |
| 2 | Semántica (métricas + catálogo) | 🔨 5 métricas implementadas y verificadas en Gold | — |
| 3 | Gobernanza (linaje, roles, RLS, certificación) | ⏳ pendiente | — |
| 4 | Agente (tools tipadas + 4 restricciones) | ⏳ pendiente | — |
| 5 | Portal Etapa A | 🔨 en curso (adelantada, ver abajo) | — |
| 6 | Consumo (Power BI + demo NL) | ⏳ pendiente | — |
| 7 | Validación (4 criterios) | ⏳ pendiente | — |

## Decisiones de infraestructura (confirmadas 2026-07-19)

ERP **SAP B1 / HANA** (1 BD HANA por sociedad) · motor **PostgreSQL** · alojamiento **Docker
local** · extracción **Python** · capa semántica **por confirmar** (Cube.dev vs dbt SL — hasta
entonces, métricas como Gold materializado).

Sociedades registradas (6): `proavisa`, `loreto`, `organicos`, `sepesa`, `seragro`, `inavisa`.
**Par piloto Fase 1:** `proavisa` + `loreto`.

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

