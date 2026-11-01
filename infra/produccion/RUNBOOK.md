# Runbook — Producción: un servidor por cliente

Cada cliente tiene su propio servidor (AWS Lightsail) con todo el stack: Postgres, portal de
usuario, portal admin, worker, programador de cargas, Caddy (TLS) y respaldos. Nada se
comparte entre clientes. Ensayado de punta a punta en instalación limpia el 2026-10-18 (Iron
Network: 1 min de carga, 9,465 filas, 231/231 dbt, cuadre en cero, Oro idéntico a local).

El servidor **no tiene el repo ni compila**: recibe el paquete que arma `empaquetar.sh`.

---

## 1. Armar el paquete (máquina de desarrollo)

```bash
bash infra/produccion/empaquetar.sh          # construye las 5 imágenes y empaqueta
# → dist/quilate-<version>.tar.gz            (~170 KB: compose, Caddyfile, scripts, init, metadata-store, dbt)
# → dist/quilate-imagenes-<version>.tar.gz   (~275 MB: imágenes)
```

Lo que **no** viaja: `organizaciones/`, `docs/`, `consumo/powerbi/`, código fuente.

## 2. Crear el servidor (consola de Lightsail)

- Linux/Unix · **Ubuntu 24.04 LTS** · plan **$12** (2 GB RAM, 60 GB SSD) — escalar de plan si
  el warehouse supera 1 GB (ver escalones de precio).
- **IP estática** adjunta (gratis mientras esté adjunta).
- **Snapshots automáticos diarios** activados (respaldo fuera del disco del servidor).
- **Firewall de Lightsail (red) — es el control principal:**

| Puerto | Origen | Para qué |
|---|---|---|
| 22 | Solo tu IP | SSH |
| 80, 443 | Cualquiera | Caddy (TLS y portal) |
| 5432 | **Solo la IP del gateway de Power BI** | `pbi_lector` |

Además, Postgres rechaza por `pg_hba` todo acceso externo que no sea `pbi_lector` a una base
`dw_*` desde `PBI_GATEWAY_CIDR` (init 05): ni el superusuario ni el portal entran desde fuera
aunque el firewall falle. **`PBI_GATEWAY_CIDR` debe ser la IP del gateway con `/32`**; vacío
queda `0.0.0.0/0` (pbi_lector, que es BYPASSRLS, abierto a internet con solo contraseña).

## 3. Preparar el servidor (una vez)

```bash
# Docker Engine + Compose (guía oficial de Docker para Ubuntu)
sudo usermod -aG docker ubuntu && newgrp docker

# Swap de 2 GB: margen ante un pico de dbt o de extracción sin que el OOM mate a Postgres
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker: sin userland-proxy (la IP real del cliente llega a Postgres/Caddy) y logs acotados
echo '{"userland-proxy": false, "log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}' \
  | sudo tee /etc/docker/daemon.json && sudo systemctl restart docker
```

### 3.1 Acceso de `pbi_lector` en un servidor YA instalado (auditoría 2026-10-31, A2)

El init solo corre en el primer arranque. En un servidor existente, aplicar a mano (como
superusuario por `docker exec`, que entra por el socket local):

```bash
# 1) Tope de conexiones del gateway (un abuso de la credencial no agota max_connections)
docker exec quilate-postgres psql -U quilate_admin -d quilate_control -c "ALTER ROLE pbi_lector CONNECTION LIMIT 30;"

# 2) pg_hba: cambiar 0.0.0.0/0 por la IP del gateway /32 y quitar la línea ::/0
docker exec quilate-postgres sh -c 'cp "$PGDATA/pg_hba.conf" "$PGDATA/pg_hba.conf.bak" &&   sed -i -e "s#pbi_lector   0.0.0.0/0  #pbi_lector   <IP-GATEWAY>/32#" -e "/pbi_lector   ::\/0/d" "$PGDATA/pg_hba.conf" &&   grep pbi_lector "$PGDATA/pg_hba.conf"'
docker exec -u postgres quilate-postgres sh -c 'pg_ctl reload -D "$PGDATA"'
# Rollback: restaurar pg_hba.conf.bak + reload · ALTER ROLE pbi_lector CONNECTION LIMIT -1;
```

Y fijar `PBI_GATEWAY_CIDR=<IP-GATEWAY>/32` en `.env` para que un reinicio desde cero lo respete.
**Rotación de la contraseña de `pbi_lector`:** `ALTER ROLE pbi_lector PASSWORD '<nueva>';`,
actualizar `.env` y la credencial del origen en el gateway; al menos una vez al año y cada vez
que alguien con acceso al gateway deja el proyecto.

### 3.2 Riesgo aceptado: Publish to Web

Decisión de Edwin (2026-10-31): los tableros se publican con **Publish to Web** de Power BI.
Ese vínculo es **público**: quien lo obtenga ve el reporte sin autenticarse y sin RLS, aunque
el portal solo lo muestre a usuarios autenticados. Mitigación: los códigos nunca viajan en JSON
del portal (se redirige desde el visor), y si uno se filtra se rota (§8, «Rotar vínculo de
Power BI filtrado»). No poner en Publish to Web datos que no se puedan ver públicamente.

## 4. DNS (Cloudflare)

Registros `A` hacia la IP estática, **solo DNS (nube gris)**: Caddy emite el certificado.

| Registro | Uso |
|---|---|
| `<cliente>.digyfenix.com` | Portal de usuario (lo que abre el cliente) |
| `admin-<cliente>.digyfenix.com` | Portal admin (solo el proveedor) |

Un solo nivel de subdominio a propósito: `admin.<cliente>.digyfenix.com` no lo cubre el
certificado universal de Cloudflare si algún día se activa el proxy.

## 5. Instalar

```bash
scp dist/quilate-<v>.tar.gz dist/quilate-imagenes-<v>.tar.gz ubuntu@<ip>:~
ssh ubuntu@<ip>
tar xzf quilate-<v>.tar.gz && cd quilate-<v>
gunzip -c ../quilate-imagenes-<v>.tar.gz | docker load
cp variables.env.ejemplo .env && nano .env      # secretos NUEVOS: openssl rand -base64 33
chmod 600 .env
docker compose up -d
docker compose ps                                # todo "Up", postgres "healthy"
docker logs quilate-postgres 2>&1 | grep -E "ERROR|FATAL|init process complete"
```

El primer arranque inicializa la base de control desde `metadata-store` (orden numérico) y
crea los roles `portal_app`, `pbi_lector`, `portal_lector`.

## 6. Dar de alta al cliente (portal admin: `https://admin-<cliente>.digyfenix.com`)

1. **Organizaciones → Nueva** (código, ERP, color; Asistente apagado salvo venta).
2. **Conexiones** (host/puerto/base del ERP + `secreto_ref`; la credencial va en `.env`).
3. **Sociedades** (empresa_id, NIT, moneda, conexión, esquema de origen).
4. **Organizaciones → Provisionar** (Odoo pide el id de compañía).
5. **Portal usuario → Sembrar admin** y subir el **logo**.
6. Copiar el `hash` de la organización a `HASH_TENANT` en `.env` y
   `docker compose up -d caddy` → la raíz del subdominio lleva al login.
7. Primera carga completa:
   `docker exec quilate-worker python3 /dbt/herramientas/actualizar.py <codigo>`
   y verificar el cuadre (cero filas = cuadra):
   `docker exec quilate-postgres psql -U quilate_admin -d dw_<codigo> -c "SELECT * FROM plata.plata_control_cuadre WHERE NOT cuadra;"`

## 7. Power BI

- Gateway (Windows, siempre encendido, IP fija o conocida) → origen PostgreSQL
  `<ip-servidor>:5432`, base `dw_<codigo>`, usuario **`pbi_lector`** (nunca el superusuario).
- Agregar la IP del gateway al firewall de Lightsail (5432) **y** a `PBI_GATEWAY_CIDR` (`<ip>/32`)
  en `.env` (servidor existente: §3.1). Si la IP del gateway cambia, actualizar ambos.
- Publish to Web es un riesgo aceptado (§3.2): el vínculo es público, sin RLS.
- Refresco programado **al menos 1 h después** de `HORAS_CARGA`.
- Publish to Web → registrar cada página/reporte en **Portal usuario → Tableros**.

## 8. Operación

| Qué | Cómo |
|---|---|
| Carga diaria | Automática (`quilate-programador`, `HORAS_CARGA`). Log: `docker logs quilate-programador` |
| Carga manual | `docker exec quilate-worker python3 /dbt/herramientas/actualizar.py <codigo>` (si hay otra en curso, sale con «OMITIDO») |
| Respaldos | `./backups` diario, 14 días + snapshots de Lightsail. Con `RESPALDO_PASSPHRASE` salen cifrados (`*.dump.enc`) |
| Espacio | `df -h /` y `docker system df` — alerta si el disco pasa de 70 % |
| Rotar vínculo de Power BI filtrado | Power BI → Administrar códigos para insertar → eliminar → crear otro → actualizar en Portal usuario → Tableros |

**Probar la restauración** al menos una vez:
```bash
docker exec quilate-postgres createdb -U quilate_admin prueba_restore
# Respaldo en claro (*.dump):
docker exec -i quilate-postgres pg_restore -U quilate_admin -d prueba_restore < backups/<archivo>.dump
# Respaldo cifrado (*.dump.enc): se descifra con la misma passphrase de .env (openssl en el host)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:RESPALDO_PASSPHRASE -in backups/<archivo>.dump.enc   | docker exec -i quilate-postgres pg_restore -U quilate_admin -d prueba_restore
#   (antes: export RESPALDO_PASSPHRASE='...' en la sesión, o -pass file:<ruta> con permisos 600)
docker exec quilate-postgres psql -U quilate_admin -d prueba_restore -c "SELECT count(*) FROM oro.hecho_venta_linea;"
docker exec quilate-postgres dropdb -U quilate_admin prueba_restore
```

## 9. Actualizar a una versión nueva

Receta automatizada: `bash infra/produccion/desplegar.sh [version]` desde la raíz del repo (editar
`MIGRACIONES` antes). Hace todo lo de abajo, incluido copiar `pg-tls` y recolocar el cron de TLS.

```bash
# desarrollo: bash infra/produccion/empaquetar.sh → scp de los dos archivos
gunzip -c quilate-imagenes-<v>.tar.gz | docker load
tar xzf quilate-<v>.tar.gz && cp quilate-<anterior>/.env quilate-<v>/ && cd quilate-<v>
sed -i 's/^VERSION=.*/VERSION=<v>/' .env
sudo cp -a ../quilate-<anterior>/pg-tls/. ./pg-tls/        # certificados TLS de Postgres: NO viajan en el paquete; sin ellos no arranca
sudo sed -i 's#quilate-<anterior>#quilate-<v>#' /etc/cron.d/quilate-tls-postgres
docker compose up -d
# DDL nuevo de control:  docker exec -i quilate-postgres psql -U quilate_admin -d quilate_control < metadata-store/schema/<archivo>.sql
# DDL nuevo de tenant (*_tenant.sql y 126/127/133): sobre dw_<codigo>
```

⚠ **No cambiar `name: quilate`** del compose: cambia el prefijo del volumen y Docker crea uno
vacío (parece pérdida total de datos; los datos siguen en el volumen viejo).
⚠ **Nunca `docker compose down -v`**: borra el warehouse.

## 10. Verificación de seguridad tras instalar (desde FUERA del servidor)

```bash
psql -h <ip> -U quilate_admin -d quilate_control      # debe fallar (firewall o pg_hba)
psql -h <ip> -U pbi_lector -d dw_<codigo>              # solo desde la IP del gateway
curl -sI https://<cliente>.digyfenix.com | grep -i content-security-policy
```

## Pendientes conocidos (no bloquean a Iron)

- **Módulo Asistente:** antes de venderlo, cuota diaria por usuario/organización, un mensaje a
  la vez y `LIMIT` en conversaciones (hoy apagado por organización y sin `ANTHROPIC_API_KEY`).
- **Extracción por lotes** (`fetchmany`) para clientes grandes: hoy carga la tabla completa
  en memoria; con Iron (9 k filas) no importa.
- **Portal admin restringido por IP** en Caddy si la IP del proveedor es fija.
