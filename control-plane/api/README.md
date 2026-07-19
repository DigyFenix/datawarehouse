# control-plane/api — API del portal (NestJS)

Backend del **plano de control**. Administra el `metadata-store` (Postgres) y aplica las reglas
de gobernanza. **No mueve datos.** Motor común, agnóstico al tenant.

## Stack

NestJS + Drizzle (query builder tipado) + Zod (validación de entradas) + `pg`. Auth con JWT
(argon2 para hash de contraseñas). Respuesta uniforme `{ success, data, error }`.

## Principios

- El schema lo gobierna el **DDL SQL versionado + rollback** en `metadata-store/schema` (no
  drizzle-kit). `src/db/schema.ts` solo declara las tablas para tipado/consultas.
- Toda entrada externa se valida con **Zod** (`ZodValidationPipe`).
- Toda mutación queda **auditada** (`AuditoriaService`, §12).
- El frontend nunca toca Postgres: todo pasa por esta API.
- Credenciales solo desde `.env` (validado con Zod al arranque); nunca en logs.

## Estructura

```
src/
  config/env.ts            # validación de entorno (Zod)
  common/                  # respuesta {success,data,error}, interceptor, filtro, ZodPipe
  db/                      # Drizzle: schema tipado + módulo de conexión
  auditoria/               # registro append-only de cambios (§12)
  organizaciones/          # CRUD de tenants (primer módulo funcional)
  health/                  # healthcheck (API + Postgres)
  app.module.ts · main.ts
```

## Estado

**Fundación en construcción.** Listo: config, Drizzle, respuesta estándar, auditoría, healthcheck
y **CRUD de organizaciones**. Pendiente: **auth + usuarios/roles** (P4) y el frontend Angular (P5).

## Uso (local)

```bash
cd control-plane/api
npm install
# requiere Postgres arriba (infra/local) y .env en la raíz con POSTGRES_* + JWT_SECRET
npm run start:dev
# Verificar:
curl http://localhost:3001/api/health
curl http://localhost:3001/api/organizaciones   # debe listar 'grupocresta' (seed)
```
