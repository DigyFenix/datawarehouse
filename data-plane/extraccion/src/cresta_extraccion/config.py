"""Configuración desde entorno (.env). Nunca hardcodear credenciales (CLAUDE.md §Seguridad)."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigPostgres(BaseSettings):
    """Destino Bronze (Postgres)."""

    model_config = SettingsConfigDict(env_prefix="POSTGRES_", env_file=".env", extra="ignore")

    host: str = "localhost"
    port: int = 5432
    db: str
    user: str
    password: str


class ConfigHana(BaseSettings):
    """Origen SAP B1 / HANA (read-only). La password real vive solo en el .env."""

    model_config = SettingsConfigDict(env_prefix="HANA_", env_file=".env", extra="ignore")

    host: str
    port: int = 30015
    user: str
    password: str
    # Schemas HANA de las sociedades a extraer (una BD por sociedad).
    schemas_piloto: str = Field(default="", alias="HANA_SCHEMAS_PILOTO")

    def lista_schemas(self) -> list[str]:
        return [s.strip() for s in self.schemas_piloto.split(",") if s.strip()]


def cargar_postgres() -> ConfigPostgres:
    return ConfigPostgres()  # type: ignore[call-arg]


def cargar_hana() -> ConfigHana:
    return ConfigHana()  # type: ignore[call-arg]
