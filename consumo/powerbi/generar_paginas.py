"""Genera las páginas PBIR del reporte desde una especificación declarativa.

Escribe `definition/pages/<id>/page.json` + `visuals/<id>/visual.json` con los MISMOS esquemas
que Power BI Desktop escribe al guardar (visualContainer 2.11.0, page 2.1.0, pagesMetadata
1.1.0), registra el tema de la organización como customTheme y mantiene `pages.json`.

Reglas que este script respeta a rajatabla:
  · SOLO toca las páginas que declara (por id determinista). Cualquier otra página del reporte
    queda intacta — salvo las listadas en PAGINAS_A_RETIRAR, decididas explícitamente.
  · IDs deterministas: sha1("quilate:<slug>[:<visual>]")[:20]. Regenerar produce los mismos ids,
    así que la navegación y los marcadores nunca se rompen (§5.2 del contrato).
  · Cero hex fuera de la paleta del contrato: el color vive en el tema; los pocos hex inline
    permitidos son los tokens documentados en `docs/powerbi/contracts/sistema-visual.md`.
  · Ningún número escrito a mano en títulos/subtítulos: texto dinámico desde medidas _Narrativa.
  · Se corre con Power BI Desktop CERRADO (B6).

Uso:  python generar_paginas.py <carpeta_salida> <proyecto>
      python generar_paginas.py organizaciones/grupocresta/powerbi PulsoCresta
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------- esquemas (los que Desktop escribe)
SCHEMA_VISUAL = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json"
SCHEMA_PAGE = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json"
SCHEMA_PAGES = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json"

LIENZO_W, LIENZO_H = 1280, 720

# Páginas que este script retira del reporte (decisión de Edwin, 2026-08-08): la "Página 1"
# original con los 3 visuales manuales — queda recuperable en git.
PAGINAS_A_RETIRAR = ["0ddb6f45dcad4eccc476"]

# ---------------------------------------------------------------- grilla del contrato (§5.1 corregido)
# 12 columnas de 88 px, margen 24, gutter 16: x = 24+(n−1)·104, ancho de n col = 104·n − 16.
def x_col(n: int) -> int:
    return 24 + (n - 1) * 104


def w_col(n: int) -> int:
    return 104 * n - 16


def _id(*partes: str) -> str:
    """Id determinista de 20 hex (formato de Desktop) — estable entre corridas."""
    return hashlib.sha1(("quilate:" + ":".join(partes)).encode("utf-8")).hexdigest()[:20]


# ---------------------------------------------------------------- primitivas del esquema PBIR
def lit(v) -> dict:
    """Literal PBIR: string entre comillas simples, double con sufijo D, booleano crudo."""
    if isinstance(v, bool):
        s = "true" if v else "false"
    elif isinstance(v, (int, float)):
        s = f"{v}D"
    else:
        s = "'" + str(v).replace("'", "''") + "'"
    return {"expr": {"Literal": {"Value": s}}}


def campo_medida(tabla: str, medida: str) -> dict:
    return {"Measure": {"Expression": {"SourceRef": {"Entity": tabla}}, "Property": medida}}


def campo_columna(tabla: str, columna: str) -> dict:
    return {"Column": {"Expression": {"SourceRef": {"Entity": tabla}}, "Property": columna}}


def fx_medida(tabla: str, medida: str) -> dict:
    """Texto dinámico: la propiedad se enlaza a una medida (títulos y botones, §3.2)."""
    return {"expr": campo_medida(tabla, medida)}


def proy(campo: dict, tabla: str, nombre: str, activa: bool = False) -> dict:
    p = {"field": campo, "queryRef": f"{tabla}.{nombre}", "nativeQueryRef": nombre}
    if activa:
        p["active"] = True
    return p


def p_medida(tabla: str, medida: str) -> dict:
    return proy(campo_medida(tabla, medida), tabla, medida)


def p_columna(tabla: str, columna: str, activa: bool = False) -> dict:
    return proy(campo_columna(tabla, columna), tabla, columna, activa)


def _pos(x: int, y: int, w: int, h: int, z: int, tab: int) -> dict:
    return {"x": x, "y": y, "z": z, "height": h, "width": w, "tabOrder": tab}


def visual(nombre: str, tipo: str, x: int, y: int, w: int, h: int, *, z: int, tab: int,
           roles: dict | None = None, objects: dict | None = None,
           vc_objects: dict | None = None, extra: dict | None = None,
           sync_group: str | None = None) -> dict:
    """Contenedor visualContainer 2.11.0 con la misma forma que escribe Desktop."""
    v: dict = {"visualType": tipo}
    if roles:
        v["query"] = {"queryState": {rol: {"projections": ps} for rol, ps in roles.items()}}
    if extra:
        v.update(extra)
    if objects:
        v["objects"] = objects
    if vc_objects:
        v["visualContainerObjects"] = vc_objects
    v["drillFilterOtherVisuals"] = True
    contenedor = {
        "$schema": SCHEMA_VISUAL,
        "name": nombre,
        "position": _pos(x, y, w, h, z, tab),
        "visual": v,
    }
    if sync_group:
        # Sincroniza el segmentador entre páginas (período/empresa/moneda — §3 transversal).
        contenedor["syncGroup"] = {"groupName": sync_group, "fieldChanges": True, "filterChanges": True}
    return contenedor


def titulo_vc(texto_o_fx, subtitulo_o_fx=None) -> dict:
    """visualContainerObjects con título (y subtítulo si aplica). Acepta str o fx de medida."""
    def _t(v):
        return v if isinstance(v, dict) else lit(v)
    vc = {"title": [{"properties": {"text": _t(texto_o_fx), "show": lit(True)}}]}
    if subtitulo_o_fx is not None:
        vc["subTitle"] = [{"properties": {"text": _t(subtitulo_o_fx), "show": lit(True)}}]
    return vc


# ---------------------------------------------------------------- fábricas de visuales
def tarjeta(slug: str, clave: str, tabla: str, medida: str, x: int, y: int, w: int, h: int,
            *, z: int, tab: int, etiqueta: str | None = None, critica: bool = False) -> dict:
    """Tarjeta de KPI. `critica` pinta el valor con el rojo de estado del contrato (token
    documentado — el rojo nunca es serie, aquí es estado)."""
    objects: dict = {}
    if etiqueta is not None:
        # La etiqueta de categoría de la tarjeta es el nombre de la medida; solo se apaga
        # cuando el chrome ya dice qué es (título de página, pie de frescura).
        objects["categoryLabels"] = [{"properties": {"show": lit(bool(etiqueta))}}]
    if critica:
        objects["labels"] = [{"properties": {"color": {"solid": {"color": lit("#d51c29")}}}}]
    return visual(_id(slug, clave), "card", x, y, w, h, z=z, tab=tab,
                  roles={"Values": [p_medida(tabla, medida)]},
                  objects=objects or None)


def segmentador(slug: str, clave: str, tabla: str, columna: str, x: int, y: int, w: int, h: int,
                *, z: int, tab: int, grupo: str, seleccion: str | None = None) -> dict:
    """Slicer dropdown de una columna, sincronizado por grupo. `seleccion` fija el valor
    inicial (el mes en curso para el período — D2: la proyección exige UN mes)."""
    objects: dict = {
        "data": [{"properties": {"mode": lit("Dropdown")}}],
        "general": [{"properties": {}}],
    }
    if seleccion is not None:
        objects["general"] = [{"properties": {"filter": {"filter": {
            "Version": 2,
            "From": [{"Name": "t", "Entity": tabla, "Type": 0}],
            "Where": [{"Condition": {"In": {
                "Expressions": [{"Column": {"Expression": {"SourceRef": {"Source": "t"}},
                                            "Property": columna}}],
                "Values": [[{"Literal": {"Value": f"'{seleccion}'"}}]],
            }}}],
        }}}}]
    return visual(_id(slug, clave), "slicer", x, y, w, h, z=z, tab=tab,
                  roles={"Values": [p_columna(tabla, columna, activa=True)]},
                  objects=objects,
                  extra={"expansionStates": [{
                      "roles": ["Values"],
                      "levels": [{"queryRefs": [f"{tabla}.{columna}"],
                                  "isCollapsed": True, "isPinned": True}],
                      "root": {},
                  }]},
                  sync_group=grupo)


def boton(slug: str, clave: str, texto, x: int, y: int, w: int, h: int, *, z: int, tab: int,
          destino: str | None = None, alineacion: str = "center") -> dict:
    """actionButton. `texto` es str (estático, sin cifras) o fx de medida (alertas vivas).
    `destino` = id de página para PageNavigation; sin destino el botón queda inerte hasta que
    exista su página (F6.1: toda página referenciada debe existir)."""
    objects: dict = {
        "icon": [{"properties": {"shapeType": lit("blank")}, "selector": {"id": "default"}}],
        "text": [{"properties": {
            "show": lit(True),
            "text": texto if isinstance(texto, dict) else lit(texto),
            "horizontalAlignment": lit(alineacion),
        }, "selector": {"id": "default"}}],
    }
    if destino:
        objects["visualLink"] = [{"properties": {
            "show": lit(True),
            "type": lit("PageNavigation"),
            "navigationSection": lit(destino),
        }}]
    return visual(_id(slug, clave), "actionButton", x, y, w, h, z=z, tab=tab, objects=objects)


def tabla_visual(slug: str, clave: str, campos: list[dict], x: int, y: int, w: int, h: int,
                 *, z: int, tab: int, titulo=None, subtitulo=None) -> dict:
    return visual(_id(slug, clave), "tableEx", x, y, w, h, z=z, tab=tab,
                  roles={"Values": campos},
                  vc_objects=titulo_vc(titulo, subtitulo) if titulo else None)


def grafica(slug: str, clave: str, tipo: str, roles: dict, x: int, y: int, w: int, h: int,
            *, z: int, tab: int, titulo=None, subtitulo=None, objects: dict | None = None) -> dict:
    base_objects = {
        # Los ejes limpios del contrato: sin título de eje, la unidad va en el subtítulo.
        "categoryAxis": [{"properties": {"showAxisTitle": lit(False)}}],
        "valueAxis": [{"properties": {"showAxisTitle": lit(False)}}],
    }
    if objects:
        base_objects.update(objects)
    return visual(_id(slug, clave), tipo, x, y, w, h, z=z, tab=tab, roles=roles,
                  objects=base_objects,
                  vc_objects=titulo_vc(titulo, subtitulo) if titulo else None)


# ---------------------------------------------------------------- chrome común (§1 del contrato F3)
def chrome(slug: str, tabla_titulo: str, medida_titulo: str, mes_actual: str) -> list[dict]:
    """Los 7 elementos idénticos en todas las páginas. z altos para que nada los tape."""
    return [
        # Banda de encabezado: el relleno azul de marca viene del tema (visualStyles.shape).
        visual(_id(slug, "chrome-banda"), "shape", 0, 0, LIENZO_W, 72, z=100, tab=100,
               objects={"shape": [{"properties": {"tileShape": lit("rectangle")}}]}),
        # Título de página: medida _Narrativa (incluye el período activo). Texto blanco sobre
        # la banda — el blanco es token del contrato, no un color nuevo.
        visual(_id(slug, "chrome-titulo"), "card", 24, 16, 608, 40, z=101, tab=0,
               roles={"Values": [p_medida(tabla_titulo, medida_titulo)]},
               objects={
                   "labels": [{"properties": {
                       "color": {"solid": {"color": lit("#ffffff")}},
                       "fontSize": lit(15),
                   }}],
                   "categoryLabels": [{"properties": {"show": lit(False)}}],
               },
               vc_objects={
                   "background": [{"properties": {"show": lit(False)}}],
                   "border": [{"properties": {"show": lit(False)}}],
               }),
        visual(_id(slug, "chrome-nav"), "pageNavigator", 648, 16, 504, 40, z=101, tab=1),
        segmentador(slug, "chrome-periodo", "DM_Calendario", "anio_mes", 24, 88, 296, 40,
                    z=102, tab=2, grupo="periodo", seleccion=mes_actual),
        segmentador(slug, "chrome-empresa", "DM_Empresa", "nombre", 336, 88, 296, 40,
                    z=102, tab=3, grupo="empresa"),
        segmentador(slug, "chrome-moneda", "MD_Moneda de análisis", "Moneda de análisis",
                    1064, 88, 192, 40, z=102, tab=4, grupo="moneda"),
        # Pie de frescura: y=696 h=24 (el contrato decía 700/20, que no es múltiplo de 8 y
        # violaría F6.1 — corrección aritmética documentada en STATE.md).
        visual(_id(slug, "chrome-pie"), "card", 24, 696, 1256, 24, z=100, tab=99,
               roles={"Values": [p_medida("FC_Estado de carga", "Pie de frescura")]},
               objects={
                   "labels": [{"properties": {"fontSize": lit(9),
                                              "color": {"solid": {"color": lit("#8a9099")}}}}],
                   "categoryLabels": [{"properties": {"show": lit(False)}}],
               },
               vc_objects={
                   "background": [{"properties": {"show": lit(False)}}],
                   "border": [{"properties": {"show": lit(False)}}],
               }),
    ]


# ---------------------------------------------------------------- ids de página (deterministas)
PG = {
    "00": _id("pagina-00-inicio"),
    "01": _id("pagina-01-direccion"),
    "09": _id("pagina-09-cartera-y-cobranza"),
}


# ---------------------------------------------------------------- las tres páginas de la ola 1
def pagina_00(mes_actual: str) -> tuple[str, str, list[dict]]:
    slug = "pagina-00-inicio"
    vs = chrome(slug, "FC_Estado de carga", "Título de Inicio", mes_actual)
    # KPIs de confianza (y=144): los tres relojes de frescura.
    vs += [
        tarjeta(slug, "kpi-ultimo-dato", "FC_Estado de carga", "Último dato del ERP",
                24, 144, 296, 56, z=1, tab=5, etiqueta="sí"),
        tarjeta(slug, "kpi-dias-extraccion", "FC_Estado de carga", "Días desde última extracción",
                336, 144, 296, 56, z=1, tab=6, etiqueta="sí"),
        tarjeta(slug, "kpi-desactualizados", "FC_Estado de carga", "Dominios desactualizados",
                648, 144, 296, 56, z=1, tab=7, etiqueta="sí"),
    ]
    # 6 botones de navegación (grid 3×2, 400×112, gutter 16). Solo navegan los destinos que
    # existen en esta ola; el resto se cablea al construirse su página (F6.1).
    destinos = [
        ("01 · Dirección", PG["01"]), ("02 · Ventas", None), ("05 · Productos", None),
        ("08 · Compras", None), ("09 · Cartera y cobranza", PG["09"]), ("11 · Finanzas", None),
    ]
    for i, (texto, destino) in enumerate(destinos):
        fila, colu = divmod(i, 3)
        vs.append(boton(slug, f"nav-{i}", texto, 24 + colu * 416, 216 + fila * 120, 400, 112,
                        z=2, tab=8 + i, destino=destino))
    # ¿Hasta cuándo llega cada dominio?
    vs.append(tabla_visual(
        slug, "tabla-frescura",
        [p_columna("FC_Estado de carga", "dominio_nombre", activa=True),
         p_medida("FC_Estado de carga", "Último dato del ERP"),
         p_medida("FC_Estado de carga", "Días desde última extracción")],
        24, 464, 608, 224, z=3, tab=14,
        titulo="¿Hasta cuándo llega el dato de cada dominio?",
        subtitulo="Dos relojes: el del pipeline y el de la operación en el ERP"))
    # ¿Qué exige atención ya? — 3 tarjetas de alerta.
    alertas = [
        ("alerta-quiebre", "DM_Análisis de producto", "Venta anual en riesgo por quiebre"),
        ("alerta-vencido", "FC_Cartera por cobrar", "Vencido terceros hoy"),
        ("alerta-backlog", "FC_Pedidos", "Backlog vencido"),
    ]
    for i, (clave, tabla, medida) in enumerate(alertas):
        vs.append(tarjeta(slug, clave, tabla, medida, 648 + i * 216, 464, 200, 224,
                          z=3, tab=15 + i, etiqueta="sí", critica=True))
    return PG["00"], "00 · Inicio", vs


def pagina_01(mes_actual: str) -> tuple[str, str, list[dict]]:
    slug = "pagina-01-direccion"
    vs = chrome(slug, "FC_Ventas", "Título de Dirección", mes_actual)
    # Las cuatro cifras que mandan (y=144, h=88).
    kpis = [
        ("kpi-proyeccion", "FC_Venta diaria", "Proyección de cierre de mes", False),
        ("kpi-variacion", "FC_Ventas", "Variación acumulada vs año anterior", False),
        ("kpi-posicion", "FC_Cartera por pagar", "Posición neta hoy", False),
        ("kpi-ccc", "FC_Cartera por pagar", "Ciclo de conversión de efectivo", False),
    ]
    for i, (clave, tabla, medida, critica) in enumerate(kpis):
        vs.append(tarjeta(slug, clave, tabla, medida, 24 + i * 312, 144, 296, 88,
                          z=1, tab=5 + i, etiqueta="sí", critica=critica))
    # ¿Vamos a llegar al mes? — columnas por día + línea de proyección.
    vs.append(grafica(
        slug, "ritmo-mes", "lineClusteredColumnComboChart",
        {"Category": [p_columna("DM_Calendario", "fecha", activa=True)],
         "Y": [p_medida("FC_Venta diaria", "Venta por día hábil")],
         "Y2": [p_medida("FC_Venta diaria", "Proyección de cierre de mes")]},
        24, 248, 608, 216, z=2, tab=9,
        titulo="¿Vamos a llegar al mes?",
        subtitulo=fx_medida("FC_Venta diaria", "Subtítulo del ritmo del mes")))
    # ¿Cómo va el ejercicio? — serie mensual + media móvil (corrección D3: sin año anterior).
    vs.append(grafica(
        slug, "ejercicio", "lineChart",
        {"Category": [p_columna("DM_Calendario", "anio_mes", activa=True)],
         "Y": [p_medida("FC_Ventas", "Ventas netas"),
               p_medida("FC_Ventas", "Media móvil 3 meses")]},
        648, 248, 632, 216, z=2, tab=10,
        titulo="¿Cómo va el ejercicio?",
        subtitulo=fx_medida("FC_Ventas", "Subtítulo del ejercicio")))
    # ¿Qué exige acción y cuánto vale? — 5 filas-botón con texto vivo (medidas de alerta).
    vs.append(boton(slug, "focos-titulo", "¿Qué exige acción esta semana?", 24, 480, 816, 16,
                    z=2, tab=11, alineacion="left"))
    focos = [
        ("foco-quiebre", "DM_Análisis de producto", "Alerta de quiebre", None),
        ("foco-bajo-costo", "FC_Ventas", "Alerta de venta bajo costo", None),
        ("foco-vencido", "FC_Cartera por cobrar", "Alerta de vencido", PG["09"]),
        ("foco-backlog", "FC_Pedidos", "Alerta de backlog", None),
        ("foco-caja", "FC_Proyección de caja", "Alerta de caja", None),
    ]
    for i, (clave, tabla, medida, destino) in enumerate(focos):
        vs.append(boton(slug, clave, fx_medida(tabla, medida), 24, 504 + i * 40, 816, 32,
                        z=2, tab=12 + i, destino=destino, alineacion="left"))
    # ¿Qué sociedad aporta? — barras horizontales ordenadas.
    vs.append(grafica(
        slug, "aporte-sociedad", "barChart",
        {"Category": [p_columna("DM_Empresa", "nombre", activa=True)],
         "Y": [p_medida("FC_Ventas", "Ventas a terceros")]},
        856, 480, 424, 208, z=2, tab=17,
        titulo="¿Qué sociedad aporta?",
        subtitulo=fx_medida("FC_Ventas", "Subtítulo de aporte por sociedad")))
    return PG["01"], "01 · Dirección", vs


def pagina_09(mes_actual: str) -> tuple[str, str, list[dict]]:
    slug = "pagina-09-cartera-y-cobranza"
    vs = chrome(slug, "FC_Cartera por cobrar", "Título de Cartera y cobranza", mes_actual)
    # La foto de hoy (las medidas `hoy` ignoran el período a propósito). La 2ª es crítica.
    kpis = [
        ("kpi-por-cobrar", "Por cobrar terceros hoy", False),
        ("kpi-vencido", "Vencido terceros hoy", True),
        ("kpi-pct-vencido", "% Vencido terceros hoy", True),
        ("kpi-dias-cartera", "Días de cartera terceros", False),
    ]
    for i, (clave, medida, critica) in enumerate(kpis):
        vs.append(tarjeta(slug, clave, "FC_Cartera por cobrar", medida, 24 + i * 312, 144, 296, 88,
                          z=1, tab=5 + i, etiqueta="sí", critica=critica))
    # ¿Desde cuándo me deben? — barras por tramo de antigüedad.
    vs.append(grafica(
        slug, "aging", "barChart",
        {"Category": [p_columna("DM_Antigüedad", "rango_aging_nombre", activa=True)],
         "Y": [p_medida("FC_Cartera por cobrar", "Saldo por cobrar terceros")]},
        24, 248, 504, 216, z=2, tab=9,
        titulo="¿Desde cuándo me deben?",
        subtitulo=fx_medida("FC_Cartera por cobrar", "Subtítulo del aging de terceros")))
    # ¿Qué cobro esta semana? — GAP-01: el eje de vencimiento.
    vs.append(tabla_visual(
        slug, "agenda-cobro",
        [p_columna("DM_Cliente", "nombre", activa=True),
         p_columna("FC_Cartera por cobrar", "documento_origen"),
         p_columna("FC_Cartera por cobrar", "fecha_vencimiento"),
         p_medida("FC_Cartera por cobrar", "Cobro que vence en el período")],
        544, 248, 736, 216, z=2, tab=10,
        titulo="¿Qué cobro esta semana?",
        subtitulo=fx_medida("FC_Cartera por cobrar", "Subtítulo de la agenda de cobro")))
    # ¿A quién no le despacho? — clientes en vencido crítico.
    vs.append(tabla_visual(
        slug, "riesgo-clientes",
        [p_columna("DM_Cliente", "nombre", activa=True),
         p_columna("DM_Comportamiento de pago", "saldo_total"),
         p_columna("DM_Comportamiento de pago", "saldo_vencido"),
         p_columna("DM_Comportamiento de pago", "max_dias_vencido"),
         p_columna("DM_Comportamiento de pago", "perfil_riesgo_nombre")],
        24, 480, 608, 208, z=2, tab=11,
        titulo="¿A quién no le despacho?",
        subtitulo="Clientes con perfil de pago en vencido crítico · revisar antes de despachar"))
    # El filtro del visual: solo perfiles críticos.
    vs[-1]["filterConfig"] = {"filters": [{
        "name": _id(slug, "riesgo-clientes-filtro"),
        "field": campo_columna("DM_Comportamiento de pago", "perfil_riesgo"),
        "type": "Categorical",
        "filter": {
            "Version": 2,
            "From": [{"Name": "c", "Entity": "DM_Comportamiento de pago", "Type": 0}],
            "Where": [{"Condition": {"In": {
                "Expressions": [{"Column": {"Expression": {"SourceRef": {"Source": "c"}},
                                            "Property": "perfil_riesgo"}}],
                "Values": [[{"Literal": {"Value": "'vencido_critico'"}}]],
            }}}],
        },
    }]}
    # ¿Mejora la cobranza? — % vencido por corte.
    vs.append(grafica(
        slug, "tendencia-cobranza", "lineChart",
        {"Category": [p_columna("DM_Calendario", "fecha", activa=True)],
         "Y": [p_medida("FC_Cartera cobrar histórico", "% Vencido histórico")]},
        648, 480, 632, 208, z=2, tab=12,
        titulo="¿Mejora la cobranza?",
        subtitulo=fx_medida("FC_Cartera cobrar histórico", "Subtítulo de tendencia de cobranza")))
    return PG["09"], "09 · Cartera y cobranza", vs


# ---------------------------------------------------------------- registro del tema
def registrar_tema(rep: Path, tema_origen: Path) -> str:
    """Copia el tema de la organización a StaticResources y lo registra como customTheme.
    Edición conservadora de report.json: se preserva todo lo que Desktop haya escrito."""
    nombre = tema_origen.stem
    destino = rep / "StaticResources" / "RegisteredResources" / tema_origen.name
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(tema_origen, destino)

    ruta_rj = rep / "definition" / "report.json"
    rj = json.loads(ruta_rj.read_text(encoding="utf-8"))
    rj.setdefault("themeCollection", {})["customTheme"] = {
        "name": nombre, "type": "RegisteredResources"}
    paquetes = rj.setdefault("resourcePackages", [])
    registrados = next((p for p in paquetes if p.get("type") == "RegisteredResources"), None)
    if registrados is None:
        registrados = {"name": "RegisteredResources", "type": "RegisteredResources", "items": []}
        paquetes.append(registrados)
    if not any(i.get("name") == nombre for i in registrados["items"]):
        registrados["items"].append(
            {"name": nombre, "path": tema_origen.name, "type": "CustomTheme"})
    ruta_rj.write_text(json.dumps(rj, indent=2, ensure_ascii=False), encoding="utf-8")
    return nombre


# ---------------------------------------------------------------- main
def main() -> int:
    salida, proyecto = Path(sys.argv[1]), sys.argv[2]
    rep = salida / f"{proyecto}.Report"
    pages_dir = rep / "definition" / "pages"
    if not pages_dir.exists():
        print(f"FALLO · no existe {pages_dir} — el reporte no está en formato PBIR")
        return 1

    # El mes en curso preseleccionado en el segmentador de período (D2).
    mes_actual = _dt.date.today().strftime("%Y-%m")

    # Tema de la organización (primer .json en <salida>/theme/); cae al genérico del producto.
    temas = sorted((salida / "theme").glob("*.json")) if (salida / "theme").exists() else []
    tema = temas[0] if temas else Path(__file__).parent / "theme" / "quilate-theme.json"
    nombre_tema = registrar_tema(rep, tema)

    # Páginas retiradas por decisión explícita (recuperables en git).
    retiradas = []
    for pid in PAGINAS_A_RETIRAR:
        carpeta = pages_dir / pid
        if carpeta.exists():
            shutil.rmtree(carpeta)
            retiradas.append(pid)

    # Las páginas de esta ola: cada corrida las reescribe completas (ids deterministas).
    paginas = [pagina_00(mes_actual), pagina_01(mes_actual), pagina_09(mes_actual)]
    for pid, display, visuales in paginas:
        carpeta = pages_dir / pid
        if carpeta.exists():
            shutil.rmtree(carpeta)
        (carpeta / "visuals").mkdir(parents=True)
        (carpeta / "page.json").write_text(json.dumps({
            "$schema": SCHEMA_PAGE,
            "name": pid,
            "displayName": display,
            "displayOption": "FitToPage",
            "height": LIENZO_H,
            "width": LIENZO_W,
        }, indent=2, ensure_ascii=False), encoding="utf-8")
        for v in visuales:
            vdir = carpeta / "visuals" / v["name"]
            vdir.mkdir(parents=True)
            (vdir / "visual.json").write_text(
                json.dumps(v, indent=2, ensure_ascii=False), encoding="utf-8")

    # pages.json: las páginas de la ola van primero en su orden; cualquier otra página existente
    # conserva su lugar después. La activa es 00 · Inicio.
    ids_ola = [pid for pid, _, _ in paginas]
    otras = sorted(p.name for p in pages_dir.iterdir()
                   if p.is_dir() and p.name not in ids_ola)
    (pages_dir / "pages.json").write_text(json.dumps({
        "$schema": SCHEMA_PAGES,
        "pageOrder": ids_ola + otras,
        "activePageName": PG["00"],
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    n_vis = sum(len(v) for _, _, v in paginas)
    print(f"OK · {proyecto} · {len(paginas)} páginas · {n_vis} visuales · tema '{nombre_tema}'"
          + (f" · retiradas: {', '.join(retiradas)}" if retiradas else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
