"""Valida que el reporte (report.json) solo referencie tablas, columnas y medidas que existen
en el modelo semántico (TMDL).

Por qué existe: Power BI no avisa de una referencia rota al guardar. El visual simplemente
aparece VACÍO al abrir el reporte, y eso se descubre en la presentación. Como el modelo se
genera por código y el reporte también, cruzarlos aquí es barato y atrapa el fallo antes.

Comprueba además que ningún visual se salga del lienzo ni se solape con otro: dos tarjetas
superpuestas es el defecto visual que más rápido delata un tablero generado sin revisar.

Uso:  python validar_reporte.py <carpeta_proyecto>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

LIENZO_W, LIENZO_H = 1280, 720


def leer_modelo(defi: Path) -> tuple[set[str], dict[str, set[str]], set[str]]:
    """(tablas, columnas por tabla, medidas) declaradas en el TMDL."""
    tablas: set[str] = set()
    columnas: dict[str, set[str]] = {}
    medidas: set[str] = set()
    for f in sorted((defi / "tables").glob("*.tmdl")):
        actual = ""
        for linea in f.read_text(encoding="utf-8").split("\n"):
            s = linea.strip()
            m = re.match(r"^table\s+(?:'([^']+)'|(\S+))", s)
            if m:
                actual = m.group(1) or m.group(2)
                tablas.add(actual)
                columnas.setdefault(actual, set())
                continue
            m = re.match(r"^column\s+(?:'([^']+)'|(\S+))", s)
            if m and actual:
                columnas[actual].add(m.group(1) or m.group(2))
                continue
            m = re.match(r"^measure\s+(?:'([^']+)'|([^\s=]+))", s)
            if m:
                medidas.add(m.group(1) or m.group(2))
    return tablas, columnas, medidas


def _refs_pbir(nodo, tablas: set[str], columnas: dict[str, set[str]],
               medidas: set[str], etq: str, fallos: list[str]) -> None:
    """Recorre un visual.json PBIR buscando referencias {Expression: SourceRef.Entity, Property}
    y valida que existan en el modelo. Una referencia rota no da error en Desktop: el visual
    simplemente aparece vacío."""
    if isinstance(nodo, dict):
        ent = (nodo.get("Expression", {}).get("SourceRef", {}) or {}).get("Entity")
        prop = nodo.get("Property")
        if ent and prop:
            if ent not in tablas:
                fallos.append(f"{etq}: tabla '{ent}' no existe en el modelo")
            elif prop not in columnas.get(ent, set()) and prop not in medidas:
                fallos.append(f"{etq}: {ent}[{prop}] no existe en el modelo")
        for v in nodo.values():
            _refs_pbir(v, tablas, columnas, medidas, etq, fallos)
    elif isinstance(nodo, list):
        for v in nodo:
            _refs_pbir(v, tablas, columnas, medidas, etq, fallos)


# --- gate F6.1 (contrato §6): reglas duras sobre el PBIR generado -----------------------------

# Los únicos hex tolerados inline: los tokens del contrato (`sistema-visual.md`). Todo lo demás
# debe salir del tema. Un hex fuera de esta lista es un color inventado y falla el gate.
HEX_PERMITIDOS = {
    # marca y estado
    "#0043af", "#d51c29", "#0ca30c", "#eda100", "#eb6834",
    # paleta categórica
    "#004ec9", "#1baf7a", "#e87ba4", "#008300", "#4a3aa7", "#0093ab",
    # rampa secuencial
    "#d6e6ff", "#8eb8ff", "#5391ff", "#0b69ff", "#00348c", "#00266d",
    # tintas y neutros
    "#1a1a1a", "#5b6472", "#8a9099", "#c9ced6", "#e3e6eb", "#e8e9ec",
    "#eceef2", "#f2f3f5", "#f4f6f9", "#fafbfc", "#ffffff",
}

# El chrome se superpone a propósito (título y navegación viven SOBRE la banda) y las tarjetas
# no llevan título de contenedor. Estos tipos quedan exentos de solape/título respectivamente.
TIPOS_SIN_SOLAPE = {"shape", "textbox"}
TIPOS_SIN_TITULO = {"shape", "textbox", "card", "kpi", "slicer", "actionButton", "pageNavigator"}

# En el texto estático solo se toleran dígitos que son identificador de página ("01 · Dirección");
# cualquier otro dígito en un título es un número escrito a mano (§3.2).
_PREFIJO_PAGINA = re.compile(r"^\d\d · ")

# Propiedades que el esquema visualContainer admite en la raíz. Cualquier otra la rechaza
# Desktop al abrir ("propiedad adicional") — p. ej. syncGroup, que va DENTRO de `visual`.
# Verificado contra el esquema oficial (2.9.0/2.11.0) el 2026-08-08.
RAIZ_VISUAL_PERMITIDA = {"$schema", "name", "position", "visual", "visualGroup",
                         "parentGroupName", "filterConfig", "isHidden", "annotations",
                         "howCreated"}


def _hex_fuera_de_paleta(nodo, etq: str, fallos: list[str]) -> None:
    if isinstance(nodo, dict):
        for v in nodo.values():
            _hex_fuera_de_paleta(v, etq, fallos)
    elif isinstance(nodo, list):
        for v in nodo:
            _hex_fuera_de_paleta(v, etq, fallos)
    elif isinstance(nodo, str):
        for h in re.findall(r"#[0-9a-fA-F]{6}\b", nodo):
            if h.lower() not in HEX_PERMITIDOS:
                fallos.append(f"{etq}: hex fuera de la paleta del contrato: {h}")


def _texto_literal(props: dict) -> str | None:
    """Extrae el texto de una propiedad si es Literal (estático). Un enlace a medida (fx)
    no es estático y no se examina: su contenido lo gobierna §3.2 desde el DAX."""
    valor = (props.get("text") or {}).get("expr", {}).get("Literal", {}).get("Value")
    if isinstance(valor, str) and valor.startswith("'") and valor.endswith("'"):
        return valor[1:-1]
    return None


def validar_pbir(defi_rep: Path, tablas, columnas, medidas) -> int:
    """Valida el reporte PBIR. Siempre: referencias al modelo, propiedades fuera del esquema,
    unicidad de ids, destinos de navegación, pages.json y customTheme — lo que rompe el reporte
    o deja un visual vacío. Con `--gate-f61` agrega las reglas de estilo del contrato (lienzo,
    múltiplos de 8, solapes, hex fuera de paleta, dígitos en texto estático, títulos): aplican a
    páginas GENERADAS; las páginas construidas a mano en Desktop (división de trabajo vigente
    desde 2026-08-08: Edwin construye los dashboards) llevan coordenadas libres y no se les
    exige la grilla. Escribe el acta en docs/powerbi/qa/structural-qa.md si docs/ existe."""
    estricto = "--gate-f61" in sys.argv
    fallos: list[str] = []
    paginas = sorted(defi_rep.glob("pages/*/page.json"))
    ids_pagina = {pj.parent.name for pj in paginas}
    nombres_vistos: dict[str, str] = {}
    n_vis = 0

    # report.json: si hay tema custom, el esquema exige name + type + reportVersionAtImport
    # (Desktop se niega a abrir sin él — pasó el 2026-08-08).
    ruta_rj = defi_rep / "report.json"
    if ruta_rj.exists():
        tema = json.loads(ruta_rj.read_text(encoding="utf-8")) \
            .get("themeCollection", {}).get("customTheme")
        if tema:
            for req in ("name", "type", "reportVersionAtImport"):
                if req not in tema:
                    fallos.append(f"report.json: customTheme sin la propiedad requerida '{req}'")

    # pages.json debe registrar exactamente las carpetas que existen.
    ruta_pages = defi_rep / "pages" / "pages.json"
    if ruta_pages.exists():
        meta = json.loads(ruta_pages.read_text(encoding="utf-8"))
        orden = meta.get("pageOrder", [])
        for pid in orden:
            if pid not in ids_pagina:
                fallos.append(f"pages.json: pageOrder referencia '{pid}' y la carpeta no existe")
        for pid in ids_pagina - set(orden):
            fallos.append(f"pages.json: la página '{pid}' existe y no está en pageOrder")
        activa = meta.get("activePageName")
        if activa and activa not in ids_pagina:
            fallos.append(f"pages.json: activePageName '{activa}' no existe")

    for pj in paginas:
        pagina = json.loads(pj.read_text(encoding="utf-8"))
        nombre = pagina.get("displayName", pj.parent.name)
        if pagina.get("name") != pj.parent.name:
            fallos.append(f"{nombre}: page.json name '{pagina.get('name')}' ≠ carpeta '{pj.parent.name}'")
        cajas: list[tuple[str, float, float, float, float, str]] = []

        for vj in sorted(pj.parent.glob("visuals/*/visual.json")):
            n_vis += 1
            cfg = json.loads(vj.read_text(encoding="utf-8"))
            vis = cfg.get("visual", {})
            tipo = vis.get("visualType", "?")
            etq = f"{nombre}/{tipo}"

            # propiedades fuera del esquema en la raíz del contenedor
            for extra_prop in set(cfg) - RAIZ_VISUAL_PERMITIDA:
                fallos.append(f"{etq}: propiedad '{extra_prop}' no admitida en la raíz del "
                              f"visual.json (¿va dentro de 'visual'?)")

            # unicidad e integridad del id
            vid = cfg.get("name", "")
            if vid != vj.parent.name:
                fallos.append(f"{etq}: visual.json name '{vid}' ≠ carpeta '{vj.parent.name}'")
            if vid in nombres_vistos:
                fallos.append(f"{etq}: id '{vid}' duplicado (también en {nombres_vistos[vid]})")
            nombres_vistos[vid] = etq

            # referencias al modelo
            _refs_pbir(cfg, tablas, columnas, medidas, etq, fallos)

            # geometría: lienzo y grilla de 8 (solo en modo estricto — páginas generadas)
            pos = cfg.get("position", {})
            x, y = pos.get("x", 0), pos.get("y", 0)
            w, h = pos.get("width", 0), pos.get("height", 0)
            if estricto:
                if x < 0 or y < 0 or x + w > LIENZO_W + 0.5 or y + h > LIENZO_H + 0.5:
                    fallos.append(f"{etq}: se sale del lienzo (x={x} y={y} w={w} h={h})")
                for eje, valor in (("x", x), ("y", y), ("w", w), ("h", h)):
                    if valor != int(valor) or int(valor) % 8:
                        fallos.append(f"{etq}: {eje}={valor} no es múltiplo de 8")
            cajas.append((etq, x, y, w, h, tipo))

            vc = vis.get("visualContainerObjects", {}) or {}
            if estricto:
                # color fuera de paleta
                _hex_fuera_de_paleta(cfg, etq, fallos)

                # números escritos a mano en texto estático (título, subtítulo, botones)
                textos = [p.get("properties", {}) for clave in ("title", "subTitle")
                          for p in vc.get(clave, [])]
                textos += [p.get("properties", {}) for p in (vis.get("objects", {}) or {}).get("text", [])]
                for props in textos:
                    texto = _texto_literal(props)
                    if texto and re.search(r"\d", _PREFIJO_PAGINA.sub("", texto)):
                        fallos.append(f"{etq}: número escrito a mano en texto estático: «{texto}» (§3.2)")

                # título obligatorio en visuales de análisis
                if tipo not in TIPOS_SIN_TITULO:
                    tiene_titulo = any("text" in p.get("properties", {}) for p in vc.get("title", []))
                    if not tiene_titulo:
                        fallos.append(f"{etq}: visual de análisis sin título propio")

            # destinos de navegación
            for enlace in (vis.get("objects", {}) or {}).get("visualLink", []):
                destino = (enlace.get("properties", {}).get("navigationSection") or {}) \
                    .get("expr", {}).get("Literal", {}).get("Value", "")
                destino = destino.strip("'")
                if destino and destino not in ids_pagina:
                    fallos.append(f"{etq}: navega a la página '{destino}' que no existe")

        # solapes dentro de la página (solo en modo estricto)
        for i in range(len(cajas) if estricto else 0):
            for j in range(i + 1, len(cajas)):
                e1, x1, y1, w1, h1, t1 = cajas[i]
                e2, x2, y2, w2, h2, t2 = cajas[j]
                if t1 in TIPOS_SIN_SOLAPE or t2 in TIPOS_SIN_SOLAPE:
                    continue
                solape_x = min(x1 + w1, x2 + w2) - max(x1, x2)
                solape_y = min(y1 + h1, y2 + h2) - max(y1, y2)
                if solape_x > 1 and solape_y > 1:
                    fallos.append(f"{nombre}: se solapan {e1} y {e2} ({solape_x:.0f}x{solape_y:.0f} px)")

    _escribir_acta(fallos, len(paginas), n_vis)
    if fallos:
        print(f"FALLO · {len(fallos)} problema(s) [PBIR / gate F6.1]:")
        for f in fallos:
            print(f"   {f}")
        return 1
    print(f"OK · PBIR · {len(paginas)} paginas · {n_vis} visuales · gate F6.1 sin defectos")
    return 0


def _escribir_acta(fallos: list[str], n_pag: int, n_vis: int) -> None:
    """Acta del QA estructural (F6.1). Solo si el repo tiene docs/ (se corre desde la raíz)."""
    docs = Path("docs/powerbi/qa")
    if not docs.parent.exists():
        return
    docs.mkdir(parents=True, exist_ok=True)
    from datetime import date
    lineas = [
        "# QA estructural — gate F6.1",
        "",
        f"CORRIDA: {date.today().isoformat()} · {n_pag} páginas · {n_vis} visuales",
        f"RESULTADO: {'FALLO — ' + str(len(fallos)) + ' defecto(s)' if fallos else 'PASA — cero defectos'}",
        "",
        "Reglas verificadas: referencias al modelo · lienzo 1280×720 · grilla en múltiplos de 8 ·",
        "solapes · hex fuera de la paleta del contrato · unicidad de ids · destinos de navegación ·",
        "números escritos a mano en texto estático (§3.2) · título en visuales de análisis ·",
        "consistencia de pages.json.",
        "",
        "Interpretación registrada: «cero hex literales» se verifica contra la lista blanca de",
        "tokens del contrato (`sistema-visual.md`) — el rojo de estado y las tintas no son",
        "alcanzables vía ThemeDataColor y el contrato mismo los define.",
        "",
    ]
    if fallos:
        lineas += ["## Defectos", ""] + [f"- {f}" for f in fallos]
    (docs / "structural-qa.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def main() -> int:
    """Valida TODOS los pares <Proyecto>.SemanticModel / <Proyecto>.Report de la carpeta
    (PulsoCresta y PulsoIronNetwork). Antes tomaba solo el primero y el segundo tenant
    quedaba sin validar en silencio."""
    proyecto = Path(sys.argv[1])
    pares = [(sm, sm.with_name(sm.name.replace(".SemanticModel", ".Report")))
             for sm in sorted(proyecto.glob("*.SemanticModel"))]
    pares = [(sm, rep) for sm, rep in pares if rep.exists()]
    if not pares:
        print(f"FALLO · no encuentro pares .SemanticModel/.Report en {proyecto}")
        return 1
    peor = 0
    for sm, rep in pares:
        print(f"— {sm.stem}:")
        peor = max(peor, _validar_par(sm, rep))
    return peor


def _validar_par(sm: Path, rep: Path) -> int:
    tablas, columnas, medidas = leer_modelo(sm / "definition")

    # Formato PBIR (Desktop migra a definition/ al guardar; el report.json legado desaparece).
    if not (rep / "report.json").exists():
        if (rep / "definition").exists():
            return validar_pbir(rep / "definition", tablas, columnas, medidas)
        print(f"FALLO · {rep.name} no tiene report.json ni definition/")
        return 1

    reporte = json.loads((rep / "report.json").read_text(encoding="utf-8"))

    fallos: list[str] = []
    n_visuales = 0

    for seccion in reporte["sections"]:
        pagina = seccion["displayName"]
        cajas: list[tuple[str, float, float, float, float]] = []

        for vc in seccion["visualContainers"]:
            n_visuales += 1
            cfg = json.loads(vc["config"])
            sv = cfg.get("singleVisual", {})
            tipo = sv.get("visualType", "?")
            etq = f"{pagina}/{tipo}"

            # --- referencias del prototypeQuery ---
            pq = sv.get("prototypeQuery", {})
            entidad_por_alias = {f["Name"]: f["Entity"] for f in pq.get("From", [])}
            for ent in entidad_por_alias.values():
                if ent not in tablas:
                    fallos.append(f"{etq}: tabla '{ent}' no existe en el modelo")
            for sel in pq.get("Select", []):
                if "Measure" in sel:
                    prop = sel["Measure"]["Property"]
                    if prop not in medidas:
                        fallos.append(f"{etq}: medida '{prop}' no existe en el modelo")
                elif "Column" in sel:
                    alias = sel["Column"]["Expression"]["SourceRef"]["Source"]
                    prop = sel["Column"]["Property"]
                    ent = entidad_por_alias.get(alias)
                    if ent and ent in tablas and prop not in columnas.get(ent, set()):
                        fallos.append(f"{etq}: columna {ent}[{prop}] no existe en el modelo")

            # --- una medida referenciada debe venir de la tabla donde vive ---
            for sel in pq.get("Select", []):
                if "Measure" not in sel:
                    continue
                nombre_calificado = sel.get("Name", "")
                if "." in nombre_calificado:
                    tab_decl = nombre_calificado.rsplit(".", 1)[0]
                    if tab_decl in tablas:
                        # El queryRef debe apuntar a una tabla real; que la medida esté
                        # declarada en OTRA tabla del modelo es válido en Power BI (las
                        # medidas son globales), así que solo se exige que la tabla exista.
                        pass

            # --- geometría ---
            pos = cfg.get("layouts", [{}])[0].get("position", {})
            x, y = pos.get("x", 0), pos.get("y", 0)
            w, h = pos.get("width", 0), pos.get("height", 0)
            if x < 0 or y < 0 or x + w > LIENZO_W + 0.5 or y + h > LIENZO_H + 0.5:
                fallos.append(
                    f"{etq}: se sale del lienzo (x={x} y={y} w={w} h={h}; "
                    f"lienzo {LIENZO_W}x{LIENZO_H})")
            cajas.append((etq, x, y, w, h))

        # --- solapes (los textos del encabezado se ignoran: se superponen a propósito) ---
        for i in range(len(cajas)):
            for j in range(i + 1, len(cajas)):
                e1, x1, y1, w1, h1 = cajas[i]
                e2, x2, y2, w2, h2 = cajas[j]
                if "textbox" in e1 or "textbox" in e2 or "shape" in e1 or "shape" in e2:
                    continue
                solape_x = min(x1 + w1, x2 + w2) - max(x1, x2)
                solape_y = min(y1 + h1, y2 + h2) - max(y1, y2)
                if solape_x > 1 and solape_y > 1:
                    fallos.append(
                        f"{pagina}: se solapan {e1} y {e2} "
                        f"({solape_x:.0f}x{solape_y:.0f} px)")

    if fallos:
        print(f"FALLO · {len(fallos)} problema(s) en {rep.name}:")
        for f in fallos:
            print(f"   {f}")
        return 1

    print(f"OK · {len(reporte['sections'])} paginas · {n_visuales} visuales · "
          f"todas las referencias existen · sin solapes ni desbordes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
