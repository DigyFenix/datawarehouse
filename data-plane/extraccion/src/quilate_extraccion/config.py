"""Configuración desde entorno (.env). Nunca hardcodear credenciales (CLAUDE.md §Seguridad).

El host/puerto/esquema del origen NO viven aquí: se leen del metadata-store (conexiones +
sociedades que administra el portal). Aquí solo se resuelven las credenciales (usuario/clave)
desde el .env a partir de la referencia del secreto que guarda la conexión.
"""

from __future__ import annotations

import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigPostgres(BaseSettings):
    """Destino/metadata-store (Postgres). Lee POSTGRES_* del .env."""

    model_config = SettingsConfigDict(env_prefix="POSTGRES_", env_file=".env", extra="ignore")

    host: str = "localhost"
    port: int = 5432
    db: str
    user: str
    password: str

    def dsn(self, base_datos: str | None = None) -> str:
        """DSN al Postgres del stack. Sin argumento apunta al PLANO DE CONTROL
        (metadatos + gobierno); con `base_datos` apunta a la base de un tenant
        (`dw_<codigo>`), donde viven bronce/plata/oro de esa organización."""
        db = base_datos or self.db
        return f"host={self.host} port={self.port} dbname={db} user={self.user} password={self.password}"


def cargar_postgres() -> ConfigPostgres:
    return ConfigPostgres()  # type: ignore[call-arg]


def credenciales_origen(secreto_ref: str) -> tuple[str, str]:
    """Resuelve (usuario, clave) del origen desde el .env según la referencia del secreto.

    Convención: `secreto_ref` es un prefijo → `<PREFIJO>_USER` / `<PREFIJO>_PASSWORD`.
    Es tolerante: si la referencia ya trae el sufijo `_USER` (p.ej. 'HANA_USER'), se recorta,
    de modo que tanto 'HANA' como 'HANA_USER' resuelven a HANA_USER / HANA_PASSWORD.
    """
    ref = (secreto_ref or "").strip()
    if ref.upper().endswith("_USER"):
        ref = ref[: -len("_USER")]
    if ref.upper().endswith("_PASSWORD"):
        ref = ref[: -len("_PASSWORD")]
    if not ref:
        raise ValueError("La conexión no tiene una referencia de secreto válida (secreto_ref).")

    usuario = os.environ.get(f"{ref}_USER")
    clave = os.environ.get(f"{ref}_PASSWORD")
    if not usuario or not clave:
        raise ValueError(
            f"Faltan credenciales en el entorno: {ref}_USER / {ref}_PASSWORD. "
            "Cárgalas en el .env (nunca en el repo)."
        )
    return usuario, clave
