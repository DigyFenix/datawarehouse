"""Genera las PÁGINAS y VISUALES del reporte Power BI (report.json, formato PBIR-legacy).

El modelo semántico lo produce generar_pbip.py; esto arma lo que se ve. Se genera con código y no
a mano porque un `report.json` son miles de líneas de JSON anidado y escapado: escribirlo a mano
es garantía de error.

DECISIONES DE DISEÑO (este reporte se muestra a un cliente que está decidiendo si compra):

  - El estilo va INLINE en cada visual, no en un tema custom registrado como recurso. Un tema
    que Power BI no resuelve al abrir puede tumbar la carga del reporte, y no hay forma de
    probarlo sin Desktop. Verboso pero no puede fallar por resolución de recursos.

  - Cada visual es una TARJETA: fondo blanco, borde de 1px, esquinas redondeadas y sombra suave
    sobre un lienzo gris claro. Es lo que separa un tablero que parece terminado de uno que
    parece una prueba.

  - La página PULSO (portada) se construye en CAPAS con visuales nativos: panel blanco de fondo
    + acento de color + etiqueta + tarjeta de valor + tarjeta de variación. Da el acabado de un
    componente HTML sin depender de un custom visual de AppSource — un visual externo que no
    resuelva al abrir (o que Publish to Web no soporte) rompe la demo justo donde más duele.

  - Sin fechas quemadas: la portada abre en el trimestre en curso vía selección por defecto del
    segmentador (se recalcula al regenerar). Las tarjetas de cartera usan las medidas "hoy"
    (REMOVEFILTERS del calendario): el saldo es una foto, no un flujo del período.

  - Rejilla de 12 columnas sobre lienzo de 1280×720 con margen de 16 y separación de 12. Todo
    alineado a esa rejilla: la desalineación de unos pocos píxeles es lo que se percibe como
    "hecho a la carrera" aunque nadie sepa señalar por qué.

Uso:  python generar_reporte.py <carpeta_proyecto.Report> [nombre_empresa]
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------------------------
# Tablas del modelo (con los prefijos DM_/FC_/MD_ que aplica generar_pbip.py). Si cambia un
# prefijo o una etiqueta allá, cambia aquí: validar_reporte.py cruza ambos y falla ruidosamente.
# ---------------------------------------------------------------------------------------------
VENTAS, COMPRAS = "FC_Ventas", "FC_Compras"
CXC, CXP = "FC_Cartera por cobrar", "FC_Cartera por pagar"
VDIARIA = "FC_Venta diaria"
CAL, CLIENTE, PROVEEDOR = "DM_Calendario", "DM_Cliente", "DM_Proveedor"
PRODUCTO, VENDEDOR, EMPRESA = "DM_Producto", "DM_Vendedor", "DM_Empresa"
ANTIG, TIPODOC, CCOSTO = "DM_Antigüedad", "DM_Tipo de documento", "DM_Centro de costo"
ABC = "DM_Clasificación ABC"

# ---------------------------------------------------------------------------------------------
# Las medidas viven en la tabla del hecho que miden (no en una tabla única de métricas), así que
# el reporte necesita saber dónde está cada una. Si una medida se mueve de tabla en
# generar_pbip.py y no se actualiza aquí, el visual queda vacío sin dar error: por eso el
# generador valida al final que toda medida usada esté en este mapa.
# ---------------------------------------------------------------------------------------------
MEDIDA_EN_TABLA: dict[str, str] = {
    # Ventas
    "Ventas netas": VENTAS, "Ventas netas con IVA": VENTAS, "Ventas brutas": VENTAS,
    "Devoluciones": VENTAS, "Impuesto facturado": VENTAS, "Descuento otorgado": VENTAS,
    "% Descuento": VENTAS, "Ventas a terceros": VENTAS, "Ventas al grupo": VENTAS,
    "% Venta al grupo": VENTAS, "Unidades vendidas": VENTAS, "Líneas de venta": VENTAS,
    "Documentos de venta": VENTAS, "Clientes con venta": VENTAS, "Productos vendidos": VENTAS,
    "Ticket promedio": VENTAS, "Precio promedio unidad": VENTAS, "Costo de ventas": VENTAS,
    "Margen bruto": VENTAS, "% Margen": VENTAS, "% Margen terceros": VENTAS,
    "Ventas mes anterior": VENTAS, "Ventas año anterior": VENTAS, "Ventas acumuladas año": VENTAS,
    "Variación vs mes anterior": VENTAS, "Variación vs año anterior": VENTAS,
    "Variación acumulada vs año anterior": VENTAS, "Media móvil 3 meses": VENTAS,
    # Venta diaria (serie continua)
    "Venta diaria neta": VDIARIA, "Venta media móvil 7d": VDIARIA,
    "Venta media móvil 30d": VDIARIA,
    # Compras
    "Compras netas": COMPRAS, "Compras netas con IVA": COMPRAS, "Impuesto de compras": COMPRAS,
    "Unidades compradas": COMPRAS, "Líneas de compra": COMPRAS, "Documentos de compra": COMPRAS,
    "Proveedores con compra": COMPRAS, "Compra promedio por documento": COMPRAS,
    "Compras mes anterior": COMPRAS, "Compras acumuladas año": COMPRAS,
    # Cartera por cobrar
    "Saldo por cobrar": CXC, "Saldo por cobrar terceros": CXC, "Saldo por cobrar grupo": CXC,
    "Partidas por cobrar": CXC, "Clientes con saldo": CXC, "Saldo promedio por cliente": CXC,
    "Saldo corriente": CXC, "Saldo vencido": CXC, "Saldo vencido terceros": CXC,
    "% Vencido": CXC, "% Vencido terceros": CXC, "Vencido 1 a 30": CXC, "Vencido 31 a 60": CXC,
    "Vencido 61 a 90": CXC, "Vencido más de 90": CXC, "% Crítico más de 90": CXC,
    "Días vencido promedio": CXC, "Días de cartera terceros": CXC,
    "Por cobrar terceros hoy": CXC, "Por cobrar grupo hoy": CXC,
    "Vencido terceros hoy": CXC, "% Vencido terceros hoy": CXC,
    # Cartera por pagar
    "Saldo por pagar": CXP, "Saldo por pagar terceros": CXP, "Saldo por pagar grupo": CXP,
    "Posición neta": CXP, "Partidas por pagar": CXP, "Proveedores con saldo": CXP,
    "Por pagar vencido": CXP, "% Por pagar vencido": CXP, "Por pagar más de 90": CXP,
    "Por pagar hoy": CXP, "Posición neta hoy": CXP,
    # ABC
    "Clientes A": ABC, "Clientes B": ABC, "Clientes C": ABC, "Clientes sin venta neta": ABC,
    "Clientes clasificados": ABC, "Clientes perdidos": ABC, "% Venta en clientes A": ABC,
    "Venta del año clasificada": ABC, "Venta promedio cliente A": ABC, "Margen de clientes A": ABC,
}

# ---------------------------------------------------------------------------------------------
# Paleta. Azul = terceros / lo normal · Naranja = grupo (intercompañía) · Rojo = riesgo.
# Los grises son de un solo tono frío para que el conjunto no se vea sucio al mezclarse.
# ---------------------------------------------------------------------------------------------
AZUL = "#1F5FA9"
AZUL_CLARO = "#5B9BD5"
NARANJA = "#E07A28"
ROJO = "#C0392B"
VERDE = "#2E8B57"
TINTA = "#12181F"
TENUE = "#6B7684"
BORDE = "#E3E7EC"
LIENZO = "#F2F4F7"
BLANCO = "#FFFFFF"
MARINO = "#0E2A47"          # banda hero de la portada
MARINO_TEXTO = "#9FB3C8"    # texto secundario sobre el marino

# Rejilla: lienzo 1280×720, margen 16, separación 12 → 12 columnas de 93px
MARGEN, SEP = 16, 12
ANCHO_UTIL = 1280 - 2 * MARGEN


def col(n: int) -> int:
    """Ancho de n columnas de la rejilla de 12, incluyendo las separaciones internas."""
    return int((ANCHO_UTIL - SEP * 11) / 12 * n + SEP * (n - 1))


def x_col(n: int) -> int:
    """Coordenada x donde empieza la columna n (0-based)."""
    return MARGEN + int(((ANCHO_UTIL - SEP * 11) / 12 + SEP) * n)


def trimestre_actual() -> str:
    """Etiqueta anio_trimestre del trimestre en curso, p. ej. '2026-T3'. Se calcula al generar:
    el reporte abre siempre en el trimestre vigente sin fechas quemadas en los visuales."""
    hoy = date.today()
    return f"{hoy.year}-T{(hoy.month - 1) // 3 + 1}"


def _id() -> str:
    return uuid.uuid4().hex[:20]


def _lit(v: str) -> dict:
    return {"expr": {"Literal": {"Value": v}}}


def _color(hex_: str) -> dict:
    return {"solid": {"color": _lit(f"'{hex_}'")}}


def _campo(tabla: str, campo: str, es_medida: bool, alias: str) -> dict:
    """Un elemento del Select del prototypeQuery."""
    ref = {"Expression": {"SourceRef": {"Source": alias}}, "Property": campo}
    return ({"Measure": ref, "Name": f"{tabla}.{campo}"} if es_medida
            else {"Column": ref, "Name": f"{tabla}.{campo}"})


def _from(entidades: list[tuple[str, str]]) -> list[dict]:
    return [{"Name": a, "Entity": e, "Type": 0} for e, a in entidades]


def tabla_de(medida: str) -> str:
    """Tabla donde vive la medida. Falla ruidosamente: un queryRef a una tabla equivocada deja
    el visual en blanco sin ningún mensaje, y eso se descubre delante del cliente."""
    if medida not in MEDIDA_EN_TABLA:
        raise KeyError(
            f"La medida '{medida}' no está en MEDIDA_EN_TABLA. Si la agregaste en "
            f"generar_pbip.py, regístrala aquí con su tabla.")
    return MEDIDA_EN_TABLA[medida]


# ---------------------------------------------------------------------------------------------
# Estilo de contenedor: lo que convierte cada visual en una tarjeta.
# ---------------------------------------------------------------------------------------------
def _tarjeta_vc(titulo: str | None, subtitulo: str | None = None,
                con_fondo: bool = True) -> dict:
    vc: dict = {}
    if titulo is not None:
        props = {
            "text": _lit(f"'{titulo}'"),
            "fontColor": _color(TINTA),
            "fontSize": _lit("11D"),
            "bold": _lit("true"),
            "titleWrap": _lit("false"),
            "alignment": _lit("'left'"),
        }
        vc["title"] = [{"properties": props}]
        if subtitulo:
            vc["subTitle"] = [{"properties": {
                "text": _lit(f"'{subtitulo}'"),
                "fontColor": _color(TENUE),
                "fontSize": _lit("9D"),
                "titleWrap": _lit("false"),
            }}]
    if con_fondo:
        vc["background"] = [{"properties": {
            "color": _color(BLANCO),
            "transparency": _lit("0D"),
            "show": _lit("true"),
        }}]
        vc["border"] = [{"properties": {
            "color": _color(BORDE),
            "radius": _lit("8D"),
            "show": _lit("true"),
        }}]
        vc["dropShadow"] = [{"properties": {
            "show": _lit("true"),
            "color": _color("#0B1B2B"),
            "position": _lit("'Outer'"),
            "preset": _lit("'BottomRight'"),
            "shadowSpread": _lit("2D"),
            "transparency": _lit("92D"),
        }}]
        # El encabezado de acciones (foco, filtros) solo estorba en una presentación.
        vc["visualHeader"] = [{"properties": {"show": _lit("false")}}]
    return vc


def visual(tipo: str, x: int, y: int, w: int, h: int, proyecciones: dict,
           select: list, desde: list, titulo: str | None = None,
           subtitulo: str | None = None, objetos: dict | None = None,
           orden: list | None = None, con_fondo: bool = True,
           filtros: str | None = None, z: int = 0) -> dict:
    """Un visualContainer. `config` va como JSON escapado dentro del JSON — así lo espera Power BI."""
    single = {
        "visualType": tipo,
        "projections": proyecciones,
        "prototypeQuery": {"Version": 2, "From": desde, "Select": select},
        "drillFilterOtherVisuals": True,
    }
    if orden:
        single["prototypeQuery"]["OrderBy"] = orden
    if objetos:
        single["objects"] = objetos
    vc = _tarjeta_vc(titulo, subtitulo, con_fondo)
    if vc:
        single["vcObjects"] = vc
    cfg = {
        "name": _id(),
        "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": w, "height": h}}],
        "singleVisual": single,
    }
    contenedor = {"x": x, "y": y, "z": z, "width": w, "height": h,
                  "config": json.dumps(cfg, ensure_ascii=False)}
    if filtros:
        contenedor["filters"] = filtros
    return contenedor


# ---------------------------------------------------------------------------------------------
# Piezas de presentación
# ---------------------------------------------------------------------------------------------
def banda(x: int, y: int, w: int, h: int, color: str = AZUL, z: int = 0,
          redondeo: int = 6, sombra: bool = False, borde: str | None = None) -> dict:
    """Rectángulo de color. Da estructura (hero, paneles, acentos) sin depender de una imagen."""
    objetos: dict = {
        "shape": [{"properties": {"tileShape": _lit("'rectangle'"),
                                  "roundEdge": _lit(f"{redondeo}D")}}],
        "fill": [{"properties": {"show": _lit("true"),
                                 "fillColor": _color(color),
                                 "transparency": _lit("0D")}}],
        "outline": [{"properties": {"show": _lit("false")}}],
    }
    if borde:
        objetos["outline"] = [{"properties": {
            "show": _lit("true"), "lineColor": _color(borde), "weight": _lit("1D")}}]
    single: dict = {"visualType": "shape", "objects": objetos,
                    "drillFilterOtherVisuals": True}
    if sombra:
        single["vcObjects"] = {"dropShadow": [{"properties": {
            "show": _lit("true"), "color": _color("#0B1B2B"),
            "position": _lit("'Outer'"), "preset": _lit("'BottomRight'"),
            "shadowSpread": _lit("2D"), "transparency": _lit("92D"),
        }}]}
    cfg = {
        "name": _id(),
        "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": w, "height": h}}],
        "singleVisual": single,
    }
    return {"x": x, "y": y, "z": z, "width": w, "height": h,
            "config": json.dumps(cfg, ensure_ascii=False)}


def panel(x: int, y: int, w: int, h: int) -> dict:
    """Panel blanco redondeado con sombra: el lienzo de una tarjeta compuesta (KPI en capas)."""
    return banda(x, y, w, h, BLANCO, z=0, redondeo=8, sombra=True, borde=BORDE)


def texto(x: int, y: int, w: int, h: int, partes: list[dict],
          fondo: str | None = None, z: int = 0) -> dict:
    """Cuadro de texto. `partes` = [{'t': 'texto', 'size': 20, 'bold': True, 'color': '#...'}]"""
    runs = []
    for p in partes:
        runs.append({
            "value": p["t"],
            "textStyle": {
                "fontSize": f"{p.get('size', 12)}pt",
                "color": p.get("color", TINTA),
                "fontWeight": "bold" if p.get("bold") else "normal",
                "fontFamily": "Segoe UI",
            },
        })
    single: dict = {
        "visualType": "textbox",
        "objects": {"general": [{"properties": {"paragraphs": [{"textRuns": runs}]}}]},
        "drillFilterOtherVisuals": True,
    }
    if fondo:
        single["vcObjects"] = {
            "background": [{"properties": {"color": _color(fondo), "show": _lit("true"),
                                           "transparency": _lit("0D")}}],
            "visualHeader": [{"properties": {"show": _lit("false")}}],
        }
    cfg = {
        "name": _id(),
        "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": w, "height": h}}],
        "singleVisual": single,
    }
    return {"x": x, "y": y, "z": z, "width": w, "height": h,
            "config": json.dumps(cfg, ensure_ascii=False)}


def kpi(x: int, y: int, w: int, h: int, medida: str, etiqueta: str,
        color_valor: str = TINTA, tamano: int = 24) -> dict:
    """Tarjeta de indicador simple: valor grande, etiqueta arriba en gris."""
    t = tabla_de(medida)
    return visual(
        "card", x, y, w, h,
        {"Values": [{"queryRef": f"{t}.{medida}"}]},
        [_campo(t, medida, True, "m")],
        _from([(t, "m")]),
        titulo=etiqueta,
        objetos={
            "labels": [{"properties": {
                "fontSize": _lit(f"{tamano}D"),
                "color": _color(color_valor),
                "bold": _lit("true"),
                "fontFamily": _lit("'Segoe UI'"),
            }}],
            "categoryLabels": [{"properties": {"show": _lit("false")}}],
            "wordWrap": [{"properties": {"show": _lit("false")}}],
        },
    )


def _card_pelado(x: int, y: int, w: int, h: int, medida: str, tamano: int,
                 color_valor: str, z: int = 2) -> dict:
    """Tarjeta de valor SIN fondo ni título: se apoya sobre un panel() para componer en capas."""
    t = tabla_de(medida)
    return visual(
        "card", x, y, w, h,
        {"Values": [{"queryRef": f"{t}.{medida}"}]},
        [_campo(t, medida, True, "m")],
        _from([(t, "m")]),
        con_fondo=False, z=z,
        objetos={
            "labels": [{"properties": {
                "fontSize": _lit(f"{tamano}D"),
                "color": _color(color_valor),
                "bold": _lit("true"),
                "fontFamily": _lit("'Segoe UI'"),
            }}],
            "categoryLabels": [{"properties": {"show": _lit("false")}}],
            "wordWrap": [{"properties": {"show": _lit("false")}}],
        },
    )


def kpi_compuesto(x: int, y: int, w: int, h: int, medida: str, etiqueta: str,
                  delta: str, nota: str, acento: str,
                  color_valor: str = TINTA, color_delta: str = TENUE) -> list[dict]:
    """Indicador de portada en capas: panel blanco + barra de acento + etiqueta + valor grande +
    variación con su nota. Es el acabado "componente HTML" hecho con visuales nativos: no
    depende de custom visuals (que Publish to Web puede no resolver) y no puede fallar al abrir.
    """
    return [
        panel(x, y, w, h),
        banda(x, y + 12, 4, h - 24, acento, z=1, redondeo=2),
        texto(x + 16, y + 10, w - 30, 18,
              [{"t": etiqueta, "size": 8, "bold": True, "color": TENUE}], z=2),
        _card_pelado(x + 10, y + 28, w - 20, 54, medida, 22, color_valor),
        _card_pelado(x + 10, y + 82, 96, 28, delta, 10, color_delta),
        texto(x + 110, y + 87, w - 120, 18,
              [{"t": nota, "size": 8, "color": TENUE}], z=2),
    ]


def _dp_color(color: str) -> dict:
    return {"dataPoint": [{"properties": {"fill": _color(color)}}]}


def _ejes_limpios(mostrar_valores: bool = True) -> dict:
    """Ejes discretos y etiquetas de dato: menos tinta, más lectura."""
    return {
        "categoryAxis": [{"properties": {
            "show": _lit("true"), "showAxisTitle": _lit("false"),
            "fontSize": _lit("9D"), "labelColor": _color(TENUE),
            "gridlineShow": _lit("false"),
        }}],
        "valueAxis": [{"properties": {
            "show": _lit("false"), "showAxisTitle": _lit("false"),
            "gridlineShow": _lit("false"),
        }}],
        "labels": [{"properties": {
            "show": _lit("true" if mostrar_valores else "false"),
            "fontSize": _lit("9D"), "color": _color(TENUE),
            "labelDisplayUnits": _lit("0D"),
        }}],
        "legend": [{"properties": {"show": _lit("false")}}],
    }


def barras(x: int, y: int, w: int, h: int, medida: str, tabla_cat: str, campo_cat: str,
           titulo: str, subtitulo: str | None = None, color: str = AZUL,
           horizontal: bool = True, top: int | None = None) -> dict:
    """Ranking. Horizontal por defecto: los nombres de cliente/producto son largos y en
    vertical se cortan o se giran, que es la marca visual de un tablero descuidado."""
    tipo = "barChart" if horizontal else "columnChart"
    t = tabla_de(medida)
    objetos = {**_dp_color(color), **_ejes_limpios()}
    filtros = None
    if top:
        # Top-N por la medida: sin esto un eje con 800 clientes no comunica nada.
        filtros = json.dumps([{
            "name": _id(),
            "expression": {"Column": {
                "Expression": {"SourceRef": {"Entity": tabla_cat}}, "Property": campo_cat}},
            "filter": {
                "Version": 2,
                "From": [{"Name": "f", "Entity": tabla_cat, "Type": 0},
                         {"Name": "fm", "Entity": t, "Type": 0}],
                "Where": [{"Condition": {"TopN": {
                    "Expression": {"Column": {
                        "Expression": {"SourceRef": {"Source": "f"}}, "Property": campo_cat}},
                    "OrderBy": [{"Direction": 2, "Expression": {"Measure": {
                        "Expression": {"SourceRef": {"Source": "fm"}}, "Property": medida}}}],
                    "Top": top}}}],
            },
            "type": "TopN",
            "howCreated": 0,
        }], ensure_ascii=False)
    return visual(
        tipo, x, y, w, h,
        {"Category": [{"queryRef": f"{tabla_cat}.{campo_cat}"}],
         "Y": [{"queryRef": f"{t}.{medida}"}]},
        [_campo(tabla_cat, campo_cat, False, "d"), _campo(t, medida, True, "m")],
        _from([(tabla_cat, "d"), (t, "m")]),
        titulo=titulo, subtitulo=subtitulo, objetos=objetos,
        orden=[{"Direction": 2, "Expression": {"Measure": {
            "Expression": {"SourceRef": {"Source": "m"}}, "Property": medida}}}],
        filtros=filtros,
    )


def columnas_multi(x: int, y: int, w: int, h: int, medidas: list[str], tabla_cat: str,
                   campo_cat: str, titulo: str, subtitulo: str | None = None,
                   colores: list[str] | None = None) -> dict:
    """Columnas agrupadas con varias medidas: el visual del contraste (terceros vs grupo)."""
    colores = colores or [AZUL, NARANJA]
    alias, desde, select, valores = {}, [(tabla_cat, "d")], [], []
    select.append(_campo(tabla_cat, campo_cat, False, "d"))
    for i, med in enumerate(medidas):
        t = tabla_de(med)
        if t not in alias:
            alias[t] = f"m{i}"
            desde.append((t, alias[t]))
        select.append(_campo(t, med, True, alias[t]))
        valores.append({"queryRef": f"{t}.{med}"})
    objetos = {
        **_ejes_limpios(),
        "dataPoint": [{"properties": {"fill": _color(colores[i % len(colores)])},
                       "selector": {"metadata": f"{tabla_de(m)}.{m}"}}
                      for i, m in enumerate(medidas)],
        "legend": [{"properties": {
            "show": _lit("true"), "position": _lit("'Top'"), "showTitle": _lit("false"),
            "fontSize": _lit("9D"), "labelColor": _color(TENUE),
        }}],
    }
    return visual(
        "clusteredColumnChart", x, y, w, h,
        {"Category": [{"queryRef": f"{tabla_cat}.{campo_cat}"}], "Y": valores},
        select, _from(desde),
        titulo=titulo, subtitulo=subtitulo, objetos=objetos,
    )


def linea_area(x: int, y: int, w: int, h: int, medidas: list[str], campo_tiempo: str,
               titulo: str, subtitulo: str | None = None,
               colores: list[str] | None = None, area: bool = True) -> dict:
    """Serie temporal. Área para una sola medida (da peso al volumen), líneas para comparar."""
    colores = colores or [AZUL, NARANJA, ROJO]
    tipo = "areaChart" if (area and len(medidas) == 1) else "lineChart"
    alias, desde, select, valores = {}, [(CAL, "t0")], [], []
    select.append(_campo(CAL, campo_tiempo, False, "t0"))
    for i, med in enumerate(medidas):
        t = tabla_de(med)
        if t not in alias:
            alias[t] = f"m{i}"
            desde.append((t, alias[t]))
        select.append(_campo(t, med, True, alias[t]))
        valores.append({"queryRef": f"{t}.{med}"})
    objetos = {
        **_ejes_limpios(mostrar_valores=False),
        "dataPoint": [{"properties": {"fill": _color(colores[i % len(colores)])},
                       "selector": {"metadata": f"{tabla_de(m)}.{m}"}}
                      for i, m in enumerate(medidas)],
        "legend": [{"properties": {
            "show": _lit("true" if len(medidas) > 1 else "false"),
            "position": _lit("'Top'"), "showTitle": _lit("false"),
            "fontSize": _lit("9D"), "labelColor": _color(TENUE),
        }}],
        "lineStyles": [{"properties": {"strokeWidth": _lit("2D"),
                                       "showMarker": _lit("false")}}],
    }
    return visual(
        tipo, x, y, w, h,
        {"Category": [{"queryRef": f"{CAL}.{campo_tiempo}"}], "Y": valores},
        select, _from(desde),
        titulo=titulo, subtitulo=subtitulo, objetos=objetos,
        orden=[{"Direction": 1, "Expression": {"Column": {
            "Expression": {"SourceRef": {"Source": "t0"}}, "Property": campo_tiempo}}}],
    )


def dona(x: int, y: int, w: int, h: int, medida: str, tabla_cat: str, campo_cat: str,
         titulo: str, subtitulo: str | None = None,
         colores: list[str] | None = None) -> dict:
    """Composición de pocas categorías (3-6). Con más, un ranking se lee mejor."""
    t = tabla_de(medida)
    objetos = {
        "legend": [{"properties": {"show": _lit("true"), "position": _lit("'Right'"),
                                   "showTitle": _lit("false"), "fontSize": _lit("9D"),
                                   "labelColor": _color(TENUE)}}],
        "labels": [{"properties": {"show": _lit("true"), "fontSize": _lit("9D"),
                                   "labelStyle": _lit("'Category, percent of total'")}}],
        "slices": [{"properties": {"innerRadiusRatio": _lit("60D")}}],
    }
    if colores:
        objetos["dataPoint"] = [{"properties": {"fill": _color(c)}} for c in colores]
    return visual(
        "donutChart", x, y, w, h,
        {"Category": [{"queryRef": f"{tabla_cat}.{campo_cat}"}],
         "Y": [{"queryRef": f"{t}.{medida}"}]},
        [_campo(tabla_cat, campo_cat, False, "d"), _campo(t, medida, True, "m")],
        _from([(tabla_cat, "d"), (t, "m")]),
        titulo=titulo, subtitulo=subtitulo, objetos=objetos,
    )


def dona_medidas(x: int, y: int, w: int, h: int, medidas: list[str], titulo: str,
                 subtitulo: str | None = None, colores: list[str] | None = None) -> dict:
    """Dona cuyas porciones son MEDIDAS (sin categoría): p. ej. venta a terceros vs al grupo."""
    colores = colores or [AZUL, NARANJA]
    alias, desde, select, valores = {}, [], [], []
    for i, med in enumerate(medidas):
        t = tabla_de(med)
        if t not in alias:
            alias[t] = f"m{i}"
            desde.append((t, alias[t]))
        select.append(_campo(t, med, True, alias[t]))
        valores.append({"queryRef": f"{t}.{med}"})
    objetos = {
        "legend": [{"properties": {"show": _lit("true"), "position": _lit("'Bottom'"),
                                   "showTitle": _lit("false"), "fontSize": _lit("9D"),
                                   "labelColor": _color(TENUE)}}],
        "labels": [{"properties": {"show": _lit("true"), "fontSize": _lit("9D"),
                                   "labelStyle": _lit("'Percent of total'")}}],
        "slices": [{"properties": {"innerRadiusRatio": _lit("60D")}}],
        "dataPoint": [{"properties": {"fill": _color(colores[i % len(colores)])},
                       "selector": {"metadata": f"{tabla_de(m)}.{m}"}}
                      for i, m in enumerate(medidas)],
    }
    return visual(
        "donutChart", x, y, w, h,
        {"Y": valores}, select, _from(desde),
        titulo=titulo, subtitulo=subtitulo, objetos=objetos,
    )


def matriz(x: int, y: int, w: int, h: int, filas: list[tuple[str, str]],
           medidas: list[str], titulo: str, subtitulo: str | None = None,
           top: int | None = None, orden_por: str | None = None) -> dict:
    """Tabla de detalle. Se usa `tableEx` con filas alternas y valores alineados."""
    alias, desde, select, valores = {}, [], [], []
    for i, (tab, campo) in enumerate(filas):
        a = f"d{i}"
        desde.append((tab, a))
        select.append(_campo(tab, campo, False, a))
        valores.append({"queryRef": f"{tab}.{campo}"})
    for i, med in enumerate(medidas):
        t = tabla_de(med)
        if t not in alias:
            alias[t] = f"m{i}"
            desde.append((t, alias[t]))
        select.append(_campo(t, med, True, alias[t]))
        valores.append({"queryRef": f"{t}.{med}"})

    med_orden = orden_por or (medidas[0] if medidas else None)
    orden = None
    if med_orden:
        orden = [{"Direction": 2, "Expression": {"Measure": {
            "Expression": {"SourceRef": {"Source": alias[tabla_de(med_orden)]}},
            "Property": med_orden}}}]

    filtros = None
    if top and filas:
        tab0, campo0 = filas[0]
        t0 = tabla_de(med_orden)
        filtros = json.dumps([{
            "name": _id(),
            "expression": {"Column": {
                "Expression": {"SourceRef": {"Entity": tab0}}, "Property": campo0}},
            "filter": {
                "Version": 2,
                "From": [{"Name": "f", "Entity": tab0, "Type": 0},
                         {"Name": "fm", "Entity": t0, "Type": 0}],
                "Where": [{"Condition": {"TopN": {
                    "Expression": {"Column": {
                        "Expression": {"SourceRef": {"Source": "f"}}, "Property": campo0}},
                    "OrderBy": [{"Direction": 2, "Expression": {"Measure": {
                        "Expression": {"SourceRef": {"Source": "fm"}},
                        "Property": med_orden}}}],
                    "Top": top}}}],
            },
            "type": "TopN",
            "howCreated": 0,
        }], ensure_ascii=False)

    objetos = {
        "grid": [{"properties": {
            "gridVertical": _lit("false"), "gridHorizontal": _lit("true"),
            "gridHorizontalColor": _color(BORDE), "rowPadding": _lit("4D"),
            "outlineColor": _color(BORDE), "outlineWeight": _lit("1D"),
        }}],
        "columnHeaders": [{"properties": {
            "fontColor": _color(TENUE), "backColor": _color("#F8FAFC"),
            "fontSize": _lit("9D"), "bold": _lit("true"), "wordWrap": _lit("false"),
        }}],
        "values": [{"properties": {
            "fontSize": _lit("9D"), "fontColor": _color(TINTA),
            "backColorPrimary": _color(BLANCO), "backColorSecondary": _color("#FBFCFD"),
            "urlIcon": _lit("false"),
        }}],
        "total": [{"properties": {"totals": _lit("true"), "fontColor": _color(TINTA),
                                  "backColor": _color("#F8FAFC"), "bold": _lit("true")}}],
    }
    return visual(
        "tableEx", x, y, w, h,
        {"Values": valores}, select, _from(desde),
        titulo=titulo, subtitulo=subtitulo, objetos=objetos, orden=orden, filtros=filtros,
    )


def treemap(x: int, y: int, w: int, h: int, medida: str, tabla_cat: str, campo_cat: str,
            titulo: str, subtitulo: str | None = None) -> dict:
    t = tabla_de(medida)
    return visual(
        "treemap", x, y, w, h,
        {"Group": [{"queryRef": f"{tabla_cat}.{campo_cat}"}],
         "Values": [{"queryRef": f"{t}.{medida}"}]},
        [_campo(tabla_cat, campo_cat, False, "d"), _campo(t, medida, True, "m")],
        _from([(tabla_cat, "d"), (t, "m")]),
        titulo=titulo, subtitulo=subtitulo,
        objetos={
            "legend": [{"properties": {"show": _lit("false")}}],
            "labels": [{"properties": {"show": _lit("true"), "fontSize": _lit("9D")}}],
            "dataPoint": [{"properties": {"fillRule": {"linearGradient2": {
                "min": {"color": _color(AZUL_CLARO)}, "max": {"color": _color(AZUL)}}}}}],
        },
    )


def filtro(x: int, y: int, w: int, h: int, tabla: str, campo: str, titulo: str,
           modo_lista: bool = False, defecto: str | None = None, z: int = 0) -> dict:
    """Segmentador. `defecto` preselecciona un valor (p. ej. el trimestre en curso): el estado
    del slicer se guarda en objects.general.filter, que es donde Desktop persiste la selección."""
    objetos: dict = {
        "general": [{"properties": {
            "outlineColor": _color(BORDE), "outlineWeight": _lit("1D"),
        }}],
        "items": [{"properties": {"fontColor": _color(TINTA), "fontSize": _lit("9D")}}],
        "header": [{"properties": {"show": _lit("false")}}],
    }
    if not modo_lista:
        objetos["data"] = [{"properties": {"mode": _lit("'Dropdown'")}}]
    if defecto:
        objetos["general"][0]["properties"]["filter"] = {"filter": {
            "Version": 2,
            "From": [{"Name": "s", "Entity": tabla, "Type": 0}],
            "Where": [{"Condition": {"In": {
                "Expressions": [{"Column": {
                    "Expression": {"SourceRef": {"Source": "s"}}, "Property": campo}}],
                "Values": [[{"Literal": {"Value": f"'{defecto}'"}}]],
            }}}],
        }}
    return visual(
        "slicer", x, y, w, h,
        {"Values": [{"queryRef": f"{tabla}.{campo}"}]},
        [_campo(tabla, campo, False, "d")],
        _from([(tabla, "d")]),
        titulo=titulo, objetos=objetos, z=z,
    )


def encabezado(titulo: str, subtitulo: str, empresa: str) -> list[dict]:
    """Banda superior común a las páginas interiores: da identidad y evita el look de borrador.

    El bloque de la derecha (x_col(9) en adelante) queda LIBRE para el filtro de la página, que
    cada página coloca en y=14 con 30 de alto. La nota de certificación va debajo, en y=48, para
    que nada se superponga con la fila de indicadores que arranca en y=72.
    """
    return [
        banda(0, 0, 1280, 4, AZUL),
        texto(MARGEN, 12, 700, 28,
              [{"t": titulo, "size": 17, "bold": True},
               {"t": f"   ·   {empresa}", "size": 11, "color": TENUE}]),
        texto(MARGEN, 40, 790, 26, [{"t": subtitulo, "size": 9, "color": TENUE}]),
        texto(x_col(9), 48, col(3), 18,
              [{"t": "Cifras cuadradas contra el ERP", "size": 8, "color": TENUE}]),
    ]


def pagina(nombre: str, titulo: str, orden: int, visuales: list[dict]) -> dict:
    return {
        "config": json.dumps({"objects": {"background": [{"properties": {
            "color": _color(LIENZO),
            "transparency": _lit("0D")}}]}}, ensure_ascii=False),
        "displayName": titulo,
        "displayOption": 1,
        "filters": "[]",
        "height": 720.0,
        "width": 1280.0,
        "name": nombre,
        "ordinal": orden,
        "visualContainers": visuales,
    }


# ---------------------------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------------------------
def pagina_pulso(empresa: str) -> list[dict]:
    """La portada. Un solo mensaje: así va el negocio este trimestre, y la cartera real se lee
    separando al grupo. Abre en el trimestre en curso; los saldos de cartera son la foto de HOY
    (medidas con REMOVEFILTERS), porque un saldo recortado al trimestre ocultaría la mora vieja.
    """
    trimestre = trimestre_actual()

    # --- hero: banda marina con título y los dos segmentadores de la página ---
    hero = [
        banda(0, 0, 1280, 96, MARINO, redondeo=0),
        banda(0, 96, 1280, 3, NARANJA, redondeo=0),
        texto(24, 14, 640, 34,
              [{"t": "Pulso ejecutivo", "size": 18, "bold": True, "color": BLANCO},
               {"t": f"   ·   {empresa}", "size": 11, "color": MARINO_TEXTO}], z=1),
        texto(24, 52, 700, 24,
              [{"t": "Venta, rentabilidad y caja del trimestre en curso · la cartera es la "
                     "foto de hoy · cifras cuadradas contra el ERP",
                "size": 9, "color": MARINO_TEXTO}], z=1),
        filtro(x_col(8), 22, col(2), 52, CAL, "anio_trimestre", "Trimestre",
               defecto=trimestre, z=2),
        filtro(x_col(10), 22, col(2), 52, EMPRESA, "nombre", "Empresa", z=2),
    ]

    # --- fila de indicadores compuestos: 5 tarjetas de 240px ---
    y_kpi, h_kpi = 112, 118
    w5 = int((ANCHO_UTIL - 4 * SEP) / 5)          # 240
    x5 = [MARGEN + i * (w5 + SEP) for i in range(5)]
    tarjetas = [
        *kpi_compuesto(x5[0], y_kpi, w5, h_kpi, "Ventas netas", "VENTA NETA DEL TRIMESTRE",
                       "Variación vs año anterior", "vs año anterior", AZUL),
        *kpi_compuesto(x5[1], y_kpi, w5, h_kpi, "Ventas acumuladas año", "ACUMULADO DEL AÑO",
                       "Variación acumulada vs año anterior", "vs año anterior, mismo corte",
                       AZUL_CLARO),
        *kpi_compuesto(x5[2], y_kpi, w5, h_kpi, "% Margen terceros", "MARGEN DE TERCEROS",
                       "Margen bruto", "margen bruto total", VERDE, color_valor=VERDE),
        *kpi_compuesto(x5[3], y_kpi, w5, h_kpi, "Por cobrar terceros hoy",
                       "POR COBRAR A TERCEROS · HOY",
                       "% Vencido terceros hoy", "ya vencido", NARANJA,
                       color_delta=ROJO),
        *kpi_compuesto(x5[4], y_kpi, w5, h_kpi, "Posición neta hoy", "POSICIÓN NETA · HOY",
                       "Por pagar hoy", "por pagar hoy", VERDE, color_valor=TINTA,
                       color_delta=NARANJA),
    ]

    # --- fila central: el visual que vende (cartera partida) + el ritmo diario ---
    y2, h2 = 242, 224
    centro = [
        columnas_multi(x_col(0), y2, col(7), h2,
                       ["Por cobrar terceros hoy", "Por cobrar grupo hoy"],
                       ANTIG, "rango_aging_nombre",
                       "¿Quién debe la cartera?",
                       "saldo de hoy por antigüedad · azul: clientes reales · naranja: "
                       "empresas del propio grupo",
                       colores=[AZUL, NARANJA]),
        linea_area(x_col(7), y2, col(5), h2,
                   ["Venta diaria neta", "Venta media móvil 30d"], "fecha",
                   "El ritmo del trimestre",
                   "venta por día y su media de 30 días",
                   colores=[AZUL_CLARO, AZUL], area=False),
    ]

    # --- fila inferior: a quién se vende, quién mueve el trimestre y cómo va cada sociedad ---
    y3, h3 = 478, 226
    base = [
        dona_medidas(x_col(0), y3, col(4), h3, ["Ventas a terceros", "Ventas al grupo"],
                     "¿A quién le vendemos?", "terceros vs empresas del grupo",
                     colores=[AZUL, NARANJA]),
        barras(x_col(4), y3, col(4), h3, "Ventas a terceros", CLIENTE, "nombre",
               "Los clientes del trimestre", "venta a terceros · los 7 mayores",
               AZUL, top=7),
        matriz(x_col(8), y3, col(4), h3,
               [(EMPRESA, "nombre")],
               ["Ventas netas", "% Margen", "Por cobrar terceros hoy"],
               "Las empresas del grupo", "venta, margen y cartera por sociedad"),
    ]
    return [*hero, *tarjetas, *centro, *base]


def pagina_ventas(empresa: str) -> list[dict]:
    y_kpi, h_kpi = 72, 92
    y2, h2 = y_kpi + h_kpi + SEP, 236
    y3 = y2 + h2 + SEP
    h3 = 720 - y3 - MARGEN
    return [
        *encabezado("Ventas y rentabilidad",
                    "El margen del grupo no es margen de mercado: la venta intercompañía no "
                    "compite por precio y se separa en todos los indicadores.", empresa),
        filtro(x_col(9), 14, col(3), 30, CAL, "anio_mes", "Período"),

        kpi(x_col(0), y_kpi, col(2), h_kpi, "Ventas a terceros", "A TERCEROS", AZUL, 20),
        kpi(x_col(2), y_kpi, col(2), h_kpi, "Ventas al grupo", "AL GRUPO", NARANJA, 20),
        kpi(x_col(4), y_kpi, col(2), h_kpi, "% Margen terceros", "% MARGEN TERCEROS", VERDE, 20),
        kpi(x_col(6), y_kpi, col(2), h_kpi, "Ticket promedio", "TICKET PROMEDIO", TINTA, 20),
        kpi(x_col(8), y_kpi, col(2), h_kpi, "Documentos de venta", "FACTURAS", TINTA, 20),
        kpi(x_col(10), y_kpi, col(2), h_kpi, "Clientes con venta", "CLIENTES ACTIVOS", TINTA, 20),

        linea_area(x_col(0), y2, col(8), h2,
                   ["Ventas netas", "Media móvil 3 meses"], "anio_mes",
                   "Venta mensual y media móvil",
                   "la media alisa el diente de sierra de la facturación",
                   colores=[AZUL, NARANJA], area=False),
        barras(x_col(8), y2, col(4), h2, "Ventas netas", CAL, "dia_semana_nombre",
               "Venta por día de semana", None, NARANJA, horizontal=True),

        treemap(x_col(0), y3, col(5), h3, "Ventas netas", PRODUCTO, "nombre",
                "Peso de cada producto", "tamaño = venta neta"),
        matriz(x_col(5), y3, col(7), h3,
               [(VENDEDOR, "nombre")],
               ["Ventas netas", "Margen bruto", "% Margen", "Documentos de venta"],
               "Desempeño por vendedor", "ordenado por venta neta", top=12),
    ]


def pagina_clientes(empresa: str) -> list[dict]:
    """Catálogo ABC: la página que convierte el tablero en una herramienta comercial."""
    y_kpi, h_kpi = 72, 92
    y2, h2 = y_kpi + h_kpi + SEP, 240
    y3 = y2 + h2 + SEP
    h3 = 720 - y3 - MARGEN
    return [
        *encabezado("Clientes · clasificación ABC",
                    "Pareto sobre la venta a terceros del año: A concentra el 80% de la venta, "
                    "B hasta el 95%, C el resto. Calculado en el warehouse, no en el reporte.",
                    empresa),
        filtro(x_col(9), 14, col(3), 30, ABC, "clase_abc_anio_nombre", "Clase"),

        kpi(x_col(0), y_kpi, col(2), h_kpi, "Clientes A", "CLIENTES A", AZUL, 20),
        kpi(x_col(2), y_kpi, col(2), h_kpi, "Clientes B", "CLIENTES B", AZUL_CLARO, 20),
        kpi(x_col(4), y_kpi, col(2), h_kpi, "Clientes C", "CLIENTES C", TENUE, 20),
        kpi(x_col(6), y_kpi, col(2), h_kpi, "% Venta en clientes A",
            "% VENTA EN CLASE A", NARANJA, 20),
        kpi(x_col(8), y_kpi, col(2), h_kpi, "Venta promedio cliente A",
            "VENTA MEDIA CLASE A", TINTA, 20),
        kpi(x_col(10), y_kpi, col(2), h_kpi, "Clientes perdidos", "PERDIDOS EN EL AÑO", ROJO, 20),

        dona(x_col(0), y2, col(4), h2, "Venta del año clasificada", ABC,
             "clase_abc_anio_nombre", "Venta por clase",
             "concentración de la cartera", colores=[AZUL, AZUL_CLARO, TENUE, ROJO]),
        barras(x_col(4), y2, col(8), h2, "Ventas netas", CLIENTE, "nombre",
               "Los 15 clientes que hacen el negocio", "venta neta del período", AZUL, top=15),

        matriz(x_col(0), y3, col(12), h3,
               [(ABC, "clase_abc_anio"), (CLIENTE, "nombre"), (CLIENTE, "region")],
               ["Ventas netas", "Margen bruto", "% Margen", "Saldo por cobrar",
                "Saldo vencido"],
               "Catálogo de clientes",
               "clase, venta, rentabilidad y exposición de cobro en una sola vista",
               top=40, orden_por="Ventas netas"),
    ]


def pagina_cartera(empresa: str) -> list[dict]:
    y_kpi, h_kpi = 72, 92
    y2, h2 = y_kpi + h_kpi + SEP, 240
    y3 = y2 + h2 + SEP
    h3 = 720 - y3 - MARGEN
    return [
        *encabezado("Cartera · cobrar y pagar",
                    "Saldos tomados del mayor contable, no del documento: es el número que el "
                    "contador reconoce. La antigüedad se cuenta contra la fecha de vencimiento.",
                    empresa),
        filtro(x_col(9), 14, col(3), 30, ANTIG, "rango_aging_nombre", "Antigüedad"),

        kpi(x_col(0), y_kpi, col(2), h_kpi, "Saldo por cobrar terceros", "POR COBRAR", AZUL, 20),
        kpi(x_col(2), y_kpi, col(2), h_kpi, "Saldo vencido terceros", "VENCIDO", ROJO, 20),
        kpi(x_col(4), y_kpi, col(2), h_kpi, "% Vencido terceros", "% VENCIDO", ROJO, 20),
        kpi(x_col(6), y_kpi, col(2), h_kpi, "Días de cartera terceros", "DÍAS DE CARTERA",
            TINTA, 20),
        kpi(x_col(8), y_kpi, col(2), h_kpi, "Saldo por pagar", "POR PAGAR", NARANJA, 20),
        kpi(x_col(10), y_kpi, col(2), h_kpi, "Posición neta", "POSICIÓN NETA", VERDE, 20),

        barras(x_col(0), y2, col(5), h2, "Saldo por cobrar", ANTIG, "rango_aging_nombre",
               "Antigüedad de lo por cobrar", "saldo pendiente por rango", AZUL),
        barras(x_col(5), y2, col(4), h2, "Saldo por pagar", ANTIG, "rango_aging_nombre",
               "Antigüedad de lo por pagar", None, NARANJA),
        dona(x_col(9), y2, col(3), h2, "Saldo por cobrar", ANTIG, "severidad",
             "Riesgo", "por severidad",
             colores=[VERDE, AZUL_CLARO, NARANJA, ROJO, TENUE]),

        matriz(x_col(0), y3, col(7), h3,
               [(CLIENTE, "nombre")],
               ["Saldo por cobrar", "Saldo vencido", "Vencido más de 90",
                "Días vencido promedio"],
               "Deudores", "ordenado por saldo vencido", top=25,
               orden_por="Saldo vencido"),
        matriz(x_col(7), y3, col(5), h3,
               [(PROVEEDOR, "nombre")],
               ["Saldo por pagar", "Por pagar vencido"],
               "Acreedores", "ordenado por saldo", top=25, orden_por="Saldo por pagar"),
    ]


def pagina_compras(empresa: str) -> list[dict]:
    y_kpi, h_kpi = 72, 92
    y2, h2 = y_kpi + h_kpi + SEP, 250
    y3 = y2 + h2 + SEP
    h3 = 720 - y3 - MARGEN
    return [
        *encabezado("Compras y abastecimiento",
                    "Compra neta del período por proveedor, producto y centro de costo.",
                    empresa),
        filtro(x_col(9), 14, col(3), 30, CAL, "anio_mes", "Período"),

        kpi(x_col(0), y_kpi, col(3), h_kpi, "Compras netas", "COMPRAS NETAS (SIN IVA)"),
        kpi(x_col(3), y_kpi, col(3), h_kpi, "Documentos de compra", "DOCUMENTOS", TINTA),
        kpi(x_col(6), y_kpi, col(3), h_kpi, "Proveedores con compra", "PROVEEDORES", TINTA),
        kpi(x_col(9), y_kpi, col(3), h_kpi, "Compra promedio por documento",
            "COMPRA MEDIA POR DOCUMENTO", TINTA),

        linea_area(x_col(0), y2, col(8), h2, ["Compras netas"], "anio_mes",
                   "Evolución de la compra neta", "por mes"),
        barras(x_col(8), y2, col(4), h2, "Compras netas", CCOSTO, "nombre",
               "Compra por centro de costo", None, NARANJA, top=10),

        barras(x_col(0), y3, col(6), h3, "Compras netas", PROVEEDOR, "nombre",
               "Proveedores por compra", "los 12 mayores", AZUL, top=12),
        matriz(x_col(6), y3, col(6), h3,
               [(PRODUCTO, "nombre")],
               ["Compras netas", "Unidades compradas", "Líneas de compra"],
               "Detalle por producto", "ordenado por compra neta", top=25),
    ]


def main() -> int:
    # El nombre de la empresa es OBLIGATORIO: un default silencioso pondría el nombre de
    # otro cliente en el reporte de un tenant nuevo (barrido de genericidad 2026-08-07).
    if len(sys.argv) < 3:
        print("Uso: python generar_reporte.py <carpeta.Report> <nombre_empresa>")
        return 1
    destino = Path(sys.argv[1])
    empresa = sys.argv[2]

    secciones = [
        pagina("pagina_pulso", "Pulso", 0, pagina_pulso(empresa)),
        pagina("pagina_ventas", "Ventas", 1, pagina_ventas(empresa)),
        pagina("pagina_clientes", "Clientes ABC", 2, pagina_clientes(empresa)),
        pagina("pagina_cartera", "Cartera", 3, pagina_cartera(empresa)),
        pagina("pagina_compras", "Compras", 4, pagina_compras(empresa)),
    ]

    reporte = {
        "config": json.dumps({
            "version": "5.43",
            "themeCollection": {"baseTheme": {"name": "CY24SU10", "version": "5.55", "type": 2}},
            "activeSectionIndex": 0,
            "defaultDrillFilterOtherVisuals": True,
            "settings": {
                "useStylableVisualContainerHeader": True,
                "hideVisualContainerHeader": True,
            },
        }, ensure_ascii=False),
        "layoutOptimization": 0,
        "resourcePackages": [{"resourcePackage": {
            "disabled": False,
            "items": [{"name": "CY24SU10", "path": "BaseThemes/CY24SU10.json", "type": 202}],
            "name": "SharedResources", "type": 2}}],
        "sections": secciones,
        "filters": "[]",
        "publicCustomVisuals": [],
    }

    (destino / "report.json").write_text(
        json.dumps(reporte, indent=2, ensure_ascii=False), encoding="utf-8")

    total = sum(len(s["visualContainers"]) for s in secciones)
    print(f"OK · {len(secciones)} paginas · {total} visuales · portada en {trimestre_actual()} "
          f"· {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
