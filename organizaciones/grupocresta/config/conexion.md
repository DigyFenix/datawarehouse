# Grupo Cresta — Conexión al ERP (referencia a secretos)

Este archivo **solo referencia** los secretos de conexión; **nunca** contiene valores reales
(CLAUDE.md §Seguridad, §12). Las credenciales viven en el `.env` local (no versionado) y, en
producción, en el secrets manager del tenant.

## Origen: SAP Business One / HANA

| Parámetro | Variable de entorno | Notas |
|-----------|---------------------|-------|
| Host HANA | `HANA_HOST` | Instancia HANA de SAP B1 |
| Puerto | `HANA_PORT` | Típico 3<nn>15 |
| Usuario read-only | `HANA_USER` | Usuario **solo lectura** dedicado a extracción |
| Password | `HANA_PASSWORD` | Solo en `.env` / secrets manager |
| Sociedades piloto | `HANA_SCHEMAS_PILOTO` | Schemas HANA (BD por sociedad), coma-separados |

- Cada sociedad = una BD HANA (ver `empresas.md`). La misma instancia HANA expone varios schemas.
- **Vía de extracción:** vistas read-only dedicadas en HANA (recomendado) — se confirma al iniciar
  Fase 1. Nunca escribir en el ERP ni consultar tablas base fuera de la vía aprobada (§14).

## Destino: Postgres (plano de datos)

Variables `POSTGRES_*` (ver `.env.example`). Local vía Docker en esta etapa (`infra/local/`).
