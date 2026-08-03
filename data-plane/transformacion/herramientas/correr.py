"""Corrida MANUAL de transformación con las mismas vars que el worker.

Para el primer build de un tenant nuevo (el botón Transformar es por objeto y la primera vez
debe ser completo — ver ONBOARDING §5) y para reconstrucciones desde consola. Sustituye al
viejo /tmp/correr.sh: aquel recibía los NIT por argumento y se perdía al recrear el contenedor;
este vive en el repo (montado en /dbt/herramientas) y lee TODO de la base de control, igual
que el worker: erp, base del tenant, nits_grupo y sociedades (nombre/NIT/moneda/presentación).

Uso (desde el host):
    docker exec cresta-worker python3 /dbt/herramientas/correr.py <codigo_org> [seleccion]

    <codigo_org>  código de la organización (gobierno.organizaciones.codigo)
    [seleccion]   selección dbt; por defecto "plata oro" (build completo)
"""

from __future__ import annotations

import json
import sys

from cresta_extraccion.config import cargar_postgres
from cresta_extraccion.transformacion import (
    PROFILES_DIR,
    PROYECTO_DBT,
    _destino_organizacion,
    _escribir_profiles,
    _nits_afiliados,
    _sociedades,
)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    organizacion = sys.argv[1]
    seleccion = sys.argv[2] if len(sys.argv) > 2 else "plata oro"

    cfg = cargar_postgres()
    base_datos, erp = _destino_organizacion(cfg, organizacion)
    variables = {
        "erp": erp,
        "organizacion": organizacion,
        "nits_grupo": _nits_afiliados(cfg, organizacion),
        "sociedades": _sociedades(cfg, organizacion),
    }
    _escribir_profiles(cfg, base_datos, organizacion)
    print(f"correr · org={organizacion} · base={base_datos} · erp={erp} · "
          f"nits={len(variables['nits_grupo'])} · sociedades={len(variables['sociedades'])} · "
          f"select='{seleccion}'")

    from dbt.cli.main import dbtRunner

    resultado = dbtRunner().invoke([
        "build",
        "--select", *seleccion.split(),
        "--project-dir", PROYECTO_DBT,
        "--profiles-dir", PROFILES_DIR,
        "--target", organizacion,
        "--vars", json.dumps(variables),
    ])
    return 0 if resultado.success else 1


if __name__ == "__main__":
    raise SystemExit(main())
