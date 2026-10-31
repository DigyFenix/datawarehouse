#!/usr/bin/env bash
# =====================================================================
# Despliegue de una versión nueva al servidor de UN cliente (receta repetible, sesión 37).
# Toma el paquete más nuevo de dist/ (o la versión indicada), lo sube, respalda las imágenes
# actuales, copia .env y los certificados TLS de Postgres de la versión anterior, aplica las
# migraciones de tenant listadas en MIGRACIONES a cada dw_<tenant> y reinicia los servicios.
# NO corre dbt ni seeds.
#
# Uso (desde la raíz del repo, Git Bash):  bash infra/produccion/desplegar.sh [version]
# Editar antes de cada despliegue: SRV, MIGRACIONES (idempotentes, en orden).
# Rollback de imágenes: docker tag <img>:respaldo-<version> <img>:<version-anterior> && docker compose up -d
# Rollback de datos: metadata-store/rollback/<migración>.sql
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

# Migraciones de TENANT (archivos de metadata-store/schema) que esta versión necesita, en orden.
MIGRACIONES=(138_uso_ia_tenant.sql)
VERSION="${1:-$(ls -t dist/quilate-imagenes-*.tar.gz | head -1 | sed -E 's#.*quilate-imagenes-(.*)\.tar\.gz#\1#')}"
SRV=ubuntu@77.112.237.34
SSH=(ssh -i ~/.ssh/quilate_deploy -o BatchMode=yes "$SRV")
SCP=(scp -i ~/.ssh/quilate_deploy -o BatchMode=yes)
SUB=subida-$VERSION
# Versión que CORRE hoy (tag de la imagen del API), no la carpeta que ordena último: 8b4ad65-local > 6fe70de en orden alfabético.
ANTERIOR=$("${SSH[@]}" "docker inspect quilate-portal-api --format {{.Config.Image}} | cut -d: -f2")

echo "== versión nueva: $VERSION · anterior en el servidor: $ANTERIOR =="
echo "== 1/5 subiendo paquete =="
"${SSH[@]}" "mkdir -p ~/$SUB"
REMOTO_PREV=$("${SSH[@]}" "sha256sum ~/$SUB/quilate-imagenes-$VERSION.tar.gz 2>/dev/null" | cut -d" " -f1)
if [[ "$REMOTO_PREV" == "$(sha256sum "dist/quilate-imagenes-$VERSION.tar.gz" | cut -d" " -f1)" ]]; then echo "   (ya estaba subido, se omite)"; else "${SCP[@]}" "dist/quilate-$VERSION.tar.gz" "dist/quilate-imagenes-$VERSION.tar.gz" "$SRV:~/$SUB/"; fi
LOCAL=$(sha256sum "dist/quilate-imagenes-$VERSION.tar.gz" | cut -d' ' -f1)
REMOTO=$("${SSH[@]}" "sha256sum ~/$SUB/quilate-imagenes-$VERSION.tar.gz" | cut -d' ' -f1)
[[ "$LOCAL" == "$REMOTO" ]] || { echo "FALLO · el archivo de imágenes llegó dañado"; exit 1; }

"${SSH[@]}" VERSION="$VERSION" ANTERIOR="$ANTERIOR" MIGRACIONES="$(IFS=,; echo "${MIGRACIONES[*]}")" bash -s <<'REMOTO'
set -euo pipefail
SUB=~/subida-$VERSION

echo "== 2/5 verificando .env (sin mostrar valores) =="
cd ~/quilate-$ANTERIOR
grep -q "^ANTHROPIC_API_KEY=." .env || echo "   AVISO · ANTHROPIC_API_KEY vacía: el módulo Asistente responde 503 hasta que se configure"
for k in PORTAL_LECTOR_PASSWORD; do
  grep -q "^$k=." .env || { echo "FALLO · falta $k en .env"; exit 1; }
done
grep -q "^ZONA_HORARIA=" .env || echo "ZONA_HORARIA=America/Guatemala" >> .env
grep -q "^HORAS_CARGA=" .env || { echo "HORAS_CARGA=05:00" >> .env; echo "   HORAS_CARGA no estaba: se fijó 05:00 (ajustar si el programador corre a otra hora)"; }

echo "== 3/5 respaldo de imágenes y carga de las nuevas =="
for i in quilate-api quilate-web quilate-api-usuario quilate-web-usuario quilate-worker; do
  docker tag "$i:$ANTERIOR" "$i:respaldo-$VERSION" 2>/dev/null || true
done
gunzip -c "$SUB/quilate-imagenes-$VERSION.tar.gz" | docker load
tar xzf "$SUB/quilate-$VERSION.tar.gz" -C ~
cp ~/quilate-$ANTERIOR/.env ~/quilate-$VERSION/.env && chmod 600 ~/quilate-$VERSION/.env
sed -i "s/^VERSION=.*/VERSION=$VERSION/" ~/quilate-$VERSION/.env   # sin esto compose recrea con las imágenes VIEJAS
# Certificados TLS de Postgres: viven en ./pg-tls de la versión anterior (no viajan en el paquete).
# Sin ellos Postgres no arranca (ssl=on). Y el cron de renovación debe apuntar a la carpeta nueva.
sudo cp -a ~/quilate-$ANTERIOR/pg-tls/. ~/quilate-$VERSION/pg-tls/
sudo sed -i "s#quilate-$ANTERIOR#quilate-$VERSION#" /etc/cron.d/quilate-tls-postgres 2>/dev/null || true

echo "== 4/5 migraciones de tenant: $MIGRACIONES =="
for db in $(docker exec quilate-postgres psql -U quilate_admin -d quilate_control -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'dw_%'"); do
  echo "   · $db"
  for mig in ${MIGRACIONES//,/ }; do
    docker exec -i quilate-postgres psql -U quilate_admin -d "$db" -v ON_ERROR_STOP=1 < ~/quilate-$VERSION/metadata-store/schema/$mig > /dev/null
  done
done

echo "== 5/5 reinicio de servicios =="
cd ~/quilate-$VERSION && docker compose up -d
sleep 25
docker ps --format '{{.Names}} {{.Status}}' | grep -E "portal|worker|programador"
REMOTO

echo "== verificación =="
curl -s -o /dev/null -w "portal usuario: HTTP %{http_code}\n" https://ironnetwork.digyfenix.com/
curl -s https://ironnetwork.digyfenix.com/api/health
echo
echo "LISTO. Entra al portal: Inicio debe decir «Próxima actualización …»; prueba Descargas y, en el chat,"
echo "pregunta «¿cuánto vendimos hoy?» → debe citar el corte y la próxima carga, y la solicitud aparece en Administración → Demanda."
