"""Genera el inventario del modelo semántico leyendo el TMDL publicado.

No consulta la base: describe lo que el PBIP realmente contiene, que es lo que Desktop va a
cargar. Se regenera después de cada corrida de `generar_pbip.py` para tener una foto del
modelo comparable entre versiones.

Uso:  python inventario_modelo.py <carpeta .SemanticModel> <archivo .md de salida>
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path


def leer_modelo(defi: Path) -> tuple[dict, list[dict]]:
    """Devuelve (tablas, relaciones). Cada tabla: columnas, medidas y sus metadatos."""
    tablas: dict[str, dict] = {}
    for f in sorted((defi / "tables").glob("*.tmdl")):
        nombre = ""
        lineas = f.read_text(encoding="utf-8").split("\n")
        comentario_pendiente = ""
        for linea in lineas:
            s = linea.strip()
            m = re.match(r"^table\s+('([^']+)'|\S+)", s)
            if m:
                nombre = m.group(2) or m.group(1)
                tablas[nombre] = {"columnas": [], "medidas": [], "jerarquias": [],
                                  "es_grupo_calculo": False}
                continue
            if not nombre:
                continue
            if s.startswith("calculationGroup"):
                tablas[nombre]["es_grupo_calculo"] = True
            m = re.match(r"^column\s+('([^']+)'|\S+)", s)
            if m:
                tablas[nombre]["columnas"].append(m.group(2) or m.group(1))
            m = re.match(r"^hierarchy\s+('([^']+)'|\S+)", s)
            if m:
                tablas[nombre]["jerarquias"].append(m.group(2) or m.group(1))
            m = re.match(r"^measure\s+('([^']+)'|[^\s=]+)", s)
            if m:
                tablas[nombre]["medidas"].append({
                    "nombre": m.group(2) or m.group(1),
                    "descripcion": comentario_pendiente,
                    "carpeta": "",
                })
            if s.startswith("displayFolder:") and tablas[nombre]["medidas"]:
                tablas[nombre]["medidas"][-1]["carpeta"] = s.split(":", 1)[1].strip()
            # El comentario /// va SIEMPRE en la línea anterior al measure.
            comentario_pendiente = s[3:].strip() if s.startswith("///") else ""

    relaciones: list[dict] = []
    ruta_rel = defi / "relationships.tmdl"
    if ruta_rel.exists():
        actual: dict = {}
        for linea in ruta_rel.read_text(encoding="utf-8").split("\n"):
            s = linea.strip()
            if s.startswith("relationship "):
                if actual:
                    relaciones.append(actual)
                actual = {"nombre": s.split()[1], "activa": True, "bidireccional": False}
            elif s.startswith("fromColumn:"):
                actual["desde"] = s.split(":", 1)[1].strip()
            elif s.startswith("toColumn:"):
                actual["hacia"] = s.split(":", 1)[1].strip()
            elif s.startswith("isActive:") and "false" in s:
                actual["activa"] = False
            elif "bothDirections" in s:
                actual["bidireccional"] = True
        if actual:
            relaciones.append(actual)
    return tablas, relaciones


def rol(nombre: str) -> str:
    return nombre[:3] if nombre[:3] in ("DM_", "FC_", "MD_") else "otro"


def generar(defi: Path) -> str:
    tablas, relaciones = leer_modelo(defi)
    total_col = sum(len(t["columnas"]) for t in tablas.values())
    total_med = sum(len(t["medidas"]) for t in tablas.values())
    sin_desc = [(n, m["nombre"]) for n, t in tablas.items()
                for m in t["medidas"] if not m["descripcion"]]
    por_rol: dict[str, list[str]] = defaultdict(list)
    for n in tablas:
        por_rol[rol(n)].append(n)

    out: list[str] = []
    a = out.append
    a("# Inventario del modelo semántico\n")
    a("_Generado por `inventario_modelo.py` desde el TMDL publicado. No editar a mano._\n")
    a(f"**{len(tablas)} tablas** · **{total_col} columnas** · **{total_med} medidas** · "
      f"**{len(relaciones)} relaciones**\n")

    a("\n## Tablas por rol\n")
    etiqueta = {"DM_": "Dimensiones", "FC_": "Hechos", "MD_": "Solo medidas", "otro": "Otras"}
    for pref in ("DM_", "FC_", "MD_", "otro"):
        nombres = sorted(por_rol.get(pref, []))
        if not nombres:
            continue
        a(f"\n### {etiqueta[pref]} ({len(nombres)})\n")
        a("| Tabla | Columnas | Medidas | Jerarquías |")
        a("|---|---:|---:|---|")
        for n in nombres:
            t = tablas[n]
            jer = ", ".join(t["jerarquias"]) or "—"
            a(f"| {n} | {len(t['columnas'])} | {len(t['medidas'])} | {jer} |")

    a("\n## Relaciones\n")
    inactivas = [r for r in relaciones if not r["activa"]]
    bidi = [r for r in relaciones if r["bidireccional"]]
    a(f"- Total: **{len(relaciones)}**")
    a(f"- Inactivas (para `USERELATIONSHIP`): **{len(inactivas)}**")
    a(f"- Bidireccionales: **{len(bidi)}**\n")
    if inactivas:
        a("\n**Inactivas**\n")
        for r in inactivas:
            a(f"- `{r['nombre']}` · {r.get('desde','?')} → {r.get('hacia','?')}")
    if bidi:
        a("\n**Bidireccionales**\n")
        for r in bidi:
            a(f"- `{r['nombre']}` · {r.get('desde','?')} → {r.get('hacia','?')}")

    a("\n## Medidas por carpeta\n")
    for n in sorted(tablas):
        t = tablas[n]
        if not t["medidas"]:
            continue
        a(f"\n### {n} ({len(t['medidas'])})\n")
        carpetas: dict[str, list[dict]] = defaultdict(list)
        for m in t["medidas"]:
            carpetas[m["carpeta"] or "(sin carpeta)"].append(m)
        for carpeta in sorted(carpetas):
            a(f"\n**{carpeta}**\n")
            for m in carpetas[carpeta]:
                if m["descripcion"]:
                    a(f"- **{m['nombre']}** — {m['descripcion']}")
                else:
                    a(f"- **{m['nombre']}** — ⚠ sin descripción")

    a("\n## Medidas sin descripción\n")
    if not sin_desc:
        a("Ninguna: las {} medidas están documentadas.".format(total_med))
    else:
        a(f"**{len(sin_desc)} de {total_med}.** La descripción `///` es lo único que el usuario "
          "final ve al pasar el cursor sobre el campo, y lo que permite que un agente genere "
          "DAX correcto contra el modelo.\n")
        por_tabla: dict[str, list[str]] = defaultdict(list)
        for tabla, medida in sin_desc:
            por_tabla[tabla].append(medida)
        for tabla in sorted(por_tabla):
            a(f"\n**{tabla}** ({len(por_tabla[tabla])})\n")
            for medida in por_tabla[tabla]:
                a(f"- {medida}")
    return "\n".join(out) + "\n"


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    defi = Path(sys.argv[1]) / "definition"
    if not defi.exists():
        print(f"no existe {defi}")
        return 1
    salida = Path(sys.argv[2])
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(generar(defi), encoding="utf-8")
    print(f"OK - inventario escrito en {salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
