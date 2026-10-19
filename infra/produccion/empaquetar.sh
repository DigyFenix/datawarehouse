#!/usr/bin/env bash
# =====================================================================
# Arma el PAQUETE DE DESPLIEGUE de producción (se corre en la máquina de
# desarrollo, Git Bash). El servidor del cliente no tiene el repo ni
# compila: recibe dos archivos.
#
#   dist/quilate-<version>.tar.gz           compose, Caddyfile, scripts, init de
#                                           Postgres, metadata-store y proyecto dbt
#   dist/quilate-imagenes-<version>.tar.gz  las 5 imágenes (docker save)
#
# Uso:  bash infra/produccion/empaquetar.sh [--sin-build]
#   --sin-build  empaqueta las imágenes locales tal como están (sin reconstruir)
#
# Lo que NO viaja: organizaciones/ (datos y specs de cada cliente), docs/,
# consumo/powerbi/, código fuente. Cada cliente recibe solo el motor.
# =====================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"

VERSION="$(git rev-parse --short HEAD)"
git diff --quiet HEAD -- || VERSION="${VERSION}-local"
IMAGENES=(quilate-api quilate-web quilate-api-usuario quilate-web-usuario quilate-worker)
SALIDA="$RAIZ/dist"
PAQUETE="$SALIDA/quilate-$VERSION"

echo "[empaquetar] versión $VERSION"

if [[ "${1:-}" != "--sin-build" ]]; then
  echo "[empaquetar] construyendo imágenes con el compose local"
  docker compose -f infra/local/docker-compose.yml --env-file .env --profile portal \
    build api web api-usuario web-usuario worker
fi

for img in "${IMAGENES[@]}"; do
  docker image inspect "$img:latest" >/dev/null 2>&1 || { echo "FALLO · falta la imagen $img:latest"; exit 1; }
  docker tag "$img:latest" "$img:$VERSION"
done

rm -rf "$PAQUETE"
mkdir -p "$PAQUETE"
cp infra/produccion/{docker-compose.yml,Caddyfile,programador.sh,respaldo.sh,tls-postgres.sh,variables.env.ejemplo,RUNBOOK.md} "$PAQUETE/"
cp -r infra/local/init "$PAQUETE/init"
mkdir -p "$PAQUETE/metadata-store"
cp -r metadata-store/{schema,rollback,seeds} "$PAQUETE/metadata-store/"
rm -rf "$PAQUETE/metadata-store/seeds/historicos"
mkdir -p "$PAQUETE/transformacion"
( cd data-plane/transformacion && tar cf - --exclude=target --exclude=logs --exclude=_retirado_v1 \
    --exclude='profiles.yml' . ) | ( cd "$PAQUETE/transformacion" && tar xf - )
echo "VERSION=$VERSION" > "$PAQUETE/VERSION"

echo "[empaquetar] comprimiendo paquete"
tar czf "$SALIDA/quilate-$VERSION.tar.gz" -C "$SALIDA" "quilate-$VERSION"
rm -rf "$PAQUETE"

echo "[empaquetar] guardando imágenes (tarda unos minutos)"
docker save $(printf "%s:$VERSION " "${IMAGENES[@]}") | gzip > "$SALIDA/quilate-imagenes-$VERSION.tar.gz"

ls -lh "$SALIDA"/quilate-*"$VERSION"*.tar.gz
echo "[empaquetar] listo · versión $VERSION"
