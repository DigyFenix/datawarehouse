"""Validación de identificadores y del filtro libre antes de interpolarlos en SQL al ERP.

Los nombres de tabla, columna y esquema no se pueden parametrizar: viajan dentro del texto
SQL. Llegan de metadatos que se editan en el portal, así que el worker NO confía en la
validación del API y repite la allowlist aquí (defensa en profundidad, CLAUDE.md §11/§14).
Un valor que no pasa lanza `IdentificadorInvalido` con mensaje claro; nunca se "limpia" en
silencio, porque cambiaría a qué tabla/columna apunta la consulta.
"""

from __future__ import annotations

import re

_IDENTIFICADOR = re.compile(r"^[A-Za-z0-9_]+$")
_MAX_IDENTIFICADOR = 128
_MAX_FILTRO = 500

# Mismos vetos que el DTO del API (ingesta.dto.ts): separadores de sentencia, comentarios,
# procedimientos extendidos, acceso a fuentes remotas y armado de cadenas por código.
_FILTRO_VETADO = re.compile(
    r";|--|/\*|\*/|\bxp_|\bsp_|openrowset|opendatasource|char\s*\(",
    re.IGNORECASE,
)
_FILTRO_PALABRAS = re.compile(
    r"\b(select|insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|"
    r"union|into|copy|call|merge|pg_sleep|waitfor|dblink)\b",
    re.IGNORECASE,
)


class IdentificadorInvalido(ValueError):
    """Un identificador o filtro de los metadatos no es seguro para interpolar en SQL."""


def es_identificador(valor: object) -> bool:
    """True si `valor` es un identificador SQL simple (letras, dígitos, guion bajo; ≤128)."""
    return (
        isinstance(valor, str)
        and 0 < len(valor) <= _MAX_IDENTIFICADOR
        and _IDENTIFICADOR.fullmatch(valor) is not None
    )


def validar_identificador(valor: object, que: str) -> str:
    """Devuelve `valor` si es un identificador válido; si no, lanza IdentificadorInvalido.

    `que` nombra el dato en el mensaje (p.ej. "tabla de origen", "campo de fecha").
    """
    if not es_identificador(valor):
        raise IdentificadorInvalido(
            f"El {que} {valor!r} no es un identificador válido: solo letras, dígitos y "
            f"guion bajo, máximo {_MAX_IDENTIFICADOR} caracteres. Corrígelo en el portal."
        )
    return valor  # type: ignore[return-value]


def validar_identificadores(valores: list[str], que: str) -> list[str]:
    """Valida una lista de identificadores (todos o ninguno)."""
    return [validar_identificador(v, que) for v in valores]


def validar_filtro_origen(filtro: str) -> str:
    """Valida la condición libre `filtro_origen` antes de anexarla al WHERE del ERP."""
    if len(filtro) > _MAX_FILTRO:
        raise IdentificadorInvalido(
            f"El filtro de origen supera {_MAX_FILTRO} caracteres. Corrígelo en el portal."
        )
    if _FILTRO_VETADO.search(filtro) or _FILTRO_PALABRAS.search(filtro):
        raise IdentificadorInvalido(
            "El filtro de origen contiene construcciones no permitidas (separadores de "
            "sentencia, comentarios, subconsultas, procedimientos, OPENROWSET o CHAR()). "
            "Debe ser una sola condición; corrígelo en el portal."
        )
    return filtro
