# infra/local — Alojamiento local (Docker)

Levanta el plano de datos en local para iterar. Migrable a AWS (RDS + cómputo) sin cambiar el
diseño.

## Uso

```bash
cp ../../.env.example ../../.env   # completar valores (NO se versiona)
docker compose up -d               # levanta Postgres + pgAdmin
```

- `docker-compose.yml` — PostgreSQL 16 (+ pgAdmin opcional).
- `init/` — scripts SQL ejecutados por Postgres en el primer arranque (crean esquemas medallion).
- `data/` — volumen persistente de Postgres (ignorado por git).

Postgres queda disponible en `localhost:${POSTGRES_PORT}`. Los esquemas
`bronze/silver/gold/metadata/gobierno` se crean automáticamente.
