---
name: stack-local
description: Levanta, verifica, baja o diagnostica el stack local de Quilate Analytics en Docker (Postgres, portal admin, portal de usuario, worker). Úsala cuando haya que arrancar el entorno, comprobar que todo está sano, ver por qué un servicio no responde, o al empezar una sesión que va a tocar datos, dbt, el portal o Power BI.
---

# Stack local — Quilate Analytics

El entorno completo vive en `infra/local/docker-compose.yml`, proyecto compose **`quilate`**.
Todos los valores sensibles salen del `.env` de la raíz (no versionado, **no se lee**).

## Los servicios

| Contenedor | Qué es | Puerto host |
|---|---|---|
| `quilate-postgres` | Postgres 16: base de control + una base por tenant | 5432 |
| `quilate-portal-api` | API del portal admin (NestJS) | 3001 |
| `quilate-portal-web` | Portal admin (Angular/nginx) | 8080 |
| `quilate-portal-usuario-api` | API del portal de usuario (NestJS) | 3002 |
| `quilate-portal-usuario-web` | Portal de usuario (Angular/nginx) | 8081 |
| `quilate-worker` | Extracción ERP→Bronce y `dbt build` | 3010 |
| `quilate-pgadmin` | opcional, perfil `tools` | — |

Todo salvo Postgres y pgAdmin está bajo el **perfil `portal`**: sin `--profile portal` solo
levanta la base.

## Levantar

```powershell
cd infra/local
docker compose --env-file ../../.env --profile portal up -d
```

Agregá `--build` solo si cambió código de API, web o worker; sin cambios es tiempo perdido.

## Verificar que está sano

```powershell
docker ps --format "{{.Names}}`t{{.Status}}"
docker exec quilate-postgres pg_isready -U quilate_admin -d quilate_control
curl.exe -s http://localhost:3001/api/health
curl.exe -s http://localhost:3010/health
```

Bases esperadas: `quilate_control` (control) + una `dw_<tenant>` por organización.

```powershell
docker exec quilate-postgres psql -U quilate_admin -d quilate_control -c "SELECT datname FROM pg_database WHERE datname NOT IN ('template0','template1') ORDER BY 1;"
```

## Bajar

```powershell
cd infra/local
docker compose --profile portal down          # conserva los datos
```

**Nunca `down -v`.** Ese flag borra el volumen `quilate_pgdata` con todo el warehouse
(varios GB, horas de extracción). Si de verdad hay que empezar de cero, respaldar primero.

## Diagnóstico

```powershell
docker logs quilate-portal-api --tail 80
docker logs quilate-worker --tail 80
docker exec quilate-postgres psql -U quilate_admin -d quilate_control -c "SELECT 1;"
```

- **Un servicio reinicia en bucle** → casi siempre el `.env`: falta una variable o cambió una
  credencial. `docker logs` lo dice en la primera línea.
- **El API responde pero el portal muestra 502** → nginx del web no alcanza al api; revisar que
  ambos estén en la misma red del proyecto compose.
- **dbt falla con `FileFallocate: Interrupted system call`** → alguien devolvió el datadir a un
  bind mount de Windows. Debe ser el volumen Docker nativo `pgdata` (migrado el 2026-08-07).

## ⚠ La trampa del renombre

El `name: quilate` del compose **prefija los volúmenes**. Si alguien lo cambia, Docker crea un
`<nuevo>_pgdata` **vacío** y Postgres arranca con una base en blanco: parece pérdida total de
datos y no lo es — los datos siguen en el volumen viejo. Pasó al renombrar `cresta-dw` → `quilate`
(sesión 20). Antes de tocar `name:`, copiar el volumen y verificar el tamaño de la base:

```powershell
docker volume ls
docker exec quilate-postgres psql -U quilate_admin -d quilate_control -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY 2 DESC;"
```

## Operar los datos (worker)

```powershell
# actualización completa de una organización: extracción + build
docker exec quilate-worker python3 /dbt/herramientas/actualizar.py grupocresta

# solo el build dbt (Bronce→Plata→Oro)
docker exec quilate-worker python3 /dbt/herramientas/correr.py grupocresta
```

Después de cualquier build, **verificar el cuadre** antes de dar el dato por bueno:

```powershell
docker exec quilate-postgres psql -U quilate_admin -d dw_grupocresta -c "SELECT empresa_id, concepto, cuadra, diferencia FROM plata.plata_control_cuadre WHERE NOT cuadra;"
```

Cero filas = cuadra. Cualquier fila es un dato que no se publica.
