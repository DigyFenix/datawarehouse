# datawarehouse

Plataforma de **BI gobernada con agente de IA**: multi-tenant, gobernada y agnóstica al ERP.
Permite consultar datos en lenguaje natural y recibir respuestas basadas **únicamente en métricas
certificadas y datos gobernados**, con control de acceso y trazabilidad.

Primera implementación: **Grupo Cresta** (avícola, multi-empresa). Repositorio = **motor común**
(base) + instancias por organización bajo `organizaciones/`.

> Documentación de arquitectura (fuente de verdad): [`docs/arquitectura/`](docs/arquitectura).
> Estado y control por fases: [`ESTADO.md`](ESTADO.md). Contexto para Claude Code: [`CLAUDE.md`](CLAUDE.md).

## Estructura

```
control-plane/        Portal (plano de control): API NestJS + frontend Angular
metadata-store/       Contrato entre planos: DDL del catálogo + seeds (versionado + rollback)
data-plane/           Plano de datos
  canonico/             Modelo canónico agnóstico (contrato)
  mapeos/sap_b1/        Mapeo SAP B1 -> canónico (spec de vistas)
  extraccion/           Extractores Python read-only ERP -> Bronze
  transformacion/       Proyecto dbt (Bronze -> Silver -> Gold + métricas + calidad)
organizaciones/       Instancias por tenant (grupocresta)
infra/local/          Docker Compose (Postgres, portal)
```

## Stack

- **Datos:** PostgreSQL (medallion Bronze/Silver/Gold), dbt, extracción Python (SAP B1 / HANA read-only).
- **Portal:** NestJS + Drizzle + Zod (API) · Angular (frontend) · nginx.
- **Infra:** Docker Compose (local); migrable a AWS por tenant.

## Puesta en marcha (local)

```bash
cp .env.example .env          # completar credenciales locales (no se versiona)

# Plano de datos (Postgres + catálogo)
cd infra/local && docker compose --env-file ../../.env up -d postgres

# Portal completo (API + web)
docker compose --env-file ../../.env --profile portal up -d --build
#  Portal: http://localhost:8080   ·   API: http://localhost:3001/api/health

# Pipeline dbt (transformación + métricas)
cd ../../data-plane/transformacion
dbt seed && dbt run && dbt test    # requiere dbt-postgres y profiles.yml
```

## Estado

Ver [`ESTADO.md`](ESTADO.md) para el detalle por fases. Resumen: fundación agnóstica, portal
(fundación + administración: organizaciones, usuarios/roles, glosario, métricas con certificación
multi-aprobador, auditoría) y pipeline dbt con métricas certificadas — verificados end-to-end.
Pendiente principal: extracción real desde HANA.
