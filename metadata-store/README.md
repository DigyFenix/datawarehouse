# metadata-store — Contrato entre planos

La **frontera**: el portal (plano de control) escribe; el plano de datos lee. Contiene el
catálogo de metadatos, mapeos, glosario y políticas. **Nunca** guarda secretos de conexión
(esos van al secrets manager por tenant).

- `schema/` — DDL versionado de las tablas del catálogo (con rollback por archivo).
- `seeds/` — datos semilla (fichas iniciales de métricas, etc.).

El catálogo vive en el esquema `metadata` de Postgres. Ver `CLAUDE.md` §7 y §9, y
`docs/arquitectura/02-arquitectura-tecnica.md`.
