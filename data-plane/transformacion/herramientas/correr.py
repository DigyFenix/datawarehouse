"""Corrida MANUAL de transformación con las mismas vars que el worker.

Para el primer build de un tenant nuevo (el botón Transformar es por objeto y la primera vez
debe ser completo — ver ONBOARDING §5) y para reconstrucciones desde consola. Sustituye al
viejo /tmp/correr.sh: aquel recibía los NIT por argumento y se perdía al recrear el contenedor;
este vive en el repo (montado en /dbt/herramientas) y lee TODO de la base de control, igual
que el worker: erp, base del tenant, nits_grupo y sociedades (nombre/NIT/moneda/presentación).

Uso (desde el host):
    docker exec quilate-worker python3 /dbt/herramientas/correr.py <codigo_org> [seleccion] [threads]

    <codigo_org>  código de la organización (gobierno.organizaciones.codigo)
    [seleccion]   selección dbt; sin este argumento corre el PROYECTO COMPLETO
                  (seeds + modelos + tests), que es lo que necesita un tenant nuevo
    [threads]     paralelismo; por defecto el del profiles (4)

HISTORIA de `threads`: el `FileFallocate: Interrupted system call` que obligaba a bajar a 2
hilos era el bind mount de Windows (NTFS vía WSL2) como volumen de Postgres. RESUELTO el
2026-08-07 migrando a volumen Docker nativo (infra/local/docker-compose.yml): el build
completo de Cresta pasa 185/185 con 4 hilos. El argumento se conserva por flexibilidad.
"""

from __future__ import annotations

import json
import sys

from quilate_extraccion.config import cargar_postgres
from quilate_extraccion.transformacion import (
    PROFILES_DIR,
    PROYECTO_DBT,
    _destino_organizacion,
    _escribir_profiles,
    _vars_transformacion,
)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    organizacion = sys.argv[1]
    # Sin selección = proyecto COMPLETO (seeds incluidos). Con `--select "plata oro"`
    # los seeds quedaban fuera y un tenant nuevo reventaba en dim_tiempo, que cruza
    # el calendario de feriados: la primera corrida tiene que traerlo todo.
    seleccion = sys.argv[2] if len(sys.argv) > 2 else None
    threads = sys.argv[3] if len(sys.argv) > 3 else None

    cfg = cargar_postgres()
    base_datos, erp = _destino_organizacion(cfg, organizacion)
    variables = _vars_transformacion(cfg, organizacion, erp)
    _escribir_profiles(cfg, base_datos, organizacion)
    print(f"correr · org={organizacion} · base={base_datos} · erp={erp} · "
          f"nits={len(variables['nits_grupo'])} · sociedades={len(variables['sociedades'])} · "
          f"moneda_local={variables.get('moneda_local', '(default)')} · "
          f"select='{seleccion or '(proyecto completo)'}'")

    from dbt.cli.main import dbtRunner

    argumentos = [
        "build",
        *(["--select", *seleccion.split()] if seleccion else []),
        "--project-dir", PROYECTO_DBT,
        "--profiles-dir", PROFILES_DIR,
        "--target", organizacion,
        "--vars", json.dumps(variables),
    ]
    if threads:
        argumentos += ["--threads", threads]

    resultado = dbtRunner().invoke(argumentos)
    return 0 if resultado.success else 1


if __name__ == "__main__":
    raise SystemExit(main())
