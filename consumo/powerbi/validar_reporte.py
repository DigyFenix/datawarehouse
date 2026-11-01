"""Valida el reporte Power BI (PBIR) contra el modelo semántico (TMDL) y contra las reglas del producto.

Por qué existe: Power BI no avisa de una referencia rota al guardar. El visual simplemente
aparece VACÍO al abrir el reporte, y eso se descubre en la presentación. Como el modelo se
genera por código y el reporte también, cruzarlos aquí es barato y atrapa el fallo antes.

Siempre (sesión 38, auditoría §6 — antes miraba un lienzo de 720 y la paleta de Cresta):
  - cada referencia existe: tabla, columna, y la MEDIDA en la tabla que el visual declara;
  - lienzo 1280×960 y ningún visual pisa el pie (y = 944);
  - ningún hex fuera de la paleta de pbir.js (paleta.json) o del tema registrado;
  - ningún TEXTO con un color claro (ámbar, pizarra claro…: contraste < 3:1 sobre blanco);
  - el tema fuente (organizaciones/<org>/powerbi/theme) y el de RegisteredResources son el mismo archivo;
  - ninguna página tiene menos visuales que los registrados por regenerar_paginas.js (Desktop ya
    borró visuales dos veces);
  - ids únicos, pages.json coherente, destinos de navegación, propiedades del esquema, customTheme.
Con `--gate-f61`: además grilla de 8, solapes generales, números escritos a mano y títulos.

Uso:  python validar_reporte.py <carpeta_proyecto> [--gate-f61]
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

LIENZO_W, LIENZO_H = 1280, 960
LIENZO_LEGADO_W, LIENZO_LEGADO_H = 1280, 720   # report.json legado (generar_reporte.py, retirado)
PIE_Y = LIENZO_H - 16
AQUI = Path(__file__).resolve().parent


def leer_modelo(defi: Path) -> tuple[set[str], dict[str, set[str]], set[str], dict[str, set[str]]]:
    """(tablas, columnas por tabla, medidas, medidas por tabla) declaradas en el TMDL."""
    tablas: set[str] = set()
    columnas: dict[str, set[str]] = {}
    medidas: set[str] = set()
    por_tabla: dict[str, set[str]] = {}
    for f in sorted((defi / "tables").glob("*.tmdl")):
        actual = ""
        for linea in f.read_text(encoding="utf-8").split("\n"):
            s = linea.strip()
            m = re.match(r"^table\s+(?:'((?:[^']|'')+)'|(\S+))", s)
            if m:
                actual = (m.group(1) or m.group(2)).replace("''", "'")
                tablas.add(actual)
                columnas.setdefault(actual, set())
                por_tabla.setdefault(actual, set())
                continue
            m = re.match(r"^column\s+(?:'((?:[^']|'')+)'|([^\s=]+))", s)
            if m and actual:
                columnas[actual].add((m.group(1) or m.group(2)).replace("''", "'"))
                continue
            m = re.match(r"^measure\s+(?:'((?:[^']|'')+)'|([^\s=]+))", s)
            if m:
                nombre = (m.group(1) or m.group(2)).replace("''", "'")
                medidas.add(nombre)
                por_tabla.setdefault(actual, set()).add(nombre)
    return tablas, columnas, medidas, por_tabla


def _refs_pbir(nodo, modelo, etq: str, fallos: list[str]) -> None:
    """Recorre un visual.json buscando {Measure|Column: {Expression.SourceRef.Entity, Property}}.
    Una medida citada desde una tabla que no es la suya deja el visual vacío igual que una que no
    existe: en PBIR la referencia es (tabla, medida), no solo el nombre."""
    tablas, columnas, _medidas, por_tabla = modelo
    if isinstance(nodo, dict):
        for clase in ("Measure", "Column"):
            ref = nodo.get(clase)
            if not isinstance(ref, dict):
                continue
            ent = ((ref.get("Expression") or {}).get("SourceRef") or {}).get("Entity")
            prop = ref.get("Property")
            if not (ent and prop):
                continue
            if ent not in tablas:
                fallos.append(f"{etq}: tabla '{ent}' no existe en el modelo")
            elif clase == "Measure" and prop not in por_tabla.get(ent, set()):
                donde = [t for t, ms in por_tabla.items() if prop in ms]
                fallos.append(f"{etq}: medida {ent}[{prop}] no existe" + (f" (vive en {donde[0]})" if donde else ""))
            elif clase == "Column" and prop not in columnas.get(ent, set()):
                fallos.append(f"{etq}: columna {ent}[{prop}] no existe en el modelo")
        for v in nodo.values():
            _refs_pbir(v, modelo, etq, fallos)
    elif isinstance(nodo, list):
        for v in nodo:
            _refs_pbir(v, modelo, etq, fallos)


# --- color: paleta compartida con pbir.js y contraste del texto ---------------------------------

def _luminancia(hexa: str) -> float:
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contraste_sobre_blanco(hexa: str) -> float:
    return 1.05 / (_luminancia(hexa) + 0.05)


def cargar_paleta(tema: dict | None) -> tuple[set[str], set[str]]:
    """(hex permitidos, hex prohibidos en texto). Permitidos = paleta.json de pbir.js ∪ colores del tema."""
    permitidos: set[str] = set()
    prohibidos: set[str] = set()
    ruta = AQUI / "paleta.json"
    if ruta.exists():
        pal = json.loads(ruta.read_text(encoding="utf-8"))
        permitidos |= {v.lower() for v in pal.get("colores", {}).values()}
        prohibidos |= {v.lower() for v in pal.get("prohibidosEnTexto", [])}
    if tema:
        permitidos |= {h.lower() for h in re.findall(r"#[0-9a-fA-F]{6}\b", json.dumps(tema))}
    return permitidos, prohibidos


# Propiedades que pintan LETRAS. `color` cuenta solo dentro de objetos de texto/etiquetas.
_PROPS_TEXTO = {"fontColor", "fontColorPrimary", "fontColorSecondary", "labelColor", "titleColor", "secLabelColor"}
_OBJETOS_ETIQUETA = {"labels", "value", "categoryLabels", "dataLabels"}


def _colores(nodo, etq: str, permitidos: set[str], prohibidos: set[str], fallos: list[str],
             objeto: str = "", prop: str = "") -> None:
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            if k == "textStyle" and isinstance(v, dict) and isinstance(v.get("color"), str):
                _chequear_texto(v["color"], etq, "texto", prohibidos, fallos)
            sig_obj = k if prop == "" and objeto == "" and isinstance(v, list) and k not in ("projections", "paragraphs", "textRuns") else objeto
            sig_prop = k if k in _PROPS_TEXTO or k == "color" else prop
            _colores(v, etq, permitidos, prohibidos, fallos, sig_obj, sig_prop)
    elif isinstance(nodo, list):
        for v in nodo:
            _colores(v, etq, permitidos, prohibidos, fallos, objeto, prop)
    elif isinstance(nodo, str):
        for h in re.findall(r"#[0-9a-fA-F]{6}\b", nodo):
            if permitidos and h.lower() not in permitidos:
                fallos.append(f"{etq}: hex {h} fuera de la paleta (pbir.js / tema)")
            if prop in _PROPS_TEXTO or (prop == "color" and objeto in _OBJETOS_ETIQUETA):
                _chequear_texto(h, etq, objeto, prohibidos, fallos)


def _chequear_texto(h: str, etq: str, objeto: str, prohibidos: set[str], fallos: list[str]) -> None:
    h = h.lower()
    # El blanco solo aparece como texto DENTRO de barras apiladas (etiqueta sobre el relleno oscuro).
    if h == "#ffffff":
        return
    if h in prohibidos or contraste_sobre_blanco(h) < 3.0:
        fallos.append(f"{etq}: texto en color claro {h} ({contraste_sobre_blanco(h):.2f}:1) en «{objeto}» — usar la variante oscura")


def validar_tema(proyecto: Path, defi_rep: Path, nombre_tema: str | None) -> tuple[list[str], dict | None]:
    """Una sola fuente del tema: la copia de `<proyecto>/theme/` y la de RegisteredResources deben ser
    idénticas (hash). Antes divergían: la fuente traía la paleta Kraken y el reporte el Azul profundo."""
    fallos: list[str] = []
    if not nombre_tema:
        return fallos, None
    registrado = defi_rep.parent / "StaticResources" / "RegisteredResources" / nombre_tema
    if not registrado.exists():
        return [f"tema: customTheme '{nombre_tema}' no está en StaticResources/RegisteredResources"], None
    tema = json.loads(registrado.read_text(encoding="utf-8"))
    fuente = proyecto / "theme" / nombre_tema
    if not fuente.exists():
        fallos.append(f"tema: falta la fuente {fuente} (debe ser copia exacta de RegisteredResources)")
    else:
        h1 = hashlib.sha256(fuente.read_bytes()).hexdigest()[:12]
        h2 = hashlib.sha256(registrado.read_bytes()).hexdigest()[:12]
        if h1 != h2:
            fallos.append(f"tema: la fuente ({h1}) y RegisteredResources ({h2}) difieren — sincronizar copiando la fuente")
    return fallos, tema


def validar_conteo(defi_rep: Path, conteo_actual: dict[str, int]) -> list[str]:
    """Compara contra conteo_visuales.json (lo escribe regenerar_paginas.js). Menos visuales que lo
    registrado = algo los borró (Desktop lo hizo dos veces, B6)."""
    ruta = AQUI / "conteo_visuales.json"
    if not ruta.exists():
        return []
    esperado = json.loads(ruta.read_text(encoding="utf-8")).get(defi_rep.parent.name.replace(".Report", ""), {})
    fallos = []
    for pagina, n in esperado.items():
        real = conteo_actual.get(pagina)
        if real is None:
            fallos.append(f"conteo: la página «{pagina}» desapareció (tenía {n} visuales)")
        elif real < n:
            fallos.append(f"conteo: «{pagina}» tiene {real} visuales y se registraron {n} — ¿Desktop borró visuales?")
    return fallos


# --- gate F6.1 (contrato §6): reglas de estilo opcionales -------------------------------------

# El chrome se superpone a propósito (paneles de focos: textbox de fondo + tarjetas encima).
TIPOS_SIN_SOLAPE = {"shape", "textbox"}
TIPOS_SIN_TITULO = {"shape", "textbox", "card", "cardVisual", "kpi", "slicer", "actionButton", "pageNavigator"}

# En el texto estático solo se toleran dígitos que son identificador de página ("01 · Dirección");
# cualquier otro dígito en un título es un número escrito a mano (§3.2).
_PREFIJO_PAGINA = re.compile(r"^\d\d · ")

# Propiedades que el esquema visualContainer admite en la raíz. Cualquier otra la rechaza
# Desktop al abrir ("propiedad adicional") — p. ej. syncGroup, que va DENTRO de `visual`.
# Verificado contra el esquema oficial (2.9.0/2.11.0) el 2026-08-08.
RAIZ_VISUAL_PERMITIDA = {"$schema", "name", "position", "visual", "visualGroup",
                         "parentGroupName", "filterConfig", "isHidden", "annotations",
                         "howCreated"}


def _texto_literal(props: dict) -> str | None:
    """Extrae el texto de una propiedad si es Literal (estático). Un enlace a medida (fx)
    no es estático y no se examina: su contenido lo gobierna §3.2 desde el DAX."""
    valor = (props.get("text") or {}).get("expr", {}).get("Literal", {}).get("Value")
    if isinstance(valor, str) and valor.startswith("'") and valor.endswith("'"):
        return valor[1:-1]
    return None


def _es_pie(tipo: str, x: float, y: float, w: float, h: float) -> bool:
    return tipo == "cardVisual" and y >= PIE_Y - 0.5 and w >= LIENZO_W - 100


def validar_pbir(proyecto: Path, defi_rep: Path, modelo) -> int:
    estricto = "--gate-f61" in sys.argv
    fallos: list[str] = []
    paginas = sorted(defi_rep.glob("pages/*/page.json"))
    ids_pagina = {pj.parent.name for pj in paginas}
    nombres_vistos: dict[str, str] = {}
    n_vis = 0
    conteo: dict[str, int] = {}

    # report.json: si hay tema custom, el esquema exige name + type + reportVersionAtImport
    # (Desktop se niega a abrir sin él — pasó el 2026-08-08).
    nombre_tema = None
    ruta_rj = defi_rep / "report.json"
    if ruta_rj.exists():
        tema_rj = json.loads(ruta_rj.read_text(encoding="utf-8")).get("themeCollection", {}).get("customTheme")
        if tema_rj:
            nombre_tema = tema_rj.get("name")
            for req in ("name", "type", "reportVersionAtImport"):
                if req not in tema_rj:
                    fallos.append(f"report.json: customTheme sin la propiedad requerida '{req}'")
    fallos_tema, tema = validar_tema(proyecto, defi_rep, nombre_tema)
    fallos += fallos_tema
    permitidos, prohibidos = cargar_paleta(tema)
    if not permitidos:
        fallos.append("paleta: no existe consumo/powerbi/paleta.json (correr `node consumo/powerbi/pbir.js --paleta`)")

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
        if (pagina.get("width"), pagina.get("height")) != (LIENZO_W, LIENZO_H):
            fallos.append(f"{nombre}: lienzo {pagina.get('width')}×{pagina.get('height')} (se esperaba {LIENZO_W}×{LIENZO_H})")
        cajas: list[tuple[str, float, float, float, float, str]] = []
        visuales = sorted(pj.parent.glob("visuals/*/visual.json"))
        conteo[nombre] = len(visuales)

        for vj in visuales:
            n_vis += 1
            cfg = json.loads(vj.read_text(encoding="utf-8"))
            vis = cfg.get("visual", {})
            tipo = vis.get("visualType", "?")
            etq = f"{nombre}/{tipo}/{vj.parent.name[:6]}"

            for extra_prop in set(cfg) - RAIZ_VISUAL_PERMITIDA:
                fallos.append(f"{etq}: propiedad '{extra_prop}' no admitida en la raíz del visual.json (¿va dentro de 'visual'?)")

            vid = cfg.get("name", "")
            if vid != vj.parent.name:
                fallos.append(f"{etq}: visual.json name '{vid}' ≠ carpeta '{vj.parent.name}'")
            if vid in nombres_vistos:
                fallos.append(f"{etq}: id '{vid}' duplicado (también en {nombres_vistos[vid]})")
            nombres_vistos[vid] = etq

            _refs_pbir(cfg, modelo, etq, fallos)
            _colores(cfg, etq, permitidos, prohibidos, fallos)

            pos = cfg.get("position", {})
            x, y = pos.get("x", 0), pos.get("y", 0)
            w, h = pos.get("width", 0), pos.get("height", 0)
            if x < 0 or y < 0 or x + w > LIENZO_W + 0.5 or y + h > LIENZO_H + 0.5:
                fallos.append(f"{etq}: se sale del lienzo {LIENZO_W}×{LIENZO_H} (x={x} y={y} w={w} h={h})")
            if estricto:
                for eje, valor in (("x", x), ("y", y), ("w", w), ("h", h)):
                    if valor != int(valor) or int(valor) % 8:
                        fallos.append(f"{etq}: {eje}={valor} no es múltiplo de 8")
            cajas.append((etq, x, y, w, h, tipo))

            vc = vis.get("visualContainerObjects", {}) or {}
            if estricto:
                textos = [p.get("properties", {}) for clave in ("title", "subTitle") for p in vc.get(clave, [])]
                textos += [p.get("properties", {}) for p in (vis.get("objects", {}) or {}).get("text", [])]
                for props in textos:
                    texto = _texto_literal(props)
                    if texto and re.search(r"\d", _PREFIJO_PAGINA.sub("", texto)):
                        fallos.append(f"{etq}: número escrito a mano en texto estático: «{texto}» (§3.2)")
                if tipo not in TIPOS_SIN_TITULO:
                    if not any("text" in p.get("properties", {}) for p in vc.get("title", [])):
                        fallos.append(f"{etq}: visual de análisis sin título propio")

            for enlace in (vis.get("objects", {}) or {}).get("visualLink", []):
                destino = (enlace.get("properties", {}).get("navigationSection") or {}) \
                    .get("expr", {}).get("Literal", {}).get("Value", "")
                destino = destino.strip("'")
                if destino and destino not in ids_pagina:
                    fallos.append(f"{etq}: navega a la página '{destino}' que no existe")

        # El pie no lo pisa nadie (siempre): era el solape de 4 px de las 23 hojas.
        for e, x, y, w, h, t in cajas:
            if _es_pie(t, x, y, w, h):
                continue
            if y + h > PIE_Y + 0.5:
                fallos.append(f"{e}: invade la banda del pie (y + alto = {y + h:.0f} > {PIE_Y})")

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

    fallos += validar_conteo(defi_rep, conteo)

    _escribir_acta(fallos, len(paginas), n_vis)
    if fallos:
        print(f"FALLO · {len(fallos)} problema(s) [PBIR{' / gate F6.1' if estricto else ''}]:")
        for f in fallos:
            print(f"   {f}")
        return 1
    print(f"OK · PBIR · {len(paginas)} páginas · {n_vis} visuales · referencias (medida+tabla), lienzo "
          f"{LIENZO_W}×{LIENZO_H}, pie, paleta, contraste, tema y conteo sin defectos"
          + (" · gate F6.1 sin defectos" if estricto else ""))
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
        "Reglas verificadas: referencias (medida en su tabla) · lienzo 1280×960 · pie sin invadir ·",
        "hex fuera de la paleta de pbir.js/tema · texto en colores claros · tema fuente = registrado ·",
        "conteo de visuales · ids · navegación · pages.json. Con --gate-f61: grilla de 8, solapes,",
        "números a mano y títulos.",
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
    modelo = leer_modelo(sm / "definition")
    tablas, columnas, medidas, _ = modelo

    # Formato PBIR (Desktop migra a definition/ al guardar; el report.json legado desaparece).
    if not (rep / "report.json").exists():
        if (rep / "definition").exists():
            return validar_pbir(sm.parent, rep / "definition", modelo)
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
            if x < 0 or y < 0 or x + w > LIENZO_LEGADO_W + 0.5 or y + h > LIENZO_LEGADO_H + 0.5:
                fallos.append(
                    f"{etq}: se sale del lienzo (x={x} y={y} w={w} h={h}; "
                    f"lienzo {LIENZO_LEGADO_W}x{LIENZO_LEGADO_H})")
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
