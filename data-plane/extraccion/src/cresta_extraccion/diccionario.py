"""Diccionario base SAP B1 → canónico. Conocimiento del motor por ERP (columnas nativas
estables entre sociedades). La introspección lo usa para auto-mapear 1:1, sugerir por default
y poner descripciones en español. Los UDFs (U_*) no están aquí: se descubren en CUFD.

Estructura: { TABLA: { COLUMNA: (canonico|None, transformacion, sugerido, descripcion_es) } }
transformacion ∈ {directo, booleano_yn, signo_nc, cast_fecha, cast_numeric, region}
"""

from __future__ import annotations

DICCIONARIO: dict[str, dict[str, tuple[str | None, str, bool, str]]] = {
    # ---- OCRD: socio de negocio (cliente) ----
    "OCRD": {
        "CardCode":   ("socio_negocio_codigo", "directo", True, "Código del cliente (identificador único)"),
        "CardName":   ("nombre", "directo", True, "Razón social / nombre del cliente"),
        "LicTradNum": ("nit", "directo", True, "NIT / identificación tributaria"),
        "CardType":   (None, "directo", True, "Tipo de socio (C=cliente; se usa como filtro)"),
        "Territory":  ("region", "region", True, "Territorio / zona de ventas (candidato a región)"),
        "validFor":   ("activo", "booleano_yn", True, "Cliente activo (Y/N)"),
        "GroupCode":  (None, "directo", True, "Grupo / segmento comercial del cliente"),
        "Currency":   (None, "directo", True, "Moneda por defecto del cliente"),
        "SlpCode":    (None, "directo", True, "Vendedor asignado"),
        "PymCode":    (None, "directo", False, "Condición de pago"),
        "ListNum":    (None, "directo", False, "Lista de precios asignada"),
        "Balance":    (None, "cast_numeric", False, "Saldo actual del cliente"),
        "CreditLine": (None, "cast_numeric", False, "Límite de crédito"),
        "Phone1":     (None, "directo", False, "Teléfono principal"),
        "E_Mail":     (None, "directo", False, "Correo electrónico"),
    },
    # ---- OINV: factura de venta (cabecera) ----
    "OINV": {
        "DocEntry":   ("documento_codigo", "directo", True, "Id interno del documento"),
        "DocNum":     ("documento_numero", "directo", True, "Número visible de la factura"),
        "CardCode":   ("socio_negocio_codigo", "directo", True, "Cliente (FK OCRD)"),
        "DocDate":    ("fecha_documento", "cast_fecha", True, "Fecha contable del documento"),
        "DocDueDate": ("fecha_vencimiento", "cast_fecha", True, "Fecha de vencimiento (CxC / aging)"),
        "DocTotal":   ("total_documento", "cast_numeric", True, "Total del documento (con impuestos)"),
        "VatSum":     (None, "cast_numeric", True, "Monto de IVA del documento"),
        "DiscSum":    (None, "cast_numeric", True, "Descuento total del documento"),
        "PaidToDate": ("saldo_pagado", "cast_numeric", True, "Pagado a la fecha (para saldo CxC)"),
        "DocCur":     ("moneda", "directo", True, "Moneda del documento"),
        "DocStatus":  ("estado_documento", "directo", True, "Estado (O=abierto, C=cerrado)"),
        "CANCELED":   ("cancelado", "directo", True, "Cancelado (Y/N)"),
        "SlpCode":    ("vendedor_codigo", "directo", True, "Vendedor"),
        "TaxDate":    (None, "cast_fecha", False, "Fecha de impuestos"),
        "DocRate":    (None, "cast_numeric", False, "Tipo de cambio del documento"),
    },
    # ---- INV1: factura de venta (líneas) — grano del hecho ----
    "INV1": {
        "DocEntry":   ("documento_codigo", "directo", True, "Documento padre"),
        "LineNum":    ("linea_numero", "directo", True, "Número de línea"),
        "ItemCode":   ("item_codigo", "directo", True, "Producto (FK OITM)"),
        "Dscription": (None, "directo", True, "Descripción del ítem"),
        "Quantity":   ("cantidad", "cast_numeric", True, "Cantidad"),
        "Price":      ("precio_unitario", "cast_numeric", True, "Precio unitario (sin IVA)"),
        "LineTotal":  ("monto_linea", "cast_numeric", True, "Total de línea (neto, sin IVA)"),
        "VatSum":     (None, "cast_numeric", True, "IVA de la línea"),
        "VatPrcnt":   (None, "cast_numeric", True, "% de IVA de la línea"),
        "StockPrice": (None, "cast_numeric", True, "Costo del ítem (base para margen)"),
        "GrssProfit": (None, "cast_numeric", True, "Utilidad bruta de la línea"),
        "WhsCode":    ("sucursal_codigo", "directo", True, "Almacén / sucursal"),
        "OcrCode":    ("centro_costo_codigo", "directo", True, "Centro de costo"),
        "AcctCode":   ("cuenta_codigo", "directo", True, "Cuenta contable"),
        "PriceAfVAT": (None, "cast_numeric", False, "Precio unitario (con IVA)"),
        "GTotal":     (None, "cast_numeric", False, "Total de línea (bruto, con IVA)"),
        "DiscPrcnt":  (None, "cast_numeric", False, "% de descuento de la línea"),
        "GrossBuyPr": (None, "cast_numeric", False, "Precio de compra bruto"),
    },
}


def entrada(tabla: str, columna: str) -> tuple[str | None, str, bool, str] | None:
    """Devuelve el mapeo base (canonico, transformacion, sugerido, descripcion) o None."""
    return DICCIONARIO.get(tabla, {}).get(columna)


# Tabla nativa de origen → entidad canónica destino (capa plata).
TABLA_CANONICO: dict[str, str] = {
    "OCRD": "socio_negocio",
    "OINV": "documento_venta",
    "ORIN": "documento_venta",
    "INV1": "linea_documento_venta",
    "RIN1": "linea_documento_venta",
}


def canonico_de_tabla(tabla: str) -> str | None:
    """Entidad canónica destino de una tabla de origen (o None si no está mapeada)."""
    return TABLA_CANONICO.get(tabla)
