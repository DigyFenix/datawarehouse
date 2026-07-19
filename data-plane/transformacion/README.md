# transformacion — dbt (Bronze → Silver → Gold)

Proyecto dbt del plano de datos. Transforma lo crudo de `bronze` al modelo canónico en `silver`
(con calidad + cuarentena) y al modelo estrella en `gold`. **Silver es la costura agnóstica**
(`CLAUDE.md` §6): no se salta.

## Estado

**Fase 0 = esqueleto** (proyecto configurado, sin modelos reales). Los modelos Silver (mapeo
`sap_b1`→canónico + tests de calidad + `quarantine_*`) y Gold (`fct_*`, `dim_*` con miembro
default) se construyen en **Fase 1**, y las métricas materializadas en **Fase 2**.

## Setup

```bash
pip install dbt-postgres
cp profiles.yml.example ~/.dbt/profiles.yml   # completar; NO versionar con credenciales
dbt debug     # verifica conexión a Postgres
dbt run       # (cuando haya modelos)
dbt test      # calidad (§10)
```

Los schemas `bronze/silver/gold` los crea `infra/local/init/01_esquemas.sql`; la macro
`macros/generate_schema_name.sql` hace que dbt use esos nombres exactos.

## Calidad (§10)

`dbt tests` en Silver antes de Gold: completitud (not_null), validez (signo del monto,
`relationships`), consistencia (NC referencia factura), unicidad (`unique`). Los registros que
fallan **no bloquean**: se desvían a `quarantine_<modelo>`.
