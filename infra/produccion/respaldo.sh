#!/bin/sh
# =====================================================================
# Respaldo diario: pg_dump -Fc de la base de control y de cada base dw_*.
# Corre dentro del contenedor `respaldo` (bucle de 24 h). Rotación por
# RETENCION_DIAS (default 14).
#
# Cifrado (opcional, recomendado): si RESPALDO_PASSPHRASE está definida, cada
# volcado sale cifrado con AES-256-CBC + PBKDF2 (openssl) como <base>_<fecha>.dump.enc
# y nunca toca el disco en claro. La imagen postgres:16-alpine no trae openssl:
# se instala con apk la primera vez (requiere salida a internet del servidor).
# Si se pidió cifrado y no hay openssl, el respaldo FALLA a propósito: no se
# escribe en claro algo que se esperaba cifrado (quedan los snapshots de Lightsail).
#
# Restauración: RUNBOOK §8.
# La passphrase vive en `.env` y TAMBIÉN fuera del servidor (gestor de contraseñas):
# sin ella los respaldos cifrados son irrecuperables.
# =====================================================================
set -eu
set -o pipefail

FECHA=$(date +%Y%m%d_%H%M%S)
DESTINO=/backups
RETENCION=${RETENCION_DIAS:-14}
CIFRAR=0
if [ -n "${RESPALDO_PASSPHRASE:-}" ]; then
  CIFRAR=1
fi

echo "[respaldo] $FECHA — iniciando (cifrado: $([ "$CIFRAR" = 1 ] && echo sí || echo no))"

if [ "$CIFRAR" = 1 ] && ! command -v openssl >/dev/null 2>&1; then
  echo "[respaldo] instalando openssl para cifrar"
  if ! apk add --no-cache openssl >/dev/null 2>&1; then
    echo "[respaldo] ERROR: RESPALDO_PASSPHRASE definida pero no hay openssl; no se respalda en claro" >&2
    exit 1
  fi
fi

# Vuelca una base. Con cifrado, el volcado pasa por openssl en tubería (sin archivo en claro).
# Si algo falla se borra el archivo parcial: un .dump truncado da falsa seguridad.
volcar() {
  base="$1"
  if [ "$CIFRAR" = 1 ]; then
    archivo="$DESTINO/${base}_$FECHA.dump.enc"
    if ! pg_dump -Fc -d "$base" \
        | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:RESPALDO_PASSPHRASE -out "$archivo"; then
      rm -f "$archivo"
      echo "[respaldo] ERROR al volcar $base" >&2
      return 1
    fi
  else
    archivo="$DESTINO/${base}_$FECHA.dump"
    if ! pg_dump -Fc -d "$base" -f "$archivo"; then
      rm -f "$archivo"
      echo "[respaldo] ERROR al volcar $base" >&2
      return 1
    fi
  fi
  chmod 600 "$archivo"
}

# Base de control (metadatos + gobierno).
volcar "$BASE_CONTROL"

# Cada base de tenant (dw_*).
for BASE in $(psql -d "$BASE_CONTROL" -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'dw_%'"); do
  volcar "$BASE"
done

# Rotación (en claro y cifrados).
find "$DESTINO" \( -name '*.dump' -o -name '*.dump.enc' \) -mtime +"$RETENCION" -delete

echo "[respaldo] $FECHA — completado:"
ls -lh "$DESTINO" | tail -5
