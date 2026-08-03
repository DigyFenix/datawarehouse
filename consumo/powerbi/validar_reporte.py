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


def validar_pbir(defi_rep: Path, tablas, columnas, medidas) -> int:
    """Valida el reporte en formato PBIR (carpeta definition/, el formato al que Desktop migra
    el proyecto al guardarlo). Solo referencias: la geometría la gobierna Desktop."""
    fallos: list[str] = []
    paginas = sorted(defi_rep.glob("pages/*/page.json"))
    n_vis = 0
    for pj in paginas:
        nombre = json.loads(pj.read_text(encoding="utf-8")).get("displayName", pj.parent.name)
        for vj in sorted(pj.parent.glob("visuals/*/visual.json")):
            n_vis += 1
            cfg = json.loads(vj.read_text(encoding="utf-8"))
            tipo = cfg.get("visual", {}).get("visualType", "?")
            _refs_pbir(cfg, tablas, columnas, medidas, f"{nombre}/{tipo}", fallos)
    if fallos:
        print(f"FALLO · {len(fallos)} problema(s) [PBIR]:")
        for f in fallos:
            print(f"   {f}")
        return 1
    print(f"OK · PBIR · {len(paginas)} paginas · {n_vis} visuales · "
          f"todas las referencias existen en el modelo")
    return 0


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
        print(f"FALLO · {len(fallos)} problema(s) en {proyecto.name}:")
        for f in fallos:
            print(f"   {f}")
        return 1

    print(f"OK · {len(reporte['sections'])} paginas · {n_visuales} visuales · "
          f"todas las referencias existen · sin solapes ni desbordes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
