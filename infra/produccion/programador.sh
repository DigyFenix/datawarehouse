#!/bin/sh
# =====================================================================
# Programador de la carga diaria del cliente: a cada hora de HORAS_CARGA
# (lista "HH:MM HH:MM", hora de Guatemala) corre la actualización completa
# de la organización — extracción ERP → Bronce y build a Oro — con la misma
# herramienta que se usa a mano (herramientas/actualizar.py). Si una
# extracción falla, actualizar.py NO corre el build (regla del cuadre).
#
# Debe terminar antes del refresco programado de Power BI (dejar ≥ 1 h).
# Logs: docker logs quilate-programador
# =====================================================================
set -u

: "${ORGANIZACION:?ORGANIZACION no definida}"
HORAS="${HORAS_CARGA:-05:00}"

segundos_hasta() {
  # Segundos desde ahora hasta la próxima ocurrencia de HH:MM (hoy o mañana).
  ahora=$(date +%s)
  objetivo=$(date -d "$(date +%Y-%m-%d) $1" +%s 2>/dev/null) || return 1
  [ "$objetivo" -le "$ahora" ] && objetivo=$((objetivo + 86400))
  echo $((objetivo - ahora))
}

echo "[programador] organización=$ORGANIZACION horas=\"$HORAS\" TZ=${TZ:-UTC}"
while true; do
  espera=""
  for h in $HORAS; do
    s=$(segundos_hasta "$h") || { echo "[programador] hora inválida: $h"; exit 1; }
    if [ -z "$espera" ] || [ "$s" -lt "$espera" ]; then espera=$s; fi
  done
  echo "[programador] próxima carga en $((espera / 60)) min"
  sleep "$espera"

  inicio=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[programador] $inicio — iniciando actualización de $ORGANIZACION"
  if python3 /dbt/herramientas/actualizar.py "$ORGANIZACION"; then
    echo "[programador] $(date '+%Y-%m-%d %H:%M:%S') — OK"
  else
    echo "[programador] $(date '+%Y-%m-%d %H:%M:%S') — FALLÓ (código $?). Revisar el log de arriba."
  fi
  sleep 61  # no repetir dentro del mismo minuto
done
