"""
Agrega el logo de la organización al encabezado de todas las páginas de un reporte PBIR,
SIN regenerar las páginas (respeta los ajustes hechos a mano en Desktop).

Uso:
    python consumo/powerbi/agregar_logo.py <ruta .Report> <logo.png> [--alto 40]

Qué hace (idempotente):
  1. Copia el PNG a StaticResources/RegisteredResources/<nombre> y lo registra en report.json.
  2. En cada página agrega un visual de imagen arriba a la derecha (alto fijo, ancho por proporción),
     con id determinista (re-ejecutar lo reescribe, no lo duplica).
  3. Achica el texto «Empresa activa» para que termine 16 px antes del logo.

Cerrar Power BI Desktop antes de correrlo: si queda abierto, al guardar pisa estos archivos.
"""
import argparse
import hashlib
import json
import shutil
import struct
import sys
from pathlib import Path

VC_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json'
MARGEN_DERECHO = 24   # mismo margen de la grilla de pbir.js (xCol(1) = 24)
Y_LOGO = 8            # encabezado de 56 px: el logo va centrado con el título
SEPARACION = 16


def id_visual(*partes: str) -> str:
    """Mismo esquema de ids que pbir.js: sha1('quilate:' + partes) truncado a 20."""
    return hashlib.sha1(('quilate:' + ':'.join(partes)).encode('utf-8')).hexdigest()[:20]


def tamano_png(ruta: Path) -> tuple[int, int]:
    with ruta.open('rb') as f:
        cabecera = f.read(24)
    if cabecera[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'{ruta} no es un PNG')
    return struct.unpack('>II', cabecera[16:24])


def leer(ruta: Path) -> dict:
    return json.loads(ruta.read_text(encoding='utf-8'))


def escribir(ruta: Path, datos: dict) -> None:
    ruta.write_text(json.dumps(datos, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def registrar_recurso(report: Path, logo: Path) -> str:
    destino_dir = report / 'StaticResources' / 'RegisteredResources'
    destino_dir.mkdir(parents=True, exist_ok=True)
    nombre = logo.name
    shutil.copyfile(logo, destino_dir / nombre)

    ruta_report = report / 'definition' / 'report.json'
    rj = leer(ruta_report)
    paquetes = rj.setdefault('resourcePackages', [])
    registrado = next((p for p in paquetes if p.get('name') == 'RegisteredResources'), None)
    if registrado is None:
        registrado = {'name': 'RegisteredResources', 'type': 'RegisteredResources', 'items': []}
        paquetes.append(registrado)
    items = registrado.setdefault('items', [])
    if not any(i.get('name') == nombre for i in items):
        items.append({'name': nombre, 'path': nombre, 'type': 'Image'})
    escribir(ruta_report, rj)
    return nombre


def visual_logo(pagina: str, nombre_recurso: str, pos: dict) -> dict:
    lit = lambda v: {'expr': {'Literal': {'Value': v}}}
    sin = lambda: [{'properties': {'show': lit('false')}}]
    return {
        '$schema': VC_SCHEMA,
        'name': id_visual('chrome-logo', pagina),
        'position': pos,
        'visual': {
            'visualType': 'image',
            'objects': {
                'general': [{'properties': {'imageUrl': {'expr': {'ResourcePackageItem': {
                    'PackageName': 'RegisteredResources', 'PackageType': 1, 'ItemName': nombre_recurso,
                }}}}}],
                'imageScaling': [{'properties': {'imageScalingType': lit("'Fit'")}}],
            },
            'visualContainerObjects': {'title': sin(), 'background': sin(), 'border': sin(), 'dropShadow': sin()},
            'drillFilterOtherVisuals': True,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('report', type=Path)
    ap.add_argument('logo', type=Path)
    ap.add_argument('--alto', type=int, default=40)
    a = ap.parse_args()

    paginas_dir = a.report / 'definition' / 'pages'
    if not paginas_dir.is_dir():
        print(f'FALLO · {a.report} no es un .Report en formato PBIR', file=sys.stderr)
        return 1
    ancho_png, alto_png = tamano_png(a.logo)
    ancho = round(a.alto * ancho_png / alto_png)
    recurso = registrar_recurso(a.report, a.logo)

    orden = leer(paginas_dir / 'pages.json')['pageOrder']
    for pagina in orden:
        pdir = paginas_dir / pagina
        ancho_pagina = leer(pdir / 'page.json').get('width', 1280)
        x_logo = ancho_pagina - MARGEN_DERECHO - ancho
        visuales = [(v, leer(v / 'visual.json')) for v in (pdir / 'visuals').iterdir() if (v / 'visual.json').exists()]
        mio = id_visual('chrome-logo', pagina)
        otros = [j for v, j in visuales if v.name != mio]
        z = max((j['position'].get('z', 0) for j in otros), default=0) + 1
        tab = max((j['position'].get('tabOrder', 0) for j in otros), default=0) + 1

        empresa = [(v, j) for v, j in visuales if 'Empresa activa' in json.dumps(j.get('visual', {}).get('query', {}), ensure_ascii=False)]
        for v, j in empresa:
            j['position']['width'] = x_logo - SEPARACION - j['position']['x']
            escribir(v / 'visual.json', j)

        pos = {'x': x_logo, 'y': Y_LOGO, 'z': z, 'height': a.alto, 'width': ancho, 'tabOrder': tab}
        vdir = pdir / 'visuals' / mio
        vdir.mkdir(exist_ok=True)
        escribir(vdir / 'visual.json', visual_logo(pagina, recurso, pos))
        print(f'  {pagina} · logo {ancho}×{a.alto} en x={x_logo} · empresa ajustada: {len(empresa)}')
    print(f'OK · {len(orden)} páginas · recurso {recurso}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
