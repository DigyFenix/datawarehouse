# Runbook — Producción en VPS (Docker Compose)

Publica: Postgres (control + tenants) · portal admin (dominio A) · portal de usuario
(dominio B, tenant por hash en el path) · worker · Caddy (TLS automático) · respaldos.

## 1. Aprovisionar el VPS

- Ubuntu LTS, 2 vCPU / 4 GB RAM / 40 GB SSD mínimo (Hetzner / DigitalOcean / Contabo).
- Instalar Docker Engine + plugin de Compose (guía oficial de Docker).
- Crear usuario no-root con `sudo`; deshabilitar login SSH por contraseña (solo llaves).

## 2. DNS

Registros `A` hacia la IP del VPS:

| Registro | Uso |
|---|---|
| `admin.<dominio-a>` | Portal admin (plano de control) |
| `portal.<dominio-b>` | Portal de usuario (todos los tenants; el hash va en el path) |

Dar de alta una organización **no** toca DNS ni Caddy: su URL es `https://portal.<dominio-b>/<hash>`.

## 3. Desplegar el stack

```bash
git clone <repo> && cd datawarehouse/infra/produccion
cp .env.produccion.example .env        # completar TODOS los valores (secretos NUEVOS)
# Editar Caddyfile: reemplazar admin.example.com / portal.example.com por los dominios reales
docker compose up -d --build
```

Actualizar la URL del portal de usuario en el frontend admin
(`control-plane/portal/src/environments/environment.ts` → `portalUsuarioUrl`) antes del build.

## 4. Firewall (ufw) — crítico

```bash
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
# 5432 SOLO desde la IP pública de la red de Cresta (su ingesta corre on-prem
# y escribe hacia este Postgres). Iron Network NO necesita entrada: su
# extracción corre en el worker del VPS hacia afuera.
ufw allow from <IP_PUBLICA_CRESTA> to any port 5432 proto tcp
ufw enable
```

> Nota Docker: `docker compose` publica 5432 saltándose ufw en algunas configuraciones
> (iptables de Docker). Verificar SIEMPRE desde una IP externa no autorizada:
> `psql -h <ip-vps> -p 5432` debe fallar por timeout. Si no, usar la integración
> ufw-docker o restringir con `iptables -I DOCKER-USER`.

## 5. Roles de Postgres

```sql
-- Rol dedicado del portal de USUARIO (nunca el admin del clúster):
CREATE ROLE portal_app LOGIN PASSWORD '<PORTAL_DB_PASSWORD>';
-- Base de control: solo resolver hash → tenant + branding.
GRANT CONNECT ON DATABASE cresta_dw TO portal_app;
\c cresta_dw
GRANT USAGE ON SCHEMA gobierno TO portal_app;
GRANT SELECT ON gobierno.organizaciones TO portal_app;
-- Cada base de tenant: el esquema portal completo (repetir por dw_*):
\c dw_grupocresta
GRANT CONNECT ON DATABASE dw_grupocresta TO portal_app;
GRANT USAGE ON SCHEMA portal TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO portal_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA portal TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA portal GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA portal GRANT USAGE ON SEQUENCES TO portal_app;
```

## 6. Migración de datos local → VPS

**NUNCA copiar `infra/local/data/`** (datadir binario). Solo `pg_dump`/`pg_restore`:

```bash
# En la máquina local (una por base):
docker exec cresta-postgres pg_dump -U cresta_admin -Fc cresta_dw        > cresta_dw.dump
docker exec cresta-postgres pg_dump -U cresta_admin -Fc dw_grupocresta  > dw_grupocresta.dump
docker exec cresta-postgres pg_dump -U cresta_admin -Fc dw_ironnetwork  > dw_ironnetwork.dump

# Copiar al VPS (scp) y restaurar:
docker exec -i prod-postgres createdb -U $POSTGRES_USER dw_grupocresta
docker exec -i prod-postgres pg_restore -U $POSTGRES_USER -d dw_grupocresta --no-owner < dw_grupocresta.dump
# (igual para dw_ironnetwork; cresta_dw se restaura sobre la base creada por el compose:)
docker exec -i prod-postgres pg_restore -U $POSTGRES_USER -d cresta_dw --no-owner --clean --if-exists < cresta_dw.dump
```

**Verificación post-migración:**
- Conteos de `oro.hecho_venta_linea` iguales en local y VPS (por tenant).
- Login del portal admin y del portal de usuario en sus dominios.
- `plata.plata_control_cuadre` con `cuadra = true`.

## 7. Ingesta en operación

- **Cresta (HANA on-prem):** el worker corre en una máquina dentro de la red de Cresta con
  el `.env` apuntando `POSTGRES_HOST=<ip-vps>` (SSL recomendado). El botón del portal admin
  no dispara ese worker remoto — programar la corrida con cron/plan hasta tener el agente.
- **Iron Network (Postgres expuesto):** el worker del VPS extrae directo.
- **Power BI:** el on-premises data gateway (Windows, en la oficina) sale hacia el 5432 del
  VPS → agregar también esa IP al firewall si es distinta de la de Cresta.

## 8. Respaldos

El contenedor `respaldo` corre `pg_dump -Fc` diario de la base de control y cada `dw_*` a
`./backups`, con rotación (`RESPALDO_RETENCION_DIAS`, default 14).

**Probar la restauración** (al menos una vez y tras cambios grandes):

```bash
docker exec prod-postgres createdb -U $POSTGRES_USER prueba_restore
docker exec prod-postgres pg_restore -U $POSTGRES_USER -d prueba_restore /backups/<archivo>.dump
docker exec prod-postgres psql -U $POSTGRES_USER -d prueba_restore -c "SELECT count(*) FROM oro.hecho_venta_linea;"
docker exec prod-postgres dropdb -U $POSTGRES_USER prueba_restore
```

Copiar los `.dump` fuera del VPS periódicamente (rsync/S3) — un respaldo en el mismo disco
no sobrevive a la pérdida del VPS.

## 9. Onboarding de tenant en producción (resumen)

1. Portal admin → Organizaciones → Nueva (genera `hash_tenant`); subir logo y color.
2. `createdb dw_<codigo>` + aplicar `101_esquemas_tenant.sql` y `110_portal_tenant.sql`.
3. Grants del §5 para `portal_app` sobre la base nueva.
4. Configurar ingesta (ver `docs/ONBOARDING-nueva-organizacion.md`).
5. Portal admin → Portal usuario → tableros + Sembrar admin; entregar `https://portal.<dominio-b>/<hash>`.

## 10. Actualizaciones

```bash
cd datawarehouse && git pull
cd infra/produccion && docker compose up -d --build
# DDL nuevo del metadata-store (control):
docker exec prod-postgres psql -U $POSTGRES_USER -d cresta_dw -f /opt/metadata-store/schema/<archivo>.sql
# DDL de tenant (*_tenant.sql): aplicar a CADA dw_*.
```
