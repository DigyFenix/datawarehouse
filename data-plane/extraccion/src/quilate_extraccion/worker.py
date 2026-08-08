"""Worker HTTP del plano de datos. El portal (plano de control) lo dispara para descubrir campos
(introspección), extraer a Bronce y transformar con dbt, sin tocar el origen desde el portal.
Respeta la separación de planos: el portal escribe la config; este worker lee y actúa.
No expone datos de negocio, solo metadatos y resúmenes de corrida.
"""

from __future__ import annotations

import structlog
from fastapi import FastAPI
from pydantic import BaseModel

from .config import cargar_postgres
from .extraccion import extraer_objeto
from .introspeccion import descubrir
from .transformacion import transformar_objeto

log = structlog.get_logger()
app = FastAPI(title="quilate-extraccion-worker")


class DescubrirReq(BaseModel):
    sociedad: str
    objeto: str
    tablas: list[str] | None = None


class ExtraerReq(BaseModel):
    sociedad: str
    objeto: str
    # Ventana explícita (ISO yyyy-mm-dd). Sobreescribe el lookback de la política; se usa para
    # cargas de modelado acotadas y reproducibles. `hasta` es exclusivo.
    desde: str | None = None
    hasta: str | None = None


class TransformarReq(BaseModel):
    objeto: str
    # Obligatoria: dbt corre contra la base de datos de ESA organización (aislamiento por tenant).
    organizacion: str


@app.get("/health")
def health() -> dict:
    return {"estado": "ok"}


@app.post("/descubrir")
def _descubrir(req: DescubrirReq) -> dict:
    """Introspecta el origen de la sociedad y llena metadatos.campo_ingesta del objeto."""
    cfg = cargar_postgres()
    try:
        resumen = descubrir(cfg, req.sociedad, req.objeto, req.tablas)
        return {"success": True, "data": resumen, "error": None}
    except Exception as e:  # noqa: BLE001 - se devuelve el mensaje al portal, sin filtrar secretos
        log.warning("descubrir.error", sociedad=req.sociedad, objeto=req.objeto, error=str(e))
        return {"success": False, "data": None, "error": str(e)}


@app.post("/extraer")
def _extraer(req: ExtraerReq) -> dict:
    """Extrae read-only ERP → Bronce (base del tenant) los campos incluidos del objeto."""
    cfg = cargar_postgres()
    try:
        resumen = extraer_objeto(cfg, req.sociedad, req.objeto, req.desde, req.hasta)
        return {"success": True, "data": resumen, "error": None}
    except Exception as e:  # noqa: BLE001
        log.warning("extraer.error", sociedad=req.sociedad, objeto=req.objeto, error=str(e))
        return {"success": False, "data": None, "error": str(e)}


@app.post("/transformar")
def _transformar(req: TransformarReq) -> dict:
    """Corre la transformación dbt (Bronce→Plata→Oro) gobernada por la política del objeto,
    contra la base de datos de la organización indicada."""
    cfg = cargar_postgres()
    try:
        resumen = transformar_objeto(cfg, req.objeto, req.organizacion)
        return {"success": True, "data": resumen, "error": None}
    except Exception as e:  # noqa: BLE001
        log.warning(
            "transformar.error", objeto=req.objeto, organizacion=req.organizacion, error=str(e)
        )
        return {"success": False, "data": None, "error": str(e)}
