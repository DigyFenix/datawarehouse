"""Genera un proyecto Power BI (PBIP) con el modelo semántico en TMDL desde el esquema `oro`.

Se introspecciona la base en vez de escribir 17 archivos a mano: los tipos, nombres y columnas
salen del modelo real, así que el PBIP no puede quedar desincronizado del warehouse.

Uso:  python generar_pbip.py <base> <nombre_proyecto> <carpeta_salida>
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

for _p in [Path.cwd(), *Path.cwd().parents]:
    if (_p / ".env").exists():
        load_dotenv(_p / ".env")
        break

# Nivel mínimo que exige el modelo generado. Es un PISO, no un valor fijo: Desktop migra el
# proyecto al nivel que soporta en cuanto lo abre y bajarlo en la siguiente corrida deja un
# diff perpetuo y puede romper medidas que usen funciones del nivel nuevo. Ver escribir_conservando.
COMPATIBILITY_LEVEL_MINIMO = 1567


def escribir_conservando(ruta: Path, base: dict, claves_propias: tuple[str, ...] = ()) -> None:
    """Escribe un JSON de proyecto sin pisar lo que Power BI Desktop haya migrado.

    Desktop reescribe estos archivos al guardar: agrega `$schema` y sube `version` al esquema
    vigente. Regenerar el modelo NO debe deshacer eso — es una regresión de formato, la misma
    clase de cambio que ya borró los visuales hechos a mano dos veces. Del archivo existente se
    conserva todo, y solo se imponen las claves que este generador es dueño de definir
    (`claves_propias`), porque apuntan a rutas que él controla.
    """
    contenido = base
    if ruta.exists():
        try:
            contenido = json.loads(ruta.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"  [!] {ruta.name} ilegible — se reescribe con el formato base")
            contenido = dict(base)
        for k in claves_propias:
            contenido[k] = base[k]
    ruta.write_text(json.dumps(contenido, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- qué entra al modelo
DIMENSIONES = [
    "dim_tiempo", "dim_cliente", "dim_proveedor", "dim_socio_negocio", "dim_direccion",
    "dim_producto", "dim_vendedor",
    "dim_organizacion", "dim_almacen", "dim_moneda", "dim_cuenta", "dim_centro_costo",
    "dim_tipo_documento", "dim_rango_aging", "clasificacion_abc_cliente",
    "clasificacion_abc_proveedor", "clasificacion_rfm_cliente",
    "comportamiento_pago_cliente", "analisis_producto", "dim_anio",
]
HECHOS = [
    "hecho_venta_linea", "hecho_compra_linea",
    "hecho_cartera_cobrar", "hecho_cartera_pagar",
    "hecho_cartera_cobrar_diaria", "hecho_cartera_pagar_diaria",
    "hecho_pago_recibido", "hecho_pago_efectuado", "hecho_inventario",
    "tipo_cambio", "campo_usuario",
    "metrica_venta_diaria", "proyeccion_caja_semanal",
    "hecho_pedido_linea", "hecho_movimiento_contable", "estado_carga",
]

# Formato de moneda: las medidas de importe lo llevan TODAS; la conmutación a la moneda
# original del documento la hace el grupo de cálculo 'Moneda de análisis', que quita el
# símbolo en ese modo. Los bloques TMDL de este archivo están escritos con "Q" (la moneda
# del primer tenant); al EMITIR, `aplicar_moneda()` reemplaza el símbolo por el de la
# moneda de presentación de la organización (leída de gobierno.sociedades en la BD de
# control) — un tenant en USD sale con "$", nunca con "Q".
FMT_Q = '"Q" #,0'

# Moneda de presentación → símbolo del formatString y nombre visible del modo local del
# grupo de cálculo. Fallback: el propio código ISO como símbolo (formato válido en TMDL).
SIMBOLO_MONEDA = {
    "GTQ": "Q", "USD": "$", "MXN": "$", "EUR": "€", "HNL": "L", "NIO": "C$",
    "CRC": "₡", "PAB": "B/.", "DOP": "RD$", "COP": "$", "PEN": "S/",
}
NOMBRE_MONEDA = {
    "GTQ": "Quetzales", "USD": "Dólares", "MXN": "Pesos", "EUR": "Euros",
    "HNL": "Lempiras", "NIO": "Córdobas", "CRC": "Colones", "PAB": "Balboas",
    "DOP": "Pesos", "COP": "Pesos", "PEN": "Soles",
}

# Marcador para el símbolo de moneda DENTRO de una expresión DAX (medidas de narrativa, que
# formatean el importe con FORMAT en vez de con formatString). Se sustituye siempre, también en
# GTQ: un tenant en dólares no puede recibir un título que diga "Q".
TOKEN_SIMBOLO = "@SIM@"


def dax_importe_abreviado(var: str) -> str:
    """Fragmento DAX que convierte un importe en texto abreviado para un título narrativo.

    Los importes de Cresta están en cientos de millones: escribirlos completos en un título lo
    hace ilegible (§4 del contrato visual exige abreviatura K/M en tarjetas). `var` debe ser un
    VAR ya calculado, no una medida, para no evaluarla cinco veces.

    El símbolo se concatena FUERA del FORMAT y el signo se antepone a mano. Meterlo dentro del
    patrón produce basura silenciosa: `FORMAT(402.3, "Q#,0.0")` devuelve `1#,0.0` porque DAX lee
    la `q` como el código de trimestre de un formato de FECHA y emite el resto como literal.
    Verificado contra el motor el 2026-08-08.
    """
    signo = f'IF({var} < 0, "-", "")'
    abs_ = f'ABS({var})'
    # El corte de K está en 10 000 y no en 1 000: abreviar 1 234 como "Q1K" pierde la cifra
    # entera para no ganar nada de espacio.
    return (f'({signo} & "{TOKEN_SIMBOLO}" & SWITCH(TRUE(), '
            f'{abs_} >= 1000000, FORMAT({abs_} / 1000000, "#,##0.0") & "M", '
            f'{abs_} >= 10000, FORMAT({abs_} / 1000, "#,##0") & "K", '
            f'FORMAT({abs_}, "#,##0")))')


def moneda_presentacion_de(base: str) -> str:
    """Moneda de presentación de la organización dueña de `base`, leída de la BD de control.

    Toma la moneda de presentación dominante entre las sociedades activas (por diseño es una
    sola para todo el grupo). Si la BD de control no está accesible o la organización no está
    registrada, cae a GTQ con aviso — el modelo sale usable, no roto.
    """
    bd_control = os.environ.get("POSTGRES_DB")
    if not bd_control:
        print("  [!] POSTGRES_DB no definido — moneda de presentación asumida GTQ")
        return "GTQ"
    try:
        dsn = (f"host={os.environ.get('POSTGRES_HOST', 'localhost')} "
               f"port={os.environ.get('POSTGRES_PORT', '5432')} dbname={bd_control} "
               f"user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}")
        with psycopg.connect(dsn) as cx:
            cx.read_only = True
            fila = cx.execute(
                """
                SELECT s.moneda_presentacion
                  FROM gobierno.sociedades s
                  JOIN gobierno.organizaciones o ON o.id = s.organizacion_id
                 WHERE o.base_datos_dw = %s AND s.activo AND s.moneda_presentacion IS NOT NULL
                 GROUP BY s.moneda_presentacion
                 ORDER BY count(*) DESC
                 LIMIT 1
                """,
                (base,),
            ).fetchone()
        if fila and fila[0]:
            return str(fila[0]).upper()
        print(f"  [!] {base} sin sociedades con moneda de presentación — asumida GTQ")
        return "GTQ"
    except Exception as exc:  # noqa: BLE001 — el generador debe poder correr sin BD de control
        print(f"  [!] No se pudo leer la moneda de presentación ({exc}) — asumida GTQ")
        return "GTQ"


def aplicar_moneda(tmdl: str, moneda: str) -> str:
    """Reemplaza el símbolo "Q" de los bloques TMDL por el de la moneda de presentación.

    Toca exactamente tres formas: el formatString de importes ('"Q" #…'), el discriminador
    del calculation group (CONTAINSSTRING sobre el formatString) y el nombre del modo local
    ('Quetzales (local)'). Las cifras "Q…" dentro de descripciones /// no se tocan.
    """
    simbolo = SIMBOLO_MONEDA.get(moneda, moneda)
    nombre = NOMBRE_MONEDA.get(moneda, moneda)
    # El token de las medidas de narrativa se sustituye SIEMPRE, también en GTQ: vive dentro de
    # la expresión DAX y ninguna de las tres formas de abajo lo alcanzaría.
    tmdl = tmdl.replace(TOKEN_SIMBOLO, simbolo)
    if moneda == "GTQ":
        return tmdl
    return (
        tmdl
        .replace('CONTAINSSTRING(SELECTEDMEASUREFORMATSTRING(), "Q")',
                 f'CONTAINSSTRING(SELECTEDMEASUREFORMATSTRING(), "{simbolo}")')
        .replace('"Q" #', f'"{simbolo}" #')
        .replace("'Quetzales (local)'", f"'{nombre} (local)'")
    )

# Nombres amigables: el usuario de negocio no debería ver `hecho_` ni `dim_`.
ETIQUETA = {
    "dim_tiempo": "Calendario", "dim_cliente": "Cliente", "dim_proveedor": "Proveedor",
    "dim_socio_negocio": "Socio de negocio",
    "dim_direccion": "Dirección de entrega",
    "dim_producto": "Producto", "dim_vendedor": "Vendedor", "dim_organizacion": "Empresa",
    "dim_almacen": "Bodega", "dim_moneda": "Moneda", "dim_cuenta": "Cuenta contable",
    "dim_centro_costo": "Centro de costo", "dim_tipo_documento": "Tipo de documento",
    "dim_rango_aging": "Antigüedad", "clasificacion_abc_cliente": "Clasificación ABC",
    "clasificacion_abc_proveedor": "Clasificación ABC Proveedor",
    "clasificacion_rfm_cliente": "Clasificación RFM",
    "comportamiento_pago_cliente": "Comportamiento de pago",
    "analisis_producto": "Análisis de producto",
    "dim_anio": "Año de clasificación",
    "estado_carga": "Estado de carga",
    "metrica_venta_diaria": "Venta diaria",
    "proyeccion_caja_semanal": "Proyección de caja",
    "hecho_pedido_linea": "Pedidos",
    "hecho_movimiento_contable": "Resultados contables",
    "hecho_venta_linea": "Ventas", "hecho_compra_linea": "Compras",
    "hecho_cartera_cobrar": "Cartera por cobrar", "hecho_cartera_pagar": "Cartera por pagar",
    "hecho_cartera_cobrar_diaria": "Cartera cobrar histórico",
    "hecho_cartera_pagar_diaria": "Cartera pagar histórico",
    "hecho_pago_recibido": "Pagos recibidos", "hecho_pago_efectuado": "Pagos efectuados",
    "hecho_inventario": "Inventario", "tipo_cambio": "Tipo de cambio",
    "campo_usuario": "Campos de usuario",
}

# Prefijo de rol en el nombre visible: DM_ dimensión, FC_ hecho, MD_ tablas de solo medidas
# (el grupo de cálculo). Así el usuario distingue en el panel de campos qué tabla filtra (DM_)
# y qué tabla mide (FC_) sin abrir el modelo.
ETIQUETA_BASE = dict(ETIQUETA)
ETIQUETA = {t: ("DM_" if t in DIMENSIONES else "FC_") + e for t, e in ETIQUETA_BASE.items()}
GRUPO_MONEDA_NOMBRE = "MD_Moneda de análisis"

# Las expresiones DAX de MEDIDAS_POR_TABLA y del grupo de cálculo están escritas con los
# nombres SIN prefijo (legibles al mantenerlas); las referencias de tabla se renombran al
# generar. El renombrado es consciente de la sintaxis: no toca el interior de [medidas],
# "cadenas" ni nombres entre comillas que no sean exactamente una tabla del modelo.
RENOMBRES_TABLA = {e: ETIQUETA[t] for t, e in ETIQUETA_BASE.items()}
_RENOMBRES_SIMPLES = [e for e in RENOMBRES_TABLA if " " not in e]


def _token_dax(nombre: str) -> str:
    return f"'{nombre}'" if any(not (c.isalnum() or c == "_") for c in nombre) else nombre


def _renombra_segmento(seg: str) -> str:
    for viejo in _RENOMBRES_SIMPLES:
        seg = re.sub(rf"\b{viejo}\b", _token_dax(RENOMBRES_TABLA[viejo]), seg)
    return seg


def _renombra_linea(linea: str) -> str:
    out: list[str] = []
    seg: list[str] = []
    i, n = 0, len(linea)
    while i < n:
        c = linea[i]
        cierre = {"'": "'", '"': '"', "[": "]"}.get(c)
        if cierre:
            j = linea.find(cierre, i + 1)
            if j < 0:
                seg.append(c)
                i += 1
                continue
            out.append(_renombra_segmento("".join(seg)))
            seg = []
            if c == "'":
                contenido = linea[i + 1:j]
                out.append(f"'{RENOMBRES_TABLA.get(contenido, contenido)}'")
            else:
                out.append(linea[i:j + 1])
            i = j + 1
        else:
            seg.append(c)
            i += 1
    out.append(_renombra_segmento("".join(seg)))
    return "".join(out)


def renombrar_dax(bloque: str) -> str:
    """Aplica los prefijos DM_/FC_ a las referencias de tabla dentro de expresiones DAX."""
    listo = []
    for linea in bloque.split("\n"):
        s = linea.strip()
        # Comentarios /// y propiedades de formato no llevan referencias de tabla.
        if s.startswith("///") or s.startswith("displayFolder") or s.startswith("formatString"):
            listo.append(linea)
        else:
            listo.append(_renombra_linea(linea))
    return "\n".join(listo)

TIPOS = {
    "text": "string", "character varying": "string", "character": "string",
    "bigint": "int64", "integer": "int64", "smallint": "int64",
    "numeric": "decimal", "double precision": "double", "real": "double",
    "date": "dateTime", "timestamp with time zone": "dateTime",
    "timestamp without time zone": "dateTime", "boolean": "boolean",
}

# Columnas que el usuario no necesita ver (llaves y trazabilidad técnica).
def oculta(col: str, tabla: str = "") -> bool:
    if col.endswith("_clave") or col in (
            "proceso_transformacion", "version_proceso", "fuente_origen", "extraido_en",
            "valido_desde", "valido_hasta", "es_vigente", "empresa_id"):
        return True
    # `rango_aging` es el código crudo ('+90', '1-30'). En la dimensión el usuario debe
    # arrastrar `rango_aging_nombre`, que sí está ordenado; en los hechos la columna dejó de
    # ser la de relación (ahora se relaciona por clave entera) y se conserva solo como dato
    # de la fila, sin razón para mostrarse en el panel de campos.
    if col == "rango_aging":
        return True
    # Columnas de orden: existen para que Power BI ordene, no para mostrarse.
    return col.endswith("_orden")


# Proporciones guardadas como fracción (0.796): se muestran como porcentaje, no como decimal.
def es_proporcion(col: str) -> bool:
    return col.startswith("participacion") or col.startswith("porcentaje")


# Formato por nombre de columna.
def formato(col: str, tipo: str) -> str | None:
    if tipo == "decimal" or tipo == "double":
        if es_proporcion(col):
            return "0.0%"
        if col.endswith("_pct") or col.startswith("pct"):
            return '0.0"%"'
        return "#,0.00"
    if tipo == "int64" and not col.endswith("_clave"):
        return "#,0"
    if tipo == "dateTime":
        return "dd/MM/yyyy"
    return None


# Columnas cuyo orden de presentación lo define otra columna numérica. Sin esto, un gráfico de
# antigüedad pone '+90' antes de '1 a 30' (orden alfabético) y no se puede leer.
ORDENAR_POR = {
    "dim_rango_aging": {
        "rango_aging_nombre": "rango_aging_orden",
        "rango_aging": "rango_aging_orden",
    },
    "dim_tiempo": {
        "anio_mes": "anio_mes_orden", "mes_nombre": "mes_orden",
        "mes_nombre_corto": "mes_orden", "dia_semana_nombre": "dia_semana_orden",
        "dia_semana_corto": "dia_semana_orden", "anio_trimestre": "anio_trimestre_orden",
        "anio_semana": "anio_semana_orden", "mes_anio_etiqueta": "anio_mes_orden",
    },
    # 'Vencido' debe salir antes que las semanas futuras; el offset relativo al corte lo da.
    "proyeccion_caja_semanal": {"semana_etiqueta": "semana_offset"},
}


def tmdl_nombre(n: str) -> str:
    """Envuelve en comillas simples si el nombre lleva espacios o acentos."""
    return f"'{n}'" if (" " in n or any(c in n for c in "áéíóúñÁÉÍÓÚÑ")) else n


def columnas(cur, tabla: str) -> list[tuple[str, str]]:
    cur.execute(
        "select column_name, data_type from information_schema.columns "
        "where table_schema='oro' and table_name=%s order by ordinal_position", (tabla,))
    return [(c, TIPOS.get(t, "string")) for c, t in cur.fetchall()]


def gen_tabla(tabla: str, cols: list[tuple[str, str]], base: str) -> str:
    etq = ETIQUETA.get(tabla, tabla)
    es_tiempo = tabla == "dim_tiempo"
    L = [f"table {tmdl_nombre(etq)}", ""]
    if es_tiempo:
        # Marca la tabla como calendario: sin esto la inteligencia de tiempo falla en silencio.
        L += ["\tdataCategory: Time", ""]

    for col, tipo in cols:
        L.append(f"\tcolumn {tmdl_nombre(col)}")
        L.append(f"\t\tdataType: {tipo}")
        if es_tiempo and col == "fecha":
            L.append("\t\tisKey")
        if oculta(col, tabla):
            L.append("\t\tisHidden")
        # Agregación explícita: nunca sumas implícitas — toda medida es DAX declarada.
        L.append("\t\tsummarizeBy: none")
        L.append(f"\t\tsourceColumn: {col}")
        f = formato(col, tipo)
        if f:
            L.append(f'\t\tformatString: {f}')
        # Sin esto "Febrero" sale después de "Diciembre" y "+90" antes de "1 a 30".
        orden = ORDENAR_POR.get(tabla, {}).get(col)
        if orden and orden in {c for c, _ in cols}:
            L.append(f"\t\tsortByColumn: {orden}")
        L.append("")

    # Jerarquía contable: los 5 niveles homologados de Oro (árbol B1 / segmentos Odoo).
    # Permite el drill-down "Activo → Corriente → Caja y Bancos → ..." sin que el usuario
    # arrastre cinco columnas sueltas.
    if tabla == "dim_cuenta" and "nivel_1_nombre" in {c for c, _ in cols}:
        L += ["\thierarchy 'Jerarquía contable'"]
        for niv in range(1, 6):
            L += [f"\t\tlevel 'Nivel {niv}'", f"\t\t\tcolumn: nivel_{niv}_nombre"]
        L += [""]

    if es_tiempo:
        L += [
            "\thierarchy 'Jerarquía natural'",
            "\t\tlevel 'Año'",
            "\t\t\tcolumn: anio",
            "\t\tlevel Trimestre",
            "\t\t\tcolumn: trimestre_nombre",
            "\t\tlevel Mes",
            "\t\t\tcolumn: mes_nombre",
            "\t\tlevel 'Día'",
            "\t\t\tcolumn: dia",
            "",
            "\thierarchy 'Jerarquía ISO'",
            "\t\tlevel 'Año ISO'",
            "\t\t\tcolumn: anio_iso",
            "\t\tlevel Semana",
            "\t\t\tcolumn: semana_iso",
            "\t\tlevel 'Día de semana'",
            "\t\t\tcolumn: dia_semana_nombre",
            "",
        ]

    # Medidas de la tabla, si tiene. Van antes de la partición: TMDL admite cualquier orden,
    # pero agruparlas aquí mantiene el archivo legible al revisarlo en un diff.
    medidas = MEDIDAS_POR_TABLA.get(tabla)
    if medidas:
        L.append(renombrar_dax(medidas).strip("\n"))
        L.append("")

    L += [
        f"\tpartition {tmdl_nombre(etq)} = m",
        "\t\tmode: import",
        "\t\tsource =",
        "\t\t\t\tlet",
        f'\t\t\t\t    Origen = PostgreSQL.Database(Servidor, BaseDatos),',
        f'\t\t\t\t    Tabla = Origen{{[Schema="oro",Item="{tabla}"]}}[Data]',
        "\t\t\t\tin",
        "\t\t\t\t    Tabla",
        "",
    ]
    return "\n".join(L)


# ---------------------------------------------------------------------------------------------
# MEDIDAS POR TABLA
#
# Cada medida vive en la tabla del hecho que mide, no en una tabla única de métricas: al abrir
# `Ventas` en el panel de campos aparecen sus medidas, que es donde el usuario las busca. Las
# transversales (comparativos de tiempo) van en Ventas porque es el hecho que comparan.
#
# Formato TMDL obligatorio (cada regla nació de un fallo que solo se ve al abrir Desktop):
#   - la expresión DAX va en UNA sola línea;
#   - el comentario `///` va en la línea ANTERIOR al `measure`, nunca después del `=`;
#   - los nombres con espacio o acento van entre comillas simples.
# ---------------------------------------------------------------------------------------------
MEDIDAS_POR_TABLA: dict[str, str] = {}

MEDIDAS_POR_TABLA["hecho_venta_linea"] = r"""
	/// Base de todo: venta sin impuestos en MONEDA DE PRESENTACIÓN (consolidable entre sociedades), con la nota de crédito ya en negativo. Una sociedad sin tasa válida no suma aquí (regla: sin tipo de cambio, no se consolida).
	measure 'Ventas netas' = SUM(Ventas[monto_sin_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Lo que el cliente realmente paga. Sale de la CABECERA del documento y no de la suma de líneas: el IVA se calcula por documento y sumarlo línea a línea desvía centavos contra el ERP.
	measure 'Ventas netas con IVA' = SUM(Ventas[monto_con_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Facturación del período antes de restar devoluciones.
	measure 'Ventas brutas' = CALCULATE([Ventas netas], KEEPFILTERS('Tipo de documento'[tipo_documento] = "factura"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Notas de crédito del período, en positivo para poder compararlas contra la venta.
	measure Devoluciones = ABS(CALCULATE([Ventas netas], KEEPFILTERS('Tipo de documento'[tipo_documento] = "nota_credito")))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// IVA de las ventas. Se queda en moneda LOCAL aunque el resto del modelo esté en moneda de presentación: es un concepto fiscal del país de cada sociedad.
	measure 'Impuesto facturado' = SUM(Ventas[monto_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Descuento concedido, tomado de lo realmente grabado en cada línea y no de una lista de precios teórica.
	measure 'Descuento otorgado' = SUM(Ventas[monto_descuento])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Cuánto del precio se está cediendo. Que suba sin que suba el volumen es erosión de precio, no una promoción que funciona.
	measure '% Descuento' = DIVIDE([Descuento otorgado], [Ventas netas] + [Descuento otorgado])
		formatString: 0.0%
		displayFolder: 01 Importes

	/// Saldo pendiente de las facturas visibles, prorrateado por línea (suma = saldo del documento). INFORMATIVO: la cartera oficial sale del mayor.
	measure 'Saldo de facturas' = SUM(Ventas[saldo_pendiente])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// El mercado real. La venta al grupo no compite por precio: mezclarla distorsiona todo indicador comercial.
	measure 'Ventas a terceros' = CALCULATE([Ventas netas], Cliente[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	/// Facturación a otras empresas del propio grupo. Ni compite por precio ni la trabaja un vendedor.
	measure 'Ventas al grupo' = CALCULATE([Ventas netas], Cliente[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	/// Qué parte de la facturación es movimiento interno entre compañías del grupo. Cuando pesa, cambia la lectura de cualquier ranking comercial: revisarla antes de comparar clientes.
	measure '% Venta al grupo' = DIVIDE([Ventas al grupo], [Ventas netas])
		formatString: 0.0%
		displayFolder: 02 Terceros vs grupo

	/// Cantidad neta despachada; la nota de crédito resta.
	measure 'Unidades vendidas' = SUM(Ventas[cantidad])
		formatString: #,0
		displayFolder: 03 Conteos

	/// Número de líneas de documento — el grano del hecho.
	measure 'Líneas de venta' = COUNTROWS(Ventas)
		formatString: #,0
		displayFolder: 03 Conteos

	/// Facturas y notas de crédito distintas emitidas en el período.
	measure 'Documentos de venta' = DISTINCTCOUNT(Ventas[documento_id])
		formatString: #,0
		displayFolder: 03 Conteos

	/// Clientes distintos con movimiento neto en el período.
	measure 'Clientes con venta' = CALCULATE(DISTINCTCOUNT(Ventas[cliente_clave]), KEEPFILTERS(Ventas[monto_sin_impuesto] <> 0))
		formatString: #,0
		displayFolder: 03 Conteos

	/// Artículos distintos con movimiento: la parte del catálogo que de verdad rota.
	measure 'Productos vendidos' = DISTINCTCOUNT(Ventas[producto_clave])
		formatString: #,0
		displayFolder: 03 Conteos

	/// Venta media por documento. Subirlo suele costar menos que conseguir un cliente nuevo.
	measure 'Ticket promedio' = DIVIDE([Ventas netas], [Documentos de venta])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Precio medio realmente cobrado. Solo significa algo con UN producto filtrado: mezclado entre artículos distintos no dice nada.
	measure 'Precio promedio unidad' = DIVIDE([Ventas netas], [Unidades vendidas])
		formatString: "Q" #,0.00
		displayFolder: 04 Promedios

	/// Tamaño medio de la línea de documento.
	measure 'Venta promedio por línea' = DIVIDE([Ventas netas], [Líneas de venta])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Promedio sobre los días que SÍ hubo venta: no diluye con domingos y feriados.
	measure 'Venta promedio diaria' = DIVIDE([Ventas netas], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Ventas))
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Facturación media por cliente activo en el período.
	measure 'Venta promedio por cliente' = DIVIDE([Ventas netas], [Clientes con venta])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Costo registrado en la línea al momento de facturar. Solo existe en SAP B1; en Odoo la línea no lo trae y la medida sale en cero.
	measure 'Costo de ventas' = SUM(Ventas[costo])
		formatString: "Q" #,0
		displayFolder: 05 Rentabilidad

	/// Venta neta menos costo, calculado línea a línea. Cero en Odoo por la misma razón que el costo.
	measure 'Margen bruto' = SUM(Ventas[margen])
		formatString: "Q" #,0
		displayFolder: 05 Rentabilidad

	/// Rentabilidad sobre la venta, grupo incluido. Para el margen del mercado real usar '% Margen terceros'.
	measure '% Margen' = DIVIDE([Margen bruto], [Ventas netas])
		formatString: 0.0%
		displayFolder: 05 Rentabilidad

	/// El margen de mercado. Incluir la venta al grupo, que no compite por precio, infla el indicador.
	measure '% Margen terceros' = DIVIDE(CALCULATE([Margen bruto], Cliente[es_intercompania] = FALSE), [Ventas a terceros])
		formatString: 0.0%
		displayFolder: 05 Rentabilidad

	/// Mismo período del mes anterior (respeta el filtro de fechas del visual).
	measure 'Ventas mes anterior' = CALCULATE([Ventas netas], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// El mismo período del año pasado. En un negocio con temporada dice más que la comparación contra el mes anterior.
	measure 'Ventas año anterior' = CALCULATE([Ventas netas], DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Acumulado del mes en curso hasta el último día con datos del filtro.
	measure 'Ventas acumuladas mes' = TOTALMTD([Ventas netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Acumulado desde el inicio del trimestre hasta la fecha del contexto.
	measure 'Ventas acumuladas trimestre' = TOTALQTD([Ventas netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Acumulado desde el 1 de enero: la cifra con la que se mide el ejercicio.
	measure 'Ventas acumuladas año' = TOTALYTD([Ventas netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// El acumulado del año PASADO al mismo corte: el comparable correcto del YTD.
	measure 'Ventas acumuladas año anterior' = CALCULATE(TOTALYTD([Ventas netas], Calendario[fecha]), DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Crecimiento contra el mes previo. Cuidado con la estacionalidad: un mes flojo puede ser normal para la época.
	measure 'Variación vs mes anterior' = DIVIDE([Ventas netas] - [Ventas mes anterior], [Ventas mes anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 06 Comparativos

	/// Crecimiento contra el mismo período del año pasado, ya libre del efecto estacional.
	measure 'Variación vs año anterior' = DIVIDE([Ventas netas] - [Ventas año anterior], [Ventas año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 06 Comparativos

	/// Cómo va el ejercicio completo contra el anterior. Es la que se lleva a una junta.
	measure 'Variación acumulada vs año anterior' = DIVIDE([Ventas acumuladas año] - [Ventas acumuladas año anterior], [Ventas acumuladas año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 06 Comparativos

	/// Fin de la ventana móvil: el corte del contexto, pero nunca más allá del último día CON DATO. El calendario llega a 2032 para cubrir vencimientos y series proyectadas del ERP, así que anclar en MAX(Calendario[fecha]) dejaba toda ventana móvil apuntando a un futuro vacío y devolviendo BLANK. Con un período filtrado el ancla es el fin del período, que es lo correcto.
	measure '_Fecha ancla móvil' = VAR fin = MAX(Calendario[fecha]) VAR ultimo_dato = CALCULATE(MAX(Ventas[fecha_documento]), ALL(Calendario)) RETURN MIN(fin, ultimo_dato)
		formatString: yyyy-mm-dd
		displayFolder: _Auxiliar
		isHidden

	/// Promedio MENSUAL de los últimos 3 meses: alisa el diente de sierra de la facturación. (Iterar días con DATESINPERIOD daba un promedio diario disfrazado de mensual.)
	measure 'Media móvil 3 meses' = CALCULATE(AVERAGEX(VALUES(Calendario[anio_mes]), [Ventas netas]), DATESINPERIOD(Calendario[fecha], [_Fecha ancla móvil], -3, MONTH))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Año móvil: los últimos 12 meses completos desde el corte. Quita la estacionalidad del calendario.
	measure 'Ventas 12 meses móviles' = CALCULATE([Ventas netas], DATESINPERIOD(Calendario[fecha], [_Fecha ancla móvil], -12, MONTH))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Venta de líneas sin artículo (servicios, fletes, gastos) — el miembro SERVICIO de Producto.
	measure 'Ventas de servicios' = CALCULATE([Ventas netas], KEEPFILTERS(Producto[producto_codigo] = "SERVICIO"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Posición del cliente ordenado por venta a terceros, dentro del filtro vigente.
	measure 'Ranking de cliente por venta' = RANKX(ALLSELECTED(Cliente), [Ventas a terceros])
		formatString: #,0
		displayFolder: 07 Pareto

	/// Curva de Pareto: % de la venta a terceros que acumulan este cliente y los mayores que él. La venta por cliente se materializa UNA vez en `base`: la versión anterior reevaluaba la medida dentro del FILTER, una vez por cliente y por cliente, lo que es cuadrático y se nota con miles de clientes.
	measure '% acumulado de venta clientes' = VAR base = ADDCOLUMNS(ALLSELECTED(Cliente), "@v", [Ventas a terceros]) VAR actual = [Ventas a terceros] VAR total = SUMX(base, [@v]) VAR acum = SUMX(FILTER(base, [@v] >= actual), [@v]) RETURN DIVIDE(acum, total)
		formatString: 0.0%
		displayFolder: 07 Pareto

	/// Posición del producto por venta neta dentro del filtro vigente.
	measure 'Ranking de producto por venta' = RANKX(ALLSELECTED(Producto), [Ventas netas])
		formatString: #,0
		displayFolder: 07 Pareto

	/// Curva de Pareto de productos sobre la venta neta. Misma materialización en `base` que la curva de clientes.
	measure '% acumulado de venta productos' = VAR base = ADDCOLUMNS(ALLSELECTED(Producto), "@v", [Ventas netas]) VAR actual = [Ventas netas] VAR total = SUMX(base, [@v]) VAR acum = SUMX(FILTER(base, [@v] >= actual), [@v]) RETURN DIVIDE(acum, total)
		formatString: 0.0%
		displayFolder: 07 Pareto

	/// Peso de los 10 mayores clientes: la medida de riesgo comercial. Si perder un cliente hunde el año, se sabe aquí.
	measure '% Venta en top 10 clientes' = DIVIDE(CALCULATE([Ventas a terceros], TOPN(10, ALLSELECTED(Cliente), [Ventas a terceros])), CALCULATE([Ventas a terceros], ALLSELECTED(Cliente)))
		formatString: 0.0%
		displayFolder: 07 Pareto

	/// Amplitud de catálogo: cuántos productos distintos se le venden al cliente promedio. Subirla es la venta cruzada.
	measure 'Productos por cliente' = DIVIDE([Productos vendidos], [Clientes con venta])
		formatString: #,0.0
		displayFolder: 04 Promedios

	/// Venta facturada por DEBAJO del costo registrado en la línea. Es fuga de margen pura, no una promoción: nadie la autorizó.
	measure 'Ventas bajo costo' = CALCULATE([Ventas netas], KEEPFILTERS(Ventas[margen] < 0))
		formatString: "Q" #,0
		displayFolder: 08 Fugas de margen

	/// Cuántas líneas se facturaron por debajo del costo registrado.
	measure 'Líneas bajo costo' = CALCULATE(COUNTROWS(Ventas), KEEPFILTERS(Ventas[margen] < 0))
		formatString: #,0
		displayFolder: 08 Fugas de margen

	/// Cuánto margen se dejó en la mesa, en positivo para poder sumarlo y priorizarlo.
	measure 'Margen perdido bajo costo' = -CALCULATE(SUM(Ventas[margen]), KEEPFILTERS(Ventas[margen] < 0))
		formatString: "Q" #,0
		displayFolder: 08 Fugas de margen

	/// Qué porción de la venta se hizo perdiendo margen. Cualquier cifra de dos dígitos aquí merece una revisión de política de precios.
	measure '% Ventas bajo costo' = DIVIDE([Ventas bajo costo], [Ventas netas])
		formatString: 0.0%
		displayFolder: 08 Fugas de margen

	/// Artículos distintos que se vendieron perdiendo margen: la lista corta por donde empezar.
	measure 'Productos vendidos bajo costo' = CALCULATE(DISTINCTCOUNT(Ventas[producto_clave]), KEEPFILTERS(Ventas[margen] < 0))
		formatString: #,0
		displayFolder: 08 Fugas de margen

	/// Clientes a los que se les facturó por debajo del costo. Suele concentrarse en pocos y negociados.
	measure 'Clientes con venta bajo costo' = CALCULATE(DISTINCTCOUNT(Ventas[cliente_clave]), KEEPFILTERS(Ventas[margen] < 0))
		formatString: #,0
		displayFolder: 08 Fugas de margen

	/// Precio promedio del mismo período del año pasado, base del desglose precio/volumen.
	measure 'Precio promedio año anterior' = CALCULATE([Precio promedio unidad], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: "Q" #,0.00
		displayFolder: 09 Precio y volumen

	/// Volumen del mismo período del año pasado, base del desglose precio/volumen.
	measure 'Unidades año anterior' = CALCULATE([Unidades vendidas], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: #,0
		displayFolder: 09 Precio y volumen

	/// Cuánto de la variación anual viene de haber vendido MÁS CARO: diferencia de precio aplicada al volumen actual.
	measure 'Efecto precio' = ([Precio promedio unidad] - [Precio promedio año anterior]) * [Unidades vendidas]
		formatString: "Q" #,0
		displayFolder: 09 Precio y volumen

	/// Cuánto viene de haber vendido MÁS UNIDADES: diferencia de volumen valorada al precio del año pasado.
	measure 'Efecto volumen' = ([Unidades vendidas] - [Unidades año anterior]) * [Precio promedio año anterior]
		formatString: "Q" #,0
		displayFolder: 09 Precio y volumen

	/// El resto: cambio en la MEZCLA de productos y clientes. Los tres efectos suman exactamente la variación anual.
	measure 'Efecto mezcla' = [Ventas netas] - [Ventas año anterior] - [Efecto precio] - [Efecto volumen]
		formatString: "Q" #,0
		displayFolder: 09 Precio y volumen
"""

MEDIDAS_POR_TABLA["hecho_compra_linea"] = r"""
	/// Compra sin impuestos en MONEDA DE PRESENTACIÓN (consolidable entre sociedades).
	measure 'Compras netas' = SUM(Compras[monto_sin_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Compra con impuesto incluido, desde la cabecera del documento por la misma razón que en ventas.
	measure 'Compras netas con IVA' = SUM(Compras[monto_con_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// IVA soportado en las compras, en moneda local.
	measure 'Impuesto de compras' = SUM(Compras[monto_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Saldo pendiente de pago de las facturas de compra, prorrateado por línea. INFORMATIVO: la cartera oficial sale del mayor.
	measure 'Saldo de facturas de compra' = SUM(Compras[saldo_pendiente])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Compra a proveedores reales, sin el movimiento entre empresas del grupo.
	measure 'Compras a terceros' = CALCULATE([Compras netas], Proveedor[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	/// Compra a otras empresas del propio grupo: traslado interno, no abastecimiento.
	measure 'Compras al grupo' = CALCULATE([Compras netas], Proveedor[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	/// Qué parte del abastecimiento es interno.
	measure '% Compra al grupo' = DIVIDE([Compras al grupo], [Compras netas])
		formatString: 0.0%
		displayFolder: 02 Terceros vs grupo

	/// Cantidad neta recibida; la nota de crédito a proveedor resta.
	measure 'Unidades compradas' = SUM(Compras[cantidad])
		formatString: #,0
		displayFolder: 03 Conteos

	/// Número de líneas de documento de compra.
	measure 'Líneas de compra' = COUNTROWS(Compras)
		formatString: #,0
		displayFolder: 03 Conteos

	/// Facturas y notas de crédito de compra distintas del período.
	measure 'Documentos de compra' = DISTINCTCOUNT(Compras[documento_id])
		formatString: #,0
		displayFolder: 03 Conteos

	/// Proveedores distintos con movimiento en el período.
	measure 'Proveedores con compra' = CALCULATE(DISTINCTCOUNT(Compras[proveedor_clave]), KEEPFILTERS(Compras[monto_sin_impuesto] <> 0))
		formatString: #,0
		displayFolder: 03 Conteos

	/// Tamaño medio de la factura de compra.
	measure 'Compra promedio por documento' = DIVIDE([Compras netas], [Documentos de compra])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Cuánto se le compra en promedio a cada proveedor activo.
	measure 'Compra promedio por proveedor' = DIVIDE([Compras netas], [Proveedores con compra])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Promedio sobre los días que SÍ hubo compra.
	measure 'Compra promedio diaria' = DIVIDE([Compras netas], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Compras))
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Compra del mes previo, para ver si el abastecimiento se aceleró.
	measure 'Compras mes anterior' = CALCULATE([Compras netas], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Mismo período del año pasado, libre de estacionalidad.
	measure 'Compras año anterior' = CALCULATE([Compras netas], DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Acumulado desde el primer día del mes.
	measure 'Compras acumuladas mes' = TOTALMTD([Compras netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Acumulado del ejercicio.
	measure 'Compras acumuladas año' = TOTALYTD([Compras netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Acumulado del ejercicio anterior a la misma altura del año.
	measure 'Compras acumuladas año anterior' = CALCULATE(TOTALYTD([Compras netas], Calendario[fecha]), DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Cambio contra el mes previo.
	measure 'Variación compras vs mes anterior' = DIVIDE([Compras netas] - [Compras mes anterior], [Compras mes anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 05 Comparativos

	/// Cambio contra el mismo período del año pasado.
	measure 'Variación compras vs año anterior' = DIVIDE([Compras netas] - [Compras año anterior], [Compras año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 05 Comparativos

	/// Suaviza el ruido mensual del abastecimiento. Promedia MESES, no días.
	measure 'Media móvil 3 meses compras' = CALCULATE(AVERAGEX(VALUES(Calendario[anio_mes]), [Compras netas]), DATESINPERIOD(Calendario[fecha], [_Fecha ancla móvil], -3, MONTH))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Compra de líneas sin código de artículo (servicios, fletes, gastos). En operaciones con mucho gasto indirecto puede ser la mayoría de las líneas de compra.
	measure 'Compras de servicios' = CALCULATE([Compras netas], KEEPFILTERS(Producto[producto_codigo] = "SERVICIO"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Posición del proveedor por compra dentro del filtro vigente.
	measure 'Ranking de proveedor por compra' = RANKX(ALLSELECTED(Proveedor), [Compras a terceros])
		formatString: #,0
		displayFolder: 06 Pareto

	/// Curva de Pareto: % de la compra a terceros que acumulan este proveedor y los mayores que él.
	measure '% acumulado de compra proveedores' = VAR base = ADDCOLUMNS(ALLSELECTED(Proveedor), "@v", [Compras a terceros]) VAR actual = [Compras a terceros] VAR total = SUMX(base, [@v]) VAR acum = SUMX(FILTER(base, [@v] >= actual), [@v]) RETURN DIVIDE(acum, total)
		formatString: 0.0%
		displayFolder: 06 Pareto

	/// Dependencia del proveedor más grande. Un número alto es riesgo de suministro y cero poder de negociación.
	measure '% Compra en el mayor proveedor' = DIVIDE(MAXX(ALLSELECTED(Proveedor), [Compras a terceros]), CALCULATE([Compras a terceros], ALLSELECTED(Proveedor)))
		formatString: 0.0%
		displayFolder: 06 Pareto

	/// Concentración del abastecimiento en los diez mayores proveedores.
	measure '% Compra en top 10 proveedores' = DIVIDE(CALCULATE([Compras a terceros], TOPN(10, ALLSELECTED(Proveedor), [Compras a terceros])), CALCULATE([Compras a terceros], ALLSELECTED(Proveedor)))
		formatString: 0.0%
		displayFolder: 06 Pareto

	/// Faltaba el espejo del acumulado trimestral de ventas.
	measure 'Compras acumuladas trimestre' = TOTALQTD([Compras netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Compra de los últimos doce meses. Es la base de la rotación de inventario y de los días de pago.
	measure 'Compras 12 meses móviles' = CALCULATE([Compras netas], DATESINPERIOD(Calendario[fecha], [_Fecha ancla móvil], -12, MONTH))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Cómo va el abastecimiento del ejercicio completo contra el anterior.
	measure 'Variación compras acumulada vs año anterior' = DIVIDE([Compras acumuladas año] - [Compras acumuladas año anterior], [Compras acumuladas año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 05 Comparativos

	/// Precio unitario promedio pagado. Filtrar un producto para que signifique algo: mezclado entre artículos distintos no dice nada.
	measure 'Precio promedio de compra' = DIVIDE([Compras netas], [Unidades compradas])
		formatString: "Q" #,0.00
		displayFolder: 07 Inflación de insumos

	/// Precio unitario medio pagado el año pasado, base de la comparación de inflación de insumos.
	measure 'Precio de compra año anterior' = CALCULATE([Precio promedio de compra], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: "Q" #,0.00
		displayFolder: 07 Inflación de insumos

	/// Cuánto subió lo que compramos. Es la inflación REAL del negocio, medida sobre lo pagado, no sobre un índice.
	measure '% Variación de precio de compra' = DIVIDE([Precio promedio de compra] - [Precio de compra año anterior], [Precio de compra año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 07 Inflación de insumos

	/// Lo que costó de más comprar el volumen de hoy a los precios de hoy en vez de a los del año pasado.
	measure 'Sobrecosto por precio de compra' = ([Precio promedio de compra] - [Precio de compra año anterior]) * [Unidades compradas]
		formatString: "Q" #,0
		displayFolder: 07 Inflación de insumos
"""

MEDIDAS_POR_TABLA["hecho_cartera_cobrar"] = r"""
	/// Saldo del MAYOR CONTABLE, no del documento, en MONEDA DE PRESENTACIÓN (foto convertida a la tasa vigente).
	measure 'Saldo por cobrar' = SUM('Cartera por cobrar'[saldo_pendiente])
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Lo que deben los clientes reales. Sin separar el grupo, un aging estándar reporta una crisis de cartera que no existe.
	measure 'Saldo por cobrar terceros' = CALCULATE([Saldo por cobrar], Cliente[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Saldo entre empresas del propio grupo. Leerlo junto al de terceros hace parecer una crisis de cobranza que no existe.
	measure 'Saldo por cobrar grupo' = CALCULATE([Saldo por cobrar], Cliente[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Número de partidas abiertas en el mayor.
	measure 'Partidas por cobrar' = COUNTROWS('Cartera por cobrar')
		formatString: #,0
		displayFolder: 02 Conteos

	/// Clientes distintos con saldo pendiente.
	measure 'Clientes con saldo' = DISTINCTCOUNT('Cartera por cobrar'[cliente_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	/// Exposición media por cliente con deuda.
	measure 'Saldo promedio por cliente' = DIVIDE([Saldo por cobrar], [Clientes con saldo])
		formatString: "Q" #,0
		displayFolder: 02 Conteos

	/// Lo que aún no vence: es cobranza futura, no un problema.
	measure 'Saldo corriente' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = FALSE))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Lo que ya pasó su fecha de pago, grupo incluido.
	measure 'Saldo vencido' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// La mora que de verdad hay que cobrar: vencida y fuera del grupo.
	measure 'Saldo vencido terceros' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE), Cliente[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Qué porción de la cartera está vencida. Mezcla el grupo; para gestión comercial usar la versión de terceros.
	measure '% Vencido' = DIVIDE([Saldo vencido], [Saldo por cobrar])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	/// El indicador de salud de cobranza que sí se puede accionar.
	measure '% Vencido terceros' = DIVIDE([Saldo vencido terceros], [Saldo por cobrar terceros])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	/// Primer tramo de mora: normalmente es olvido o trámite, no riesgo.
	measure 'Vencido 1 a 30' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "1-30"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Segundo tramo: aquí la gestión de cobranza tiene que estar activa.
	measure 'Vencido 31 a 60' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "31-60"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Tercer tramo: la probabilidad de cobro empieza a caer de verdad.
	measure 'Vencido 61 a 90' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "61-90"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Deuda vieja. Es la candidata natural a provisión y la que conviene mirar cliente por cliente.
	measure 'Vencido más de 90' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "+90"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Riesgo alto: lo que pasó de 90 días pesa distinto en una provisión que lo que apenas venció.
	measure '% Crítico más de 90' = DIVIDE([Vencido más de 90], [Saldo por cobrar])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	/// Días vencidos promedio ponderados por saldo: un promedio simple deja que una partida chica de 400 días arruine el indicador.
	measure 'Días vencido promedio' = DIVIDE(SUMX('Cartera por cobrar', 'Cartera por cobrar'[saldo_pendiente] * 'Cartera por cobrar'[dias_vencido]), [Saldo por cobrar])
		formatString: #,0.0
		displayFolder: 04 Riesgo

	/// Días de venta a terceros pendientes de cobro. Mezclar el saldo del grupo lo triplica.
	measure 'Días de cartera terceros' = DIVIDE([Saldo por cobrar terceros], DIVIDE([Ventas a terceros], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Ventas)))
		formatString: #,0.0
		displayFolder: 04 Riesgo

	/// Foto de HOY: ignora el filtro de fechas de la página. El saldo es una foto, no un flujo — recortarlo al trimestre ocultaría las facturas viejas abiertas.
	measure 'Por cobrar terceros hoy' = CALCULATE([Saldo por cobrar terceros], REMOVEFILTERS(Calendario))
		formatString: "Q" #,0
		displayFolder: 05 Foto de hoy

	/// Saldo entre empresas del grupo, foto de hoy. No es riesgo de crédito: es conciliación pendiente.
	measure 'Por cobrar grupo hoy' = CALCULATE([Saldo por cobrar grupo], REMOVEFILTERS(Calendario))
		formatString: "Q" #,0
		displayFolder: 05 Foto de hoy

	/// Mora real a hoy, ignorando el filtro de fechas de la página.
	measure 'Vencido terceros hoy' = CALCULATE([Saldo vencido terceros], REMOVEFILTERS(Calendario))
		formatString: "Q" #,0
		displayFolder: 05 Foto de hoy

	/// Salud de la cobranza a día de hoy, sin que el período seleccionado la maquille.
	measure '% Vencido terceros hoy' = DIVIDE([Vencido terceros hoy], [Por cobrar terceros hoy])
		formatString: 0.0%
		displayFolder: 05 Foto de hoy

	/// Veces al año que se cobra la cartera completa. Es el recíproco de los días de cartera, más fácil de comparar entre empresas.
	measure 'Rotación de cartera' = DIVIDE(365, [Días de cartera terceros])
		formatString: #,0.0
		displayFolder: 04 Riesgo

	/// LA AGENDA DE COBRO. El calendario filtra por fecha de DOCUMENTO en todo el modelo; esta medida lo conmuta a la fecha de VENCIMIENTO con la relación inactiva, y es la única forma de responder "¿qué tengo que cobrar esta semana?". El resto de la página sigue leyéndose por fecha de documento: el cambio de eje vive dentro de la medida y no se propaga.
	measure 'Cobro que vence en el período' = CALCULATE([Saldo por cobrar terceros], USERELATIONSHIP('Cartera por cobrar'[tiempo_vencimiento_clave], Calendario[tiempo_clave]))
		formatString: "Q" #,0
		displayFolder: 07 Agenda de vencimiento

	/// Partidas sin fecha de vencimiento pactada: no son ni corrientes ni vencidas, y suelen ser anticipos o ajustes sin depurar.
	measure 'Saldo sin vencimiento' = CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "sin_vencimiento"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Cuánto nos debe el cliente más expuesto. Si un solo deudor concentra la cartera, el riesgo no está diversificado.
	measure 'Exposición mayor deudor' = MAXX(ALLSELECTED(Cliente), [Saldo por cobrar terceros])
		formatString: "Q" #,0
		displayFolder: 06 Concentración

	/// Cuánto pesa el cliente que más debe. Si un solo nombre concentra la cartera, el riesgo no está diversificado.
	measure '% Exposición mayor deudor' = DIVIDE([Exposición mayor deudor], CALCULATE([Saldo por cobrar terceros], ALLSELECTED(Cliente)))
		formatString: 0.0%
		displayFolder: 06 Concentración

	/// Concentración de la deuda en los cinco mayores.
	measure '% Saldo en top 5 deudores' = DIVIDE(CALCULATE([Saldo por cobrar terceros], TOPN(5, ALLSELECTED(Cliente), [Saldo por cobrar terceros])), CALCULATE([Saldo por cobrar terceros], ALLSELECTED(Cliente)))
		formatString: 0.0%
		displayFolder: 06 Concentración
"""

MEDIDAS_POR_TABLA["hecho_cartera_pagar"] = r"""
	/// En positivo para poder compararlo con la cartera por cobrar sin invertir signos en cada visual. MONEDA DE PRESENTACIÓN.
	measure 'Saldo por pagar' = SUM('Cartera por pagar'[saldo_pendiente_absoluto])
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Lo que se debe a proveedores reales.
	measure 'Saldo por pagar terceros' = CALCULATE([Saldo por pagar], Proveedor[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Deuda con empresas del propio grupo: se netea al consolidar.
	measure 'Saldo por pagar grupo' = CALCULATE([Saldo por pagar], Proveedor[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Lo que se cobra menos lo que se debe: la liquidez estructural del negocio.
	measure 'Posición neta' = [Saldo por cobrar] - [Saldo por pagar]
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Número de partidas abiertas de deuda.
	measure 'Partidas por pagar' = COUNTROWS('Cartera por pagar')
		formatString: #,0
		displayFolder: 02 Conteos

	/// Proveedores distintos a los que se les debe.
	measure 'Proveedores con saldo' = DISTINCTCOUNT('Cartera por pagar'[proveedor_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	/// Deuda que ya pasó su fecha de pago. Sostenida en el tiempo es señal de tensión de caja, no de buena negociación.
	measure 'Por pagar vencido' = CALCULATE([Saldo por pagar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Qué parte de lo que se debe ya está vencido.
	measure '% Por pagar vencido' = DIVIDE([Por pagar vencido], [Saldo por pagar])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	/// Deuda vieja con proveedores; suele venir con suministro en riesgo.
	measure 'Por pagar más de 90' = CALCULATE([Saldo por pagar], KEEPFILTERS('Antigüedad'[rango_aging] = "+90"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Foto de HOY: ignora el filtro de fechas de la página (el saldo es una foto, no un flujo).
	measure 'Por pagar hoy' = CALCULATE([Saldo por pagar], REMOVEFILTERS(Calendario))
		formatString: "Q" #,0
		displayFolder: 04 Foto de hoy

	/// Cobrar menos deber, foto de hoy, sin el filtro de período.
	measure 'Posición neta hoy' = CALCULATE([Posición neta], REMOVEFILTERS(Calendario))
		formatString: "Q" #,0
		displayFolder: 04 Foto de hoy

	/// DPO: días que tardamos en pagar a proveedores. Misma convención que 'Días de cartera terceros' para que el ciclo de efectivo cuadre.
	measure 'Días de pago terceros' = DIVIDE([Saldo por pagar terceros], DIVIDE([Compras a terceros], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Compras)))
		formatString: #,0.0
		displayFolder: 05 Ciclo de efectivo

	/// Veces al año que se paga la deuda completa. Es el recíproco de los días de pago.
	measure 'Rotación de cuentas por pagar' = DIVIDE(365, [Días de pago terceros])
		formatString: #,0.0
		displayFolder: 05 Ciclo de efectivo

	/// Lo que hay que pagar en el período, por fecha de VENCIMIENTO y no de documento. Leída junto a 'Cobro que vence en el período' dice si la semana entra en positivo o en negativo antes de que ocurra: en Cresta, agosto vence con Q26.1M por pagar contra Q19.4M por cobrar.
	measure 'Pago que vence en el período' = CALCULATE([Saldo por pagar terceros], USERELATIONSHIP('Cartera por pagar'[tiempo_vencimiento_clave], Calendario[tiempo_clave]))
		formatString: "Q" #,0
		displayFolder: 06 Agenda de vencimiento

	/// CICLO DE CONVERSIÓN DE EFECTIVO: días que el dinero pasa atrapado en el negocio antes de volver a caja. Cobrar + inventario − pagar. Bajarlo libera capital de trabajo sin pedir un préstamo; es la métrica de liquidez que más mueve la aguja en una PyME. Negativo significa que los proveedores financian la operación.
	measure 'Ciclo de conversión de efectivo' = [Días de cartera terceros] + [Días de inventario] - [Días de pago terceros]
		formatString: #,0.0
		displayFolder: 05 Ciclo de efectivo

	/// A cuántos proveedores se les debe algo ya vencido.
	measure 'Proveedores con saldo vencido' = CALCULATE(DISTINCTCOUNT('Cartera por pagar'[proveedor_clave]), KEEPFILTERS('Antigüedad'[es_vencido] = TRUE))
		formatString: #,0
		displayFolder: 02 Conteos

	/// Partidas sin fecha de pago pactada: normalmente anticipos o ajustes sin depurar.
	measure 'Por pagar sin vencimiento' = CALCULATE([Saldo por pagar], KEEPFILTERS('Antigüedad'[rango_aging] = "sin_vencimiento"))
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Concentración de la deuda: cuánto pesa el acreedor más grande sobre el total por pagar.
	measure '% Deuda en el mayor acreedor' = DIVIDE(MAXX(ALLSELECTED(Proveedor), [Saldo por pagar terceros]), CALCULATE([Saldo por pagar terceros], ALLSELECTED(Proveedor)))
		formatString: 0.0%
		displayFolder: 03 Antigüedad
"""

# Las fotos diarias de cartera son la ÚNICA fuente de evolución: los hechos de cartera son el
# saldo de hoy y no guardan historia. Hasta ahora se usaban solo con columnas sueltas en visuales
# de tendencia; con medidas propias sirven para medir cobranza y deterioro entre dos cortes.
MEDIDAS_POR_TABLA["hecho_cartera_cobrar_diaria"] = r"""
	/// Saldo por cobrar a la fecha de corte de la foto. Ya está en MONEDA DE PRESENTACIÓN pese al nombre de la columna (es incremental y no se renombró).
	measure 'Saldo histórico por cobrar' = SUM('Cartera cobrar histórico'[saldo_pendiente_local])
		formatString: "Q" #,0
		displayFolder: 01 Evolución

	/// Mora en la fecha de corte de la foto. Es la serie que muestra si la cobranza mejora o se deteriora.
	measure 'Vencido histórico por cobrar' = CALCULATE([Saldo histórico por cobrar], KEEPFILTERS('Cartera cobrar histórico'[dias_vencido] > 0))
		formatString: "Q" #,0
		displayFolder: 01 Evolución

	/// Proporción vencida en cada corte: la tendencia importa más que el valor de un día.
	measure '% Vencido histórico' = DIVIDE([Vencido histórico por cobrar], [Saldo histórico por cobrar])
		formatString: 0.0%
		displayFolder: 01 Evolución

	/// Saldo en el PRIMER corte del período filtrado: el punto de partida contra el que se mide la gestión de cobranza.
	measure 'Cartera al inicio del período' = CALCULATE([Saldo histórico por cobrar], FIRSTDATE(Calendario[fecha]))
		formatString: "Q" #,0
		displayFolder: 02 Gestión

	/// Saldo en el ÚLTIMO corte del período filtrado.
	measure 'Cartera al cierre del período' = CALCULATE([Saldo histórico por cobrar], LASTDATE(Calendario[fecha]))
		formatString: "Q" #,0
		displayFolder: 02 Gestión

	/// Cuánto creció o bajó la cartera en el período. Que suba mientras la venta no sube es la señal temprana de que se está cobrando peor.
	measure 'Variación de cartera' = [Cartera al cierre del período] - [Cartera al inicio del período]
		formatString: "Q" #,0
		displayFolder: 02 Gestión

	/// Índice de efectividad de cobranza: del total cobrable del período (cartera inicial + lo facturado), qué porcentaje se cobró. 100% sería cobrar todo lo exigible; por debajo de 80% la cobranza va perdiendo terreno.
	measure 'Efectividad de cobranza' = DIVIDE([Cartera al inicio del período] + [Ventas netas con IVA] - [Cartera al cierre del período], [Cartera al inicio del período] + [Ventas netas con IVA])
		formatString: 0.0%
		displayFolder: 02 Gestión
"""

MEDIDAS_POR_TABLA["hecho_cartera_pagar_diaria"] = r"""
	/// Saldo por pagar a la fecha de corte de la foto, en positivo. MONEDA DE PRESENTACIÓN.
	measure 'Saldo histórico por pagar' = SUM('Cartera pagar histórico'[saldo_pendiente_absoluto])
		formatString: "Q" #,0
		displayFolder: 01 Evolución

	/// Deuda vencida en la fecha de corte de la foto.
	measure 'Vencido histórico por pagar' = CALCULATE([Saldo histórico por pagar], KEEPFILTERS('Cartera pagar histórico'[dias_vencido] > 0))
		formatString: "Q" #,0
		displayFolder: 01 Evolución

	/// Posición neta a lo largo del tiempo: la serie que muestra si la liquidez estructural mejora o se deteriora.
	measure 'Posición neta histórica' = [Saldo histórico por cobrar] - [Saldo histórico por pagar]
		formatString: "Q" #,0
		displayFolder: 01 Evolución
"""

MEDIDAS_POR_TABLA["clasificacion_abc_cliente"] = r"""
	/// Cuántos clientes concentran el 80% de la venta. En una cartera sana no son dos. Cuenta clientes DISTINTOS: la tabla tiene una fila por cliente y año, así que sin acotar el año un COUNTROWS contaría cliente-años.
	measure 'Clientes A' = CALCULATE(DISTINCTCOUNT('Clasificación ABC'[cliente_clave]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "A"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes del tramo intermedio: entre el 80% y el 95% acumulado de la venta.
	measure 'Clientes B' = CALCULATE(DISTINCTCOUNT('Clasificación ABC'[cliente_clave]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "B"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Cola larga. Muchos nombres y poca venta; el costo de atenderlos es lo que hay que vigilar.
	measure 'Clientes C' = CALCULATE(DISTINCTCOUNT('Clasificación ABC'[cliente_clave]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "C"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes del catálogo sin venta en el año, o con solo devoluciones.
	measure 'Clientes sin venta neta' = CALCULATE(DISTINCTCOUNT('Clasificación ABC'[cliente_clave]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "S"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes distintos en el catálogo ABC, excluida la intercompañía.
	measure 'Clientes clasificados' = DISTINCTCOUNT('Clasificación ABC'[cliente_clave])
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes que facturaron algún año anterior y nada en el año seleccionado: la lista de llamadas pendientes.
	measure 'Clientes perdidos' = CALCULATE(DISTINCTCOUNT('Clasificación ABC'[cliente_clave]), KEEPFILTERS('Clasificación ABC'[es_perdido] = TRUE))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes cuya PRIMERA factura cae en el año seleccionado.
	measure 'Clientes estrenados en el año' = CALCULATE(DISTINCTCOUNT('Clasificación ABC'[cliente_clave]), KEEPFILTERS('Clasificación ABC'[es_nuevo] = TRUE))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Riesgo de concentración: si los A son el 90% de la venta, perder uno duele de verdad.
	measure '% Venta en clientes A' = DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "A")), SUM('Clasificación ABC'[venta]))
		formatString: 0.0%
		displayFolder: 02 Concentración

	/// Venta a terceros del año según el catálogo ABC. Sin filtrar un año en 'Año de clasificación' suma TODOS los años cargados.
	measure 'Venta del año clasificada' = SUM('Clasificación ABC'[venta])
		formatString: "Q" #,0
		displayFolder: 02 Concentración

	/// Cuánto factura en promedio un cliente clave.
	measure 'Venta promedio cliente A' = DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "A")), [Clientes A])
		formatString: "Q" #,0
		displayFolder: 02 Concentración

	/// Margen que dejan los clientes que hacen el negocio. Que sean los que más venden no garantiza que sean los que más dejan.
	measure 'Margen de clientes A' = CALCULATE(SUM('Clasificación ABC'[margen]), KEEPFILTERS('Clasificación ABC'[clase_abc] = "A"))
		formatString: "Q" #,0
		displayFolder: 02 Concentración
"""


MEDIDAS_POR_TABLA["clasificacion_abc_proveedor"] = r"""
	/// Cuántos proveedores concentran el 80% de la compra: dependencia de suministro. Cuenta proveedores DISTINTOS, porque la tabla tiene una fila por proveedor y año.
	measure 'Proveedores A' = CALCULATE(DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc] = "A"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Proveedores del tramo intermedio de la compra.
	measure 'Proveedores B' = CALCULATE(DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc] = "B"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Cola larga de proveedores: muchos, con poco volumen cada uno.
	measure 'Proveedores C' = CALCULATE(DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc] = "C"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Proveedores del catálogo sin compra en el año.
	measure 'Proveedores sin compra neta' = CALCULATE(DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc] = "S"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Proveedores distintos en el catálogo ABC, excluida la intercompañía.
	measure 'Proveedores clasificados' = DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave])
		formatString: #,0
		displayFolder: 01 Conteos

	/// Proveedores a los que se compró algún año anterior y nada en el año seleccionado. No es una pérdida como la de un cliente, pero un abastecimiento que se apaga suele venir con una concentración que crece en otro lado.
	measure 'Proveedores inactivos' = CALCULATE(DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave]), KEEPFILTERS('Clasificación ABC Proveedor'[es_inactivo] = TRUE))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Proveedores cuya PRIMERA compra cae en el año seleccionado.
	measure 'Proveedores estrenados en el año' = CALCULATE(DISTINCTCOUNT('Clasificación ABC Proveedor'[proveedor_clave]), KEEPFILTERS('Clasificación ABC Proveedor'[es_nuevo] = TRUE))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Riesgo de dependencia: si los A concentran el 90% de la compra, perder uno para la operación.
	measure '% Compra en proveedores A' = DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc] = "A")), SUM('Clasificación ABC Proveedor'[compra]))
		formatString: 0.0%
		displayFolder: 02 Concentración

	/// Compra a terceros del año según el catálogo ABC. Sin filtrar un año en 'Año de clasificación' suma TODOS los años cargados.
	measure 'Compra del año clasificada' = SUM('Clasificación ABC Proveedor'[compra])
		formatString: "Q" #,0
		displayFolder: 02 Concentración

	/// Volumen medio con un proveedor crítico.
	measure 'Compra promedio proveedor A' = DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc] = "A")), [Proveedores A])
		formatString: "Q" #,0
		displayFolder: 02 Concentración
"""

MEDIDAS_POR_TABLA["clasificacion_rfm_cliente"] = r"""
	/// Clientes recientes y frecuentes: el núcleo que sostiene la venta. Cuidarlos es más barato que reemplazarlos.
	measure 'Clientes campeones' = CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "campeon"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Compran seguido y hace poco, aunque no sean los de mayor monto. Son la base estable.
	measure 'Clientes leales' = CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "leal"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Compraban y dejaron de venir. La lista de reactivación con mayor retorno por llamada.
	measure 'Clientes en riesgo' = CALCULATE(COUNTROWS('Clasificación RFM'), 'Clasificación RFM'[segmento_rfm] IN {"en_riesgo", "en_riesgo_valioso"})
		formatString: #,0
		displayFolder: 01 Conteos

	/// En riesgo Y de monto alto: si solo se va a llamar a alguien, que sea a estos.
	measure 'Clientes en riesgo valiosos' = CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "en_riesgo_valioso"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Llevan mucho sin comprar y compraban poco. Reactivarlos rara vez paga el esfuerzo.
	measure 'Clientes dormidos' = CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "dormido"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Venta de 12 meses que está en manos de clientes en riesgo: lo que se pierde si nadie los llama.
	measure 'Venta 12m en riesgo' = CALCULATE(SUM('Clasificación RFM'[monto_neto_12m]), 'Clasificación RFM'[segmento_rfm] IN {"en_riesgo", "en_riesgo_valioso"})
		formatString: "Q" #,0
		displayFolder: 02 Montos

	/// Venta de los últimos 12 meses cubierta por el catálogo RFM.
	measure 'Venta 12m clasificada' = SUM('Clasificación RFM'[monto_neto_12m])
		formatString: "Q" #,0
		displayFolder: 02 Montos

	/// Clientes cuya PRIMERA compra cae dentro del período filtrado. Se quitan los filtros de Calendario y Ventas a propósito: sin eso la relación con Cliente ya habría recortado la tabla a quien compró en el período, y el conteo sería el de clientes activos, no el de nuevos.
	measure 'Clientes nuevos' = VAR ini = MIN(Calendario[fecha]) VAR fin = MAX(Calendario[fecha]) RETURN CALCULATE(COUNTROWS('Clasificación RFM'), REMOVEFILTERS(Calendario), REMOVEFILTERS(Ventas), 'Clasificación RFM'[primera_compra] >= ini, 'Clasificación RFM'[primera_compra] <= fin)
		formatString: #,0
		displayFolder: 03 Rotación de cartera

	/// Cuánto facturaron en el período los clientes que estrenaron relación en él. Mide si la captación trae volumen o solo nombres.
	measure 'Ventas de clientes nuevos' = VAR ini = MIN(Calendario[fecha]) VAR fin = MAX(Calendario[fecha]) RETURN CALCULATE([Ventas netas], FILTER(ALL('Clasificación RFM'), 'Clasificación RFM'[primera_compra] >= ini && 'Clasificación RFM'[primera_compra] <= fin))
		formatString: "Q" #,0
		displayFolder: 03 Rotación de cartera

	/// Qué parte de la facturación viene de relaciones estrenadas en el período.
	measure '% Venta de clientes nuevos' = DIVIDE([Ventas de clientes nuevos], [Ventas netas])
		formatString: 0.0%
		displayFolder: 03 Rotación de cartera

	/// Clientes con al menos una compra en los últimos 12 meses según la recencia del RFM.
	measure 'Clientes activos 12m' = CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[recencia_dias] <= 365))
		formatString: #,0
		displayFolder: 03 Rotación de cartera

	/// Proporción de la cartera que compró en los últimos 12 meses. Es la medida de si el catálogo está vivo o es una lista histórica.
	measure '% Clientes activos' = DIVIDE([Clientes activos 12m], CALCULATE(COUNTROWS('Clasificación RFM'), REMOVEFILTERS('Clasificación RFM'[recencia_dias])))
		formatString: 0.0%
		displayFolder: 03 Rotación de cartera

	/// Antigüedad media de la relación comercial. Una cartera joven crece; una muy vieja sin clientes nuevos se está apagando.
	measure 'Antigüedad media del cliente' = AVERAGEX('Clasificación RFM', DATEDIFF('Clasificación RFM'[primera_compra], TODAY(), DAY))
		formatString: #,0
		displayFolder: 03 Rotación de cartera
"""

MEDIDAS_POR_TABLA["comportamiento_pago_cliente"] = r"""
	/// Clientes sin nada vencido. El objetivo de la gestión de cobranza.
	measure 'Clientes al día' = CALCULATE(COUNTROWS('Comportamiento de pago'), KEEPFILTERS('Comportamiento de pago'[perfil_riesgo] = "al_dia"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Más de 90 días vencido o más de la mitad del saldo vencido: revisar antes de despachar.
	measure 'Clientes en vencido crítico' = CALCULATE(COUNTROWS('Comportamiento de pago'), KEEPFILTERS('Comportamiento de pago'[perfil_riesgo] = "vencido_critico"))
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes con al menos una partida en mora.
	measure 'Clientes con saldo vencido' = CALCULATE(COUNTROWS('Comportamiento de pago'), 'Comportamiento de pago'[perfil_riesgo] IN {"vencido_leve", "vencido_moderado", "vencido_critico"})
		formatString: #,0
		displayFolder: 01 Conteos

	/// Dinero expuesto en los clientes de peor perfil de pago.
	measure 'Saldo en clientes críticos' = CALCULATE(SUM('Comportamiento de pago'[saldo_total]), KEEPFILTERS('Comportamiento de pago'[perfil_riesgo] = "vencido_critico"))
		formatString: "Q" #,0
		displayFolder: 02 Montos

	/// Del saldo total abierto, cuánto ya venció. El termómetro de la salud de la cartera.
	measure '% cartera vencida (clientes)' = DIVIDE(SUM('Comportamiento de pago'[saldo_vencido]), SUM('Comportamiento de pago'[saldo_total]))
		formatString: 0.0%
		displayFolder: 02 Montos
"""

MEDIDAS_POR_TABLA["metrica_venta_diaria"] = r"""
	/// Serie continua (un día sin ventas es un CERO, no un hueco): la única base correcta para tendencias.
	measure 'Venta diaria neta' = SUM('Venta diaria'[ventas_netas])
		formatString: "Q" #,0
		displayFolder: 01 Serie

	/// Suaviza el efecto del día de semana. Útil para ver la tendencia corta sin el ruido del fin de semana.
	measure 'Venta media móvil 7d' = AVERAGEX(DATESINPERIOD('Calendario'[fecha], [_Fecha ancla móvil], -7, DAY), CALCULATE(SUM('Venta diaria'[ventas_netas])))
		formatString: "Q" #,0
		displayFolder: 01 Serie

	/// Tendencia de fondo, ya sin efecto semanal ni de quincena.
	measure 'Venta media móvil 30d' = AVERAGEX(DATESINPERIOD('Calendario'[fecha], [_Fecha ancla móvil], -30, DAY), CALCULATE(SUM('Venta diaria'[ventas_netas])))
		formatString: "Q" #,0
		displayFolder: 01 Serie

	/// Promedio solo de los días que SÍ se vendió (excluye ceros): el ritmo real de un día operado.
	measure 'Venta promedio día operado' = CALCULATE(AVERAGE('Venta diaria'[ventas_netas]), KEEPFILTERS('Venta diaria'[es_dia_sin_venta] = FALSE))
		formatString: "Q" #,0
		displayFolder: 01 Serie

	/// Días del período sin ninguna facturación. Un pico aquí suele ser paro, feriado o problema de captura.
	measure 'Días sin venta' = CALCULATE(COUNTROWS('Venta diaria'), KEEPFILTERS('Venta diaria'[es_dia_sin_venta] = TRUE))
		formatString: #,0
		displayFolder: 02 Actividad

	/// Cuántos clientes distintos compran en un día operado promedio.
	measure 'Clientes activos por día' = CALCULATE(AVERAGE('Venta diaria'[clientes_activos]), KEEPFILTERS('Venta diaria'[es_dia_sin_venta] = FALSE))
		formatString: #,0
		displayFolder: 02 Actividad

	/// Días del período con facturación real.
	measure 'Días con venta' = CALCULATE(COUNTROWS('Venta diaria'), KEEPFILTERS('Venta diaria'[es_dia_sin_venta] = FALSE))
		formatString: #,0
		displayFolder: 02 Actividad

	/// Ritmo real: dividir entre días NATURALES castiga a los meses con muchos feriados y hace parecer que la operación cayó cuando solo hubo menos días de trabajo.
	measure 'Venta por día hábil' = DIVIDE([Venta diaria neta], CALCULATE(COUNTROWS(Calendario), KEEPFILTERS(Calendario[es_dia_habil] = TRUE)))
		formatString: "Q" #,0
		displayFolder: 03 Ritmo

	/// Dónde va a cerrar el mes si se mantiene el ritmo de los días hábiles ya trabajados. Solo tiene sentido con UN mes filtrado: con el período abierto devolvía la venta de toda la historia repartida entre todos los días hábiles del calendario — un número plausible y falso (≈Q9.8M contra una venta mensual real cercana a Q50M). Ahora se calla en vez de mentir.
	measure 'Proyección de cierre de mes' = IF(DISTINCTCOUNT(Calendario[anio_mes]) <> 1, BLANK(), DIVIDE([Venta diaria neta], CALCULATE(COUNTROWS(Calendario), KEEPFILTERS(Calendario[es_dia_habil] = TRUE), KEEPFILTERS(Calendario[fecha] <= TODAY()))) * MAX(Calendario[dias_habiles_del_mes]))
		formatString: "Q" #,0
		displayFolder: 03 Ritmo

	/// Cuánto se despega el período del promedio mensual de su propio año. 1.0 es un mes normal; 1.3 es un pico estacional.
	measure 'Índice de estacionalidad' = DIVIDE([Venta diaria neta], DIVIDE(CALCULATE([Venta diaria neta], ALLEXCEPT(Calendario, Calendario[anio])), 12))
		formatString: #,0.00
		displayFolder: 03 Ritmo

	/// Acumulado dentro de la semana ISO en curso.
	measure 'Venta acumulada semana' = CALCULATE([Venta diaria neta], FILTER(ALL(Calendario), Calendario[anio_semana_orden] = MAX(Calendario[anio_semana_orden]) && Calendario[fecha] <= MAX(Calendario[fecha])))
		formatString: "Q" #,0
		displayFolder: 03 Ritmo
"""

MEDIDAS_POR_TABLA["proyeccion_caja_semanal"] = r"""
	/// Proyección CONTRACTUAL: si cada partida abierta se paga en su vencimiento. No es un pronóstico.
	measure 'Entradas proyectadas' = CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "entrada"))
		formatString: "Q" #,0
		displayFolder: 01 Proyección

	/// Pagos comprometidos por semana de vencimiento.
	measure 'Salidas proyectadas' = CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "salida"))
		formatString: "Q" #,0
		displayFolder: 01 Proyección

	/// Entradas menos salidas de la semana. Negativo sostenido es un problema de caja antes de ser un problema contable.
	measure 'Flujo neto proyectado' = [Entradas proyectadas] - [Salidas proyectadas]
		formatString: "Q" #,0
		displayFolder: 01 Proyección

	/// Ya venció y sigue abierto: en teoría es cobrable HOY. La brecha con lo programado mide la gestión de cobro.
	measure 'Entradas vencidas (exigible)' = CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "entrada"), KEEPFILTERS('Proyección de caja'[estado_vencimiento] = "vencido"))
		formatString: "Q" #,0
		displayFolder: 02 Vencido

	/// Pagos cuya fecha ya pasó: exigibles ahora mismo.
	measure 'Salidas vencidas (exigible)' = CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "salida"), KEEPFILTERS('Proyección de caja'[estado_vencimiento] = "vencido"))
		formatString: "Q" #,0
		displayFolder: 02 Vencido

	/// Flujo acumulado semana a semana: la curva que muestra en qué semana la caja se pone negativa si nada cambia. Es la pregunta que hace un gerente el lunes por la mañana.
	measure 'Posición proyectada acumulada' = CALCULATE([Flujo neto proyectado], FILTER(ALL('Proyección de caja'[semana_offset]), 'Proyección de caja'[semana_offset] <= MAX('Proyección de caja'[semana_offset])))
		formatString: "Q" #,0
		displayFolder: 03 Acumulado

	/// Horizonte corto: lo que entra y sale en las próximas 4 semanas, sin contar lo ya vencido.
	measure 'Entradas próximas 4 semanas' = CALCULATE([Entradas proyectadas], FILTER(ALL('Proyección de caja'[semana_offset]), 'Proyección de caja'[semana_offset] >= 0 && 'Proyección de caja'[semana_offset] <= 3))
		formatString: "Q" #,0
		displayFolder: 03 Acumulado

	/// Compromisos de pago del horizonte corto.
	measure 'Salidas próximas 4 semanas' = CALCULATE([Salidas proyectadas], FILTER(ALL('Proyección de caja'[semana_offset]), 'Proyección de caja'[semana_offset] >= 0 && 'Proyección de caja'[semana_offset] <= 3))
		formatString: "Q" #,0
		displayFolder: 03 Acumulado

	/// Lo que queda en caja del mes si todo se cumple como está pactado.
	measure 'Flujo neto próximas 4 semanas' = [Entradas próximas 4 semanas] - [Salidas próximas 4 semanas]
		formatString: "Q" #,0
		displayFolder: 03 Acumulado
"""

MEDIDAS_POR_TABLA["hecho_pedido_linea"] = r"""
	/// Base SIN impuesto de lo pedido en el período. El COMPROMISO, no el resultado (eso es Ventas).
	measure 'Monto pedido' = SUM(Pedidos[monto_sin_impuesto])
		formatString: "Q" #,0
		displayFolder: 01 Pedido

	/// Unidades comprometidas en los pedidos del período.
	measure 'Cantidad pedida' = SUM(Pedidos[cantidad])
		formatString: #,0
		displayFolder: 01 Pedido

	/// Número de pedidos distintos captados.
	measure 'Pedidos del período' = DISTINCTCOUNT(Pedidos[pedido_id])
		formatString: #,0
		displayFolder: 01 Pedido

	/// Pedido y AÚN no cumplido (líneas abiertas): lo que la operación debe entregar/facturar.
	measure 'Backlog' = CALCULATE(SUM(Pedidos[monto_abierto]), KEEPFILTERS(Pedidos[es_abierta] = TRUE))
		formatString: "Q" #,0
		displayFolder: 02 Backlog

	/// Unidades que faltan por entregar.
	measure 'Cantidad pendiente' = CALCULATE(SUM(Pedidos[cantidad_abierta]), KEEPFILTERS(Pedidos[es_abierta] = TRUE))
		formatString: #,0
		displayFolder: 02 Backlog

	/// Líneas de pedido con saldo por despachar.
	measure 'Líneas abiertas' = CALCULATE(COUNTROWS(Pedidos), KEEPFILTERS(Pedidos[es_abierta] = TRUE))
		formatString: #,0
		displayFolder: 02 Backlog

	/// De lo pedido, cuánto ya se cumplió (1 − backlog/pedido). El pulso de la operación.
	measure 'Fill rate' = 1 - DIVIDE([Backlog], [Monto pedido], 0)
		formatString: 0.0%
		displayFolder: 02 Backlog

	/// Líneas abiertas cuya fecha de entrega prometida YA PASÓ. Es incumplimiento en curso: el cliente lo está viviendo hoy.
	measure 'Líneas de pedido vencidas' = CALCULATE([Líneas abiertas], KEEPFILTERS(Pedidos[fecha_entrega] < TODAY()))
		formatString: #,0
		displayFolder: 03 Cumplimiento

	/// Compromiso cuya fecha de entrega prometida ya pasó. El cliente lo está viviendo hoy.
	measure 'Backlog vencido' = CALCULATE([Backlog], KEEPFILTERS(Pedidos[fecha_entrega] < TODAY()))
		formatString: "Q" #,0
		displayFolder: 03 Cumplimiento

	/// Qué parte del compromiso pendiente ya está en incumplimiento.
	measure '% Backlog vencido' = DIVIDE([Backlog vencido], [Backlog])
		formatString: 0.0%
		displayFolder: 03 Cumplimiento

	/// Lo que hay que ENTREGAR en el período, por fecha de entrega prometida y no de pedido. Es la carga de trabajo comprometida de la operación: 'Backlog' dice cuánto se debe, esta dice cuándo toca. Sin ella no hay forma de preguntar "¿qué prometí entregar la semana entrante?".
	measure 'Entrega comprometida en el período' = CALCULATE([Backlog], USERELATIONSHIP(Pedidos[tiempo_vencimiento_clave], Calendario[tiempo_clave]))
		formatString: "Q" #,0
		displayFolder: 03 Cumplimiento

	/// Días que se promete al cliente entre el pedido y la entrega. Si sube, la promesa comercial se está estirando.
	measure 'Lead time prometido' = AVERAGEX(Pedidos, DATEDIFF(Pedidos[fecha_pedido], Pedidos[fecha_entrega], DAY))
		formatString: #,0.0
		displayFolder: 03 Cumplimiento

	/// Backlog traducido a días de venta: cuánto tiempo de operación hay ya comprometido.
	measure 'Backlog en días de venta' = DIVIDE([Backlog], DIVIDE([Ventas netas], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Ventas)))
		formatString: #,0.0
		displayFolder: 02 Backlog

	/// Tamaño medio del pedido captado.
	measure 'Ticket promedio de pedido' = DIVIDE([Monto pedido], [Pedidos del período])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Clientes distintos que colocaron pedido en el período.
	measure 'Clientes con pedido' = DISTINCTCOUNT(Pedidos[cliente_clave])
		formatString: #,0
		displayFolder: 01 Pedido

	/// Captación del mes previo.
	measure 'Pedidos mes anterior' = CALCULATE([Monto pedido], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Captación del mismo período del año pasado.
	measure 'Pedidos año anterior' = CALCULATE([Monto pedido], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Pedido contra facturación del mismo período: mide si la demanda captada se está convirtiendo en venta o se está represando.
	measure 'Pedido sobre facturado' = DIVIDE([Monto pedido], [Ventas netas])
		formatString: 0.0%
		displayFolder: 05 Comparativos
"""

MEDIDAS_POR_TABLA["hecho_movimiento_contable"] = r"""
	/// Gasto operativo del MAYOR (cuentas de gasto), con jerarquía de cuenta y centro de costo.
	measure 'Gasto operativo' = CALCULATE(SUM('Resultados contables'[monto_resultado]), KEEPFILTERS('Resultados contables'[naturaleza] = "gasto"))
		formatString: "Q" #,0
		displayFolder: 01 P&L

	/// Costo del período según el mayor. Es la cifra contable, no el costo de línea de la factura.
	measure 'Costo (contable)' = CALCULATE(SUM('Resultados contables'[monto_resultado]), KEEPFILTERS('Resultados contables'[naturaleza] = "costo"))
		formatString: "Q" #,0
		displayFolder: 01 P&L

	/// Ingresos según el LIBRO MAYOR. Cuadra al centavo con Ventas Netas cuando todo ingreso pasa por factura.
	measure 'Ingresos contables' = CALCULATE(SUM('Resultados contables'[monto_resultado]), KEEPFILTERS('Resultados contables'[naturaleza] = "ingreso"))
		formatString: "Q" #,0
		displayFolder: 01 P&L

	/// Ingresos − costos − gastos, todo desde el mayor: el resultado operativo contable.
	measure 'Resultado contable' = [Ingresos contables] - [Costo (contable)] - [Gasto operativo]
		formatString: "Q" #,0
		displayFolder: 01 P&L

	/// Número de partidas del mayor en el filtro vigente.
	measure 'Partidas contables' = COUNTROWS('Resultados contables')
		formatString: #,0
		displayFolder: 01 P&L

	/// Margen operativo real, el del mayor contable — no el margen de línea de factura. Es el número que mira un banco.
	measure '% Margen operativo' = DIVIDE([Resultado contable], [Ingresos contables])
		formatString: 0.0%
		displayFolder: 02 Estructura

	/// Cuánto del ingreso se come la estructura. Subir la venta con este porcentaje subiendo no mejora nada.
	measure '% Gasto sobre ingreso' = DIVIDE([Gasto operativo], [Ingresos contables])
		formatString: 0.0%
		displayFolder: 02 Estructura

	/// Qué parte del ingreso se va en costo directo.
	measure '% Costo sobre ingreso' = DIVIDE([Costo (contable)], [Ingresos contables])
		formatString: 0.0%
		displayFolder: 02 Estructura

	/// Peso del rubro de gasto más grande dentro del total. Filtrar por nivel de la jerarquía contable para leerlo.
	measure '% Gasto en el mayor rubro' = DIVIDE(MAXX(ALLSELECTED('Cuenta contable'), [Gasto operativo]), CALCULATE([Gasto operativo], ALLSELECTED('Cuenta contable')))
		formatString: 0.0%
		displayFolder: 02 Estructura

	/// Estructura media mensual: el piso que hay que cubrir cada mes.
	measure 'Gasto promedio mensual' = DIVIDE([Gasto operativo], DISTINCTCOUNT(Calendario[anio_mes]))
		formatString: "Q" #,0
		displayFolder: 02 Estructura

	/// Gasto del mes previo.
	measure 'Gasto mes anterior' = CALCULATE([Gasto operativo], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 03 Comparativos

	/// Gasto del mismo período del año pasado.
	measure 'Gasto año anterior' = CALCULATE([Gasto operativo], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: "Q" #,0
		displayFolder: 03 Comparativos

	/// Gasto acumulado del ejercicio.
	measure 'Gasto acumulado año' = TOTALYTD([Gasto operativo], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 03 Comparativos

	/// Cómo crece la estructura. Que crezca más rápido que el ingreso es la señal más temprana de deterioro.
	measure 'Variación de gasto vs año anterior' = DIVIDE([Gasto operativo] - [Gasto año anterior], [Gasto año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 03 Comparativos

	/// Ingreso contable acumulado del ejercicio.
	measure 'Ingresos acumulados año' = TOTALYTD([Ingresos contables], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 03 Comparativos

	/// Resultado del ejercicio a la fecha, antes de ajustes de cierre.
	measure 'Resultado acumulado año' = TOTALYTD([Resultado contable], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 03 Comparativos

	/// Resultado del mes previo.
	measure 'Resultado mes anterior' = CALCULATE([Resultado contable], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 03 Comparativos

	/// Diferencia entre lo que dice contabilidad y lo que dice facturación. Debería ser cerca de cero; si no, hay anticipos, ajustes o cuentas de ingreso mal clasificadas. Es un control, no un KPI: cuando se despega, hay que ir a buscar por qué.
	measure 'Brecha contable vs facturado' = [Ingresos contables] - [Ventas netas]
		formatString: "Q" #,0
		displayFolder: 04 Control

	/// La brecha contra facturación en porcentaje. Debería rondar cero; cuando se despega hay que buscar anticipos, ajustes o cuentas mal clasificadas.
	measure '% Brecha contable' = DIVIDE([Brecha contable vs facturado], [Ventas netas])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 04 Control
"""

MEDIDAS_POR_TABLA["hecho_pago_recibido"] = r"""
	/// Flujo de cobros del período en MONEDA DE PRESENTACIÓN. INFORMATIVO para caja: el saldo de cartera sale del mayor.
	measure 'Monto cobrado' = SUM('Pagos recibidos'[monto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Solo cobranza de CLIENTES. Los pagos recibidos del ERP mezclan cobranza con operaciones de tesorería contra cuenta contable (depósitos, traslados); sin este filtro la cobranza se infla.
	measure 'Cobros de clientes' = CALCULATE([Monto cobrado], KEEPFILTERS('Pagos recibidos'[contraparte] = "cliente"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Movimientos contra cuenta contable —depósitos y traslados—, no cobranza de clientes. En SAP viven en la misma tabla que los cobros y sin separarlos la cobranza se triplica.
	measure 'Cobros de tesorería' = CALCULATE([Monto cobrado], KEEPFILTERS('Pagos recibidos'[contraparte] = "cuenta_contable"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Cobranza de clientes contra la venta con IVA del mismo período: el pulso de la recuperación.
	measure '% Cobrado vs facturado' = DIVIDE([Cobros de clientes], [Ventas netas con IVA])
		formatString: 0.0%
		displayFolder: 01 Importes

	/// Número de documentos de cobro recibidos.
	measure 'Cantidad de cobros' = COUNTROWS('Pagos recibidos')
		formatString: #,0
		displayFolder: 02 Conteos

	/// Clientes distintos que hicieron algún pago en el período.
	measure 'Clientes que pagaron' = DISTINCTCOUNT('Pagos recibidos'[cliente_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	/// Importe medio por documento de cobro.
	measure 'Cobro promedio' = DIVIDE([Monto cobrado], [Cantidad de cobros])
		formatString: "Q" #,0
		displayFolder: 03 Promedios

	/// Cobranza del mes previo.
	measure 'Cobros mes anterior' = CALCULATE([Monto cobrado], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Cobranza acumulada del ejercicio.
	measure 'Cobros acumulados año' = TOTALYTD([Monto cobrado], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Cobranza del mismo período del año pasado.
	measure 'Cobros año anterior' = CALCULATE([Monto cobrado], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Cobranza acumulada desde el primer día del mes.
	measure 'Cobros acumulados mes' = TOTALMTD([Monto cobrado], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Cambio en la cobranza contra el año pasado.
	measure 'Variación de cobros vs año anterior' = DIVIDE([Monto cobrado] - [Cobros año anterior], [Cobros año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 04 Comparativos

	/// Reparto del cobro por instrumento. Un salto del efectivo o una caída de la transferencia cambia el riesgo operativo y el costo bancario.
	measure '% Cobro en el medio principal' = DIVIDE(MAXX(ALLSELECTED('Pagos recibidos'[medio_pago]), [Cobros de clientes]), CALCULATE([Cobros de clientes], ALLSELECTED('Pagos recibidos'[medio_pago])))
		formatString: 0.0%
		displayFolder: 05 Mix de cobro
"""

MEDIDAS_POR_TABLA["hecho_pago_efectuado"] = r"""
	/// Salidas de caja del período, cualquiera sea la contraparte.
	measure 'Monto pagado' = SUM('Pagos efectuados'[monto])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Solo pagos a PROVEEDORES (excluye operaciones de tesorería contra cuenta contable).
	measure 'Pagos a proveedores' = CALCULATE([Monto pagado], KEEPFILTERS('Pagos efectuados'[contraparte] = "proveedor"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Lo cobrado menos lo pagado en el período filtrado: el pulso de caja operativo.
	measure 'Flujo neto de caja' = [Monto cobrado] - [Monto pagado]
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Número de documentos de pago emitidos.
	measure 'Cantidad de pagos' = COUNTROWS('Pagos efectuados')
		formatString: #,0
		displayFolder: 02 Conteos

	/// Proveedores distintos a los que se les pagó.
	measure 'Proveedores pagados' = DISTINCTCOUNT('Pagos efectuados'[proveedor_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	/// Importe medio por documento de pago.
	measure 'Pago promedio' = DIVIDE([Monto pagado], [Cantidad de pagos])
		formatString: "Q" #,0
		displayFolder: 03 Promedios

	/// Salidas del mes previo.
	measure 'Pagos mes anterior' = CALCULATE([Monto pagado], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Salidas acumuladas del ejercicio.
	measure 'Pagos acumulados año' = TOTALYTD([Monto pagado], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Salidas del mismo período del año pasado.
	measure 'Pagos año anterior' = CALCULATE([Monto pagado], SAMEPERIODLASTYEAR(Calendario[fecha]))
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Salidas acumuladas desde el primer día del mes.
	measure 'Pagos acumulados mes' = TOTALMTD([Monto pagado], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	/// Cambio en las salidas contra el año pasado.
	measure 'Variación de pagos vs año anterior' = DIVIDE([Monto pagado] - [Pagos año anterior], [Pagos año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 04 Comparativos

	/// Caja neta acumulada del año: lo cobrado menos lo pagado desde el 1 de enero.
	measure 'Flujo neto acumulado año' = [Cobros acumulados año] - [Pagos acumulados año]
		formatString: "Q" #,0
		displayFolder: 04 Comparativos
"""

MEDIDAS_POR_TABLA["hecho_inventario"] = r"""
	/// Valor del inventario a la fecha de corte en MONEDA DE PRESENTACIÓN (SAP: OnHand × costo promedio; Odoo: capas de valoración).
	measure 'Valor de inventario' = SUM(Inventario[valor])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Cantidad física en bodega a la fecha de corte.
	measure 'Unidades en existencia' = SUM(Inventario[cantidad])
		formatString: #,0
		displayFolder: 02 Conteos

	/// Artículos distintos con saldo en bodega.
	measure 'Productos con existencia' = CALCULATE(DISTINCTCOUNT(Inventario[producto_clave]), KEEPFILTERS(Inventario[cantidad] <> 0))
		formatString: #,0
		displayFolder: 02 Conteos

	/// Almacenes con movimiento vivo.
	measure 'Bodegas con existencia' = CALCULATE(DISTINCTCOUNT(Inventario[almacen_clave]), KEEPFILTERS(Inventario[cantidad] <> 0))
		formatString: #,0
		displayFolder: 02 Conteos

	/// Costo unitario medio de lo que hay en bodega.
	measure 'Costo promedio ponderado' = DIVIDE([Valor de inventario], [Unidades en existencia])
		formatString: "Q" #,0.00
		displayFolder: 03 Promedios

	/// Veces que el inventario rota al año: costo de ventas de los últimos 12 meses sobre el valor actual.
	measure 'Rotación de inventario 12M' = DIVIDE(CALCULATE([Costo de ventas], DATESINPERIOD(Calendario[fecha], [_Fecha ancla móvil], -12, MONTH)), [Valor de inventario])
		formatString: #,0.0
		displayFolder: 04 Rotación

	/// Cuántos días tarda en consumirse la existencia actual. Es una de las tres patas del ciclo de conversión de efectivo.
	measure 'Días de inventario' = DIVIDE(365, [Rotación de inventario 12M])
		formatString: #,0
		displayFolder: 04 Rotación

	/// Los días de inventario en la unidad con la que suele razonar compras.
	measure 'Meses de inventario' = DIVIDE([Días de inventario], 30)
		formatString: #,0.0
		displayFolder: 04 Rotación

	/// Cuánto capital hay inmovilizado en bodega por cada quetzal de venta del período. Sube cuando se compra más rápido de lo que se vende.
	measure 'Inventario sobre ventas' = DIVIDE([Valor de inventario], [Ventas netas])
		formatString: 0.0%
		displayFolder: 04 Rotación
"""

# La ficha de producto se relaciona 1:1 con la dimensión Producto y con filtrado bidireccional,
# así que sus banderas pueden filtrar [Valor de inventario] y [Ventas netas] sin redefinirlos.
# Ninguna medida de aquí recalcula un importe que ya exista: solo lo acota.
MEDIDAS_POR_TABLA["analisis_producto"] = r"""
	/// Dinero parado: productos que SÍ se vendieron alguna vez, tienen existencia, y llevan más de 90 días sin facturarse. Es la primera lista que debería recibir compras. Usa TREATAS porque la relación con Producto es unidireccional: el filtro de la ficha se aplica explícitamente y solo donde esta medida lo necesita, sin propagación global.
	measure 'Valor de inventario ocioso' = CALCULATE([Valor de inventario], TREATAS(CALCULATETABLE(VALUES('Análisis de producto'[producto_clave]), KEEPFILTERS('Análisis de producto'[es_ocioso] = TRUE)), Producto[producto_clave]))
		formatString: "Q" #,0
		displayFolder: 01 Inventario muerto

	/// Artículos con existencia que se vendieron alguna vez y llevan más de 90 días parados.
	measure 'Productos ociosos' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[es_ocioso] = TRUE))
		formatString: #,0
		displayFolder: 01 Inventario muerto

	/// Qué parte del valor en bodega está muerto y es accionable.
	measure '% Inventario ocioso' = DIVIDE([Valor de inventario ocioso], [Valor de inventario])
		formatString: 0.0%
		displayFolder: 01 Inventario muerto

	/// Existencia de artículos que NUNCA se han facturado. En una comercializadora es alarma; en una productora es insumo normal (alimento, medicina, empaque) que se consume sin pasar por una factura. Se separa del ocioso justamente para no confundir las dos cosas.
	measure 'Valor sin rotación comercial' = CALCULATE([Valor de inventario], TREATAS(CALCULATETABLE(VALUES('Análisis de producto'[producto_clave]), KEEPFILTERS('Análisis de producto'[es_sin_rotacion_comercial] = TRUE)), Producto[producto_clave]))
		formatString: "Q" #,0
		displayFolder: 01 Inventario muerto

	/// Artículos con existencia que NUNCA se facturaron. En una productora son insumos normales; en una comercializadora, alarma.
	measure 'Productos sin rotación comercial' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[es_sin_rotacion_comercial] = TRUE))
		formatString: #,0
		displayFolder: 01 Inventario muerto

	/// Productos con demanda en los últimos 30 días y CERO existencia hoy: venta que se está perdiendo ahora mismo.
	measure 'Productos en quiebre' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[es_quiebre] = TRUE))
		formatString: #,0
		displayFolder: 02 Quiebre de stock

	/// Cuánto facturaron en 12 meses los productos que hoy están agotados. Dimensiona lo que está en juego mientras no se reponga.
	measure 'Venta anual en riesgo por quiebre' = CALCULATE(SUM('Análisis de producto'[venta_12m]), KEEPFILTERS('Análisis de producto'[es_quiebre] = TRUE))
		formatString: "Q" #,0
		displayFolder: 02 Quiebre de stock

	/// Cuántos días de venta cubre la existencia al ritmo de los últimos 12 meses.
	measure 'Cobertura promedio en días' = AVERAGE('Análisis de producto'[dias_cobertura])
		formatString: #,0
		displayFolder: 03 Cobertura

	/// Artículos del catálogo sin nada en bodega hoy.
	measure 'Productos sin existencia' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[stock_cantidad] <= 0))
		formatString: #,0
		displayFolder: 03 Cobertura

	/// Cuántos artículos hacen el 80% de la venta. Sobre estos se cuida el nivel de servicio; el resto puede esperar.
	measure 'Productos A' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[clase_abc_producto] = "A"))
		formatString: #,0
		displayFolder: 04 Concentración

	/// Artículos del tramo intermedio de la venta.
	measure 'Productos B' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[clase_abc_producto] = "B"))
		formatString: #,0
		displayFolder: 04 Concentración

	/// Cola larga del catálogo: poca venta y, con frecuencia, mucha bodega.
	measure 'Productos C' = CALCULATE(COUNTROWS('Análisis de producto'), KEEPFILTERS('Análisis de producto'[clase_abc_producto] = "C"))
		formatString: #,0
		displayFolder: 04 Concentración

	/// Concentración de la venta en los artículos clave.
	measure '% Venta en productos A' = DIVIDE(CALCULATE(SUM('Análisis de producto'[venta_12m]), KEEPFILTERS('Análisis de producto'[clase_abc_producto] = "A")), SUM('Análisis de producto'[venta_12m]))
		formatString: 0.0%
		displayFolder: 04 Concentración

	/// Inventario inmovilizado en artículos de cola larga: lo que menos vende ocupando bodega.
	measure 'Inventario en productos C' = CALCULATE([Valor de inventario], TREATAS(CALCULATETABLE(VALUES('Análisis de producto'[producto_clave]), KEEPFILTERS('Análisis de producto'[clase_abc_producto] = "C")), Producto[producto_clave]))
		formatString: "Q" #,0
		displayFolder: 04 Concentración
"""

MEDIDAS_POR_TABLA["estado_carga"] = r"""
	/// Días desde la última extracción del dominio más rezagado. Es el aviso de que el tablero está viejo antes de que alguien tome una decisión con él.
	measure 'Días desde última extracción' = MAX('Estado de carga'[dias_desde_extraccion])
		formatString: #,0
		displayFolder: 01 Frescura

	/// Momento en que corrió por última vez la extracción del dominio más rezagado.
	measure 'Última extracción' = MAX('Estado de carga'[ultima_extraccion])
		formatString: dd/MM/yyyy HH:mm
		displayFolder: 01 Frescura

	/// Fecha del dato más reciente que hay en el ERP. Es un reloj distinto al de la extracción: el pipeline puede estar sano y la operación detenida.
	measure 'Último dato del ERP' = MAX('Estado de carga'[fecha_dato_mas_reciente])
		formatString: dd/MM/yyyy
		displayFolder: 01 Frescura

	/// Cuántos dominios llevan más de tres días sin extraerse. Distinto de cero significa que hay tableros mostrando datos viejos.
	measure 'Dominios desactualizados' = CALCULATE(COUNTROWS('Estado de carga'), KEEPFILTERS('Estado de carga'[estado_frescura] = "Desactualizado"))
		formatString: #,0
		displayFolder: 01 Frescura

	/// Volumen de filas en el origen, para dimensionar cada dominio.
	measure 'Filas cargadas' = SUM('Estado de carga'[filas])
		formatString: #,0
		displayFolder: 02 Volumen
"""

MEDIDAS_POR_TABLA["campo_usuario"] = r"""
	/// Cuántos valores de campos de usuario hay capturados en el filtro vigente.
	measure 'Valores de usuario capturados' = COUNTROWS('Campos de usuario')
		formatString: #,0
		displayFolder: 01 Conteos

	/// Cuántos campos de usuario del ERP tienen valores capturados en el filtro vigente.
	measure 'Campos de usuario distintos' = DISTINCTCOUNT('Campos de usuario'[campo])
		formatString: #,0
		displayFolder: 01 Conteos
"""

MEDIDAS_POR_TABLA["tipo_cambio"] = r"""
	/// Tasa promedio del período filtrado (moneda local por 1 unidad). Filtrar una moneda para leerla.
	measure 'Tipo de cambio promedio' = AVERAGE('Tipo de cambio'[tasa])
		formatString: #,0.0000
		displayFolder: 01 Tasa

	/// La tasa del último día con registro dentro del filtro.
	measure 'Tipo de cambio de cierre' = CALCULATE(AVERAGE('Tipo de cambio'[tasa]), LASTDATE('Tipo de cambio'[fecha]))
		formatString: #,0.0000
		displayFolder: 01 Tasa
"""

# ---------------------------------------------------------------------------------------------
# GAP-03 · NARRATIVA (§3.2 del contrato Power BI)
#
# Ningún número visible en un título, subtítulo o etiqueta puede estar escrito a mano: todos
# salen de estas medidas, que devuelven TEXTO. Viven en la carpeta `_Narrativa` de la tabla cuyo
# dato narran, y se nombran `Título de <página>` / `Subtítulo de <visual>` para que el panel de
# campos diga a qué visual pertenece cada una.
#
# Tres reglas que llevan dentro:
#   · Los importes se abrevian con `dax_importe_abreviado` y el símbolo sale del token @SIM@,
#     nunca de una "Q" literal — un tenant en dólares recibiría un título mintiendo la moneda.
#   · Nada de causalidad (§3.3): concentra, representa, exige. Nunca "por culpa de" ni "se debe a".
#   · Cifras de distinta naturaleza NO se suman para inventar un total mayor. Es la trampa fácil
#     de un título ejecutivo y produce exactamente la cifra que nadie puede reconstruir.
# ---------------------------------------------------------------------------------------------
_ABR = dax_importe_abreviado

MEDIDAS_POR_TABLA["dim_tiempo"] = rf"""
	/// El período que el usuario tiene seleccionado, dicho como lo diría una persona: "agosto 2026", "2026" o "todo el histórico". Todos los títulos de página lo usan, así que nadie tiene que mirar el segmentador para saber qué está viendo.
	measure 'Período activo' = VAR ini = MIN(Calendario[fecha]) VAR fin = MAX(Calendario[fecha]) VAR tini = CALCULATE(MIN(Calendario[fecha]), ALL(Calendario)) VAR tfin = CALCULATE(MAX(Calendario[fecha]), ALL(Calendario)) RETURN SWITCH(TRUE(), ini = tini && fin = tfin, "todo el histórico", YEAR(ini) = YEAR(fin) && ini = DATE(YEAR(ini), 1, 1) && fin = DATE(YEAR(fin), 12, 31), FORMAT(ini, "yyyy"), ini = DATE(YEAR(ini), MONTH(ini), 1) && fin = EOMONTH(ini, 0), FORMAT(ini, "mmmm") & " " & FORMAT(ini, "yyyy"), FORMAT(ini, "dd/MM/yyyy") & " – " & FORMAT(fin, "dd/MM/yyyy"))
		displayFolder: _Narrativa
"""

MEDIDAS_POR_TABLA["estado_carga"] += rf"""
	/// Hasta dónde se puede confiar: el dominio que va MÁS ATRASADO, no el que va más adelante. El máximo global no sirve como respuesta — en Cresta lo fija tipos de cambio, que trae tasas hasta julio de 2027, y contabilidad, con asientos del cierre por delante. El máximo POR DOMINIO ignora a la sociedad que no operó esos días; el mínimo entre dominios encuentra el eslabón débil.
	measure '_Dato más rezagado' = MINX(VALUES('Estado de carga'[dominio]), CALCULATE(MAX('Estado de carga'[fecha_dato_mas_reciente])))
		formatString: dd/MM/yyyy
		displayFolder: _Auxiliar
		isHidden

	/// Banda del pie de todas las páginas. Responde "¿hasta cuándo llega esto que estoy viendo?" antes de que el usuario tenga que preguntarlo, con los DOS relojes que el modelo distingue: el del pipeline (¿corrió la extracción?) y el de la operación (¿hasta cuándo hay dato?). Y avisa si algún dominio quedó rezagado, que es cuando un tablero correcto muestra una cifra vieja.
	measure 'Pie de frescura' = VAR f = [_Dato más rezagado] VAR d = [Días desde última extracción] VAR n = [Dominios desactualizados] RETURN IF(ISBLANK(f), "Sin datos cargados", "Dato del ERP al " & FORMAT(f, "d") & " de " & FORMAT(f, "mmmm") & " de " & FORMAT(f, "yyyy") & " · extraído hace " & FORMAT(d, "0") & IF(d = 1, " día", " días") & IF(n > 0, " · " & FORMAT(n, "0") & IF(n = 1, " dominio desactualizado", " dominios desactualizados"), ""))
		displayFolder: _Narrativa

	/// Título de la página 00.
	measure 'Título de Inicio' = "00 · Inicio · " & [Período activo]
		displayFolder: _Narrativa
"""

MEDIDAS_POR_TABLA["hecho_venta_linea"] += rf"""
	/// Título de la página 01.
	measure 'Título de Dirección' = "01 · Dirección · " & [Período activo]
		displayFolder: _Narrativa

	/// Subtítulo del visual de ejercicio (página 01). Habla de la serie del año en curso, no de un comparativo: el modelo arranca en 2026 y no hay año anterior que comparar (decisión de Edwin, 2026-08-08). Señala el mejor mes, que es la referencia contra la que el resto se lee.
	measure 'Subtítulo del ejercicio' = VAR t = [Ventas netas] VAR meses = VALUES(Calendario[anio_mes]) VAR n = COUNTROWS(meses) VAR mejor = MAXX(meses, CALCULATE([Ventas netas])) VAR etiq = CONCATENATEX(TOPN(1, meses, CALCULATE([Ventas netas]), DESC), CALCULATE(MAX(Calendario[mes_anio_etiqueta])), ", ") RETURN SWITCH(TRUE(), ISBLANK(t) || t = 0, "Sin venta en el período seleccionado", n <= 1, {_ABR('t')} & " en el período", {_ABR('t')} & " en el período · mejor mes: " & etiq & " con " & {_ABR('mejor')})
		displayFolder: _Narrativa

	/// Subtítulo de la tabla de alertas (página 01). Cuenta focos, NO suma sus importes: venta en riesgo, margen perdido, saldo vencido y backlog son cifras de distinta naturaleza y sumarlas produce un total que nadie puede reconstruir.
	measure 'Subtítulo de focos de la semana' = VAR n = IF([Venta anual en riesgo por quiebre] > 0, 1, 0) + IF([Margen perdido bajo costo] > 0, 1, 0) + IF([Vencido terceros hoy] > 0, 1, 0) + IF([Backlog vencido] > 0, 1, 0) + IF([Flujo neto próximas 4 semanas] < 0, 1, 0) RETURN IF(n = 0, "Ningún foco exige acción esta semana", FORMAT(n, "0") & IF(n = 1, " foco exige acción", " focos exigen acción") & " · cada uno se lee en su propia unidad, no se suman entre sí")
		displayFolder: _Narrativa

	/// Subtítulo del aporte por sociedad (página 01). Cuánto concentra la mayor: en un grupo de diez sociedades, la dependencia de una sola es la lectura que no da el ERP.
	measure 'Subtítulo de aporte por sociedad' = VAR t = [Ventas a terceros] VAR soc = FILTER(VALUES(Empresa[nombre]), [Ventas a terceros] <> 0) VAR n = COUNTROWS(soc) VAR mayor = MAXX(soc, [Ventas a terceros]) RETURN IF(ISBLANK(t) || t = 0, "Sin venta a terceros en el período", FORMAT(n, "0") & IF(n = 1, " sociedad con venta a terceros · ", " sociedades con venta a terceros · ") & "la mayor concentra " & FORMAT(DIVIDE(mayor, t), "0.0%"))
		displayFolder: _Narrativa
"""

MEDIDAS_POR_TABLA["metrica_venta_diaria"] += rf"""
	/// Subtítulo del ritmo del mes (página 01). El dato que decide DENTRO del mes: lo que va, contra los días hábiles ya trabajados y los que faltan. Con el período abierto lo dice en vez de mostrar una proyección que no significa nada — la proyección exige un mes.
	measure 'Subtítulo del ritmo del mes' = VAR meses = DISTINCTCOUNT(Calendario[anio_mes]) VAR proy = [Proyección de cierre de mes] VAR acum = [Ventas acumuladas mes] VAR hab = MAX(Calendario[dias_habiles_del_mes]) VAR trans = MAX(Calendario[dias_habiles_transcurridos]) RETURN SWITCH(TRUE(), meses <> 1, "Seleccioná un mes: la proyección de cierre se calcula sobre los días hábiles de un solo mes", ISBLANK(proy) || proy = 0, "Sin venta registrada en el mes", "Cierre proyectado " & {_ABR('proy')} & " · van " & {_ABR('acum')} & " en " & FORMAT(trans, "0") & " de " & FORMAT(hab, "0") & " días hábiles")
		displayFolder: _Narrativa
"""

MEDIDAS_POR_TABLA["hecho_cartera_cobrar"] += rf"""
	/// Título de la página 09.
	measure 'Título de Cartera y cobranza' = "09 · Cartera y cobranza · " & [Período activo]
		displayFolder: _Narrativa

	/// Subtítulo del aging (página 09). Declara la salvedad que más se malinterpreta en el tablero: el saldo es una FOTO y las tarjetas ignoran el período a propósito — recortarlo escondería las facturas viejas, que son justo las que hay que cobrar.
	measure 'Subtítulo del aging de terceros' = VAR s = [Por cobrar terceros hoy] VAR v = [Vencido terceros hoy] VAR p = [% Vencido terceros hoy] RETURN IF(ISBLANK(s) || s = 0, "Sin saldo por cobrar de terceros", {_ABR('s')} & " por cobrar de terceros · " & {_ABR('v')} & " vencido (" & FORMAT(p, "0.0%") & ") · foto de hoy, ignora el período seleccionado")
		displayFolder: _Narrativa

	/// Subtítulo de la agenda de cobro (página 09). Lo que vence en el período elegido, por fecha de VENCIMIENTO y no de documento: es la diferencia entre "qué facturé" y "qué tengo que cobrar".
	measure 'Subtítulo de la agenda de cobro' = VAR c = [Cobro que vence en el período] RETURN IF(ISBLANK(c) || c = 0, "Nada vence en " & [Período activo], {_ABR('c')} & " vence en " & [Período activo] & " · por fecha de vencimiento, no de documento")
		displayFolder: _Narrativa
"""

MEDIDAS_POR_TABLA["hecho_cartera_cobrar_diaria"] += rf"""
	/// Subtítulo de la tendencia de cobranza (página 09). La serie necesita cortes acumulados para decir algo: mientras haya pocos, el subtítulo lo declara en vez de dejar que una línea de tres puntos se lea como tendencia.
	measure 'Subtítulo de tendencia de cobranza' = VAR cortes = DISTINCTCOUNT('Cartera cobrar histórico'[fecha_corte]) RETURN SWITCH(TRUE(), ISBLANK(cortes) || cortes = 0, "Sin cortes acumulados todavía", cortes < 8, "Serie en formación · " & FORMAT(cortes, "0") & IF(cortes = 1, " corte acumulado", " cortes acumulados") & " · la tendencia gana sentido con las semanas", FORMAT(cortes, "0") & " cortes acumulados · porcentaje vencido sobre el total por cobrar de cada corte")
		displayFolder: _Narrativa
"""


# ---------------------------------------------------------------------------------------------
# GRUPO DE CÁLCULO: Moneda de análisis
#
# El pedido de negocio: "ver todo el dato en una u otra moneda" desde un filtro. Un grupo de
# cálculo hace exactamente eso: una tabla de un solo campo que, al filtrarse, cambia CÓMO se
# evalúa la medida seleccionada.
#   · 'Quetzales (local)'  → la medida tal cual (todos los importes _local ya vienen convertidos
#     a moneda local por el ERP — decisión C1: no se recalcula con tasas propias).
#   · 'Moneda original'    → conmuta las medidas base de importe a su columna *_doc (el importe
#     en la moneda del documento). SOLO tiene sentido leyéndolo con un filtro de Moneda activo:
#     sumar dólares con quetzales no es un número.
#
# FALLBACK EN TRES NIVELES (corregido 2026-08-06). Antes, todo lo que no estuviera enumerado en
# el SWITCH caía en SELECTEDMEASURE() y devolvía QUETZALES rotulados como moneda original —
# error silencioso: el número se veía bien y estaba mal. Poner BLANK() a todo tampoco sirve,
# porque borraría conteos, porcentajes y días, que no tienen moneda y nunca mintieron.
#
# El discriminador es el propio formato: por convención del generador TODA medida de importe
# lleva "Q" en su formatString. Entonces:
#   1. medida enumerada        → su columna *_doc
#   2. medida de importe NO enumerada (formato con "Q") → BLANK(), para no inventar
#   3. el resto (conteos, %, ratios, días) → pasa sin conmutar, que es lo correcto
# El nivel 2 se amplía solo: una medida de importe nueva queda protegida sin tocar nada aquí.
# Requiere discourageImplicitMeasures (ya activo) y compatibilityLevel >= 1470 (estamos en 1567).
# ---------------------------------------------------------------------------------------------
GRUPO_MONEDA = r"""table 'MD_Moneda de análisis'

	calculationGroup
		precedence: 1

		calculationItem 'Quetzales (local)' = SELECTEDMEASURE()
			ordinal: 0

		calculationItem 'Moneda original' = SWITCH(TRUE(), ISSELECTEDMEASURE([Ventas netas]), SUM(Ventas[monto_sin_impuesto_doc]), ISSELECTEDMEASURE([Ventas netas con IVA]), SUM(Ventas[monto_con_impuesto_doc]), ISSELECTEDMEASURE([Impuesto facturado]), SUM(Ventas[monto_impuesto_doc]), ISSELECTEDMEASURE([Compras netas]), SUM(Compras[monto_sin_impuesto_doc]), ISSELECTEDMEASURE([Compras netas con IVA]), SUM(Compras[monto_con_impuesto_doc]), ISSELECTEDMEASURE([Impuesto de compras]), SUM(Compras[monto_impuesto_doc]), ISSELECTEDMEASURE([Saldo por cobrar]), SUM('Cartera por cobrar'[saldo_pendiente_doc]), ISSELECTEDMEASURE([Saldo por pagar]), ABS(SUM('Cartera por pagar'[saldo_pendiente_doc])), ISSELECTEDMEASURE([Monto cobrado]), SUM('Pagos recibidos'[monto_doc]), ISSELECTEDMEASURE([Monto pagado]), SUM('Pagos efectuados'[monto_doc]), ISSELECTEDMEASURE([Saldo histórico por cobrar]), SUM('Cartera cobrar histórico'[saldo_pendiente_doc]), ISSELECTEDMEASURE([Saldo histórico por pagar]), ABS(SUM('Cartera pagar histórico'[saldo_pendiente_doc])), ISSELECTEDMEASURE([Monto pedido]), SUM(Pedidos[monto_sin_impuesto_doc]), CONTAINSSTRING(SELECTEDMEASUREFORMATSTRING(), "Q"), BLANK(), SELECTEDMEASURE())
			ordinal: 1
			formatStringDefinition = IF(ISSELECTEDMEASURE([Ventas netas], [Ventas netas con IVA], [Impuesto facturado], [Compras netas], [Compras netas con IVA], [Impuesto de compras], [Saldo por cobrar], [Saldo por pagar], [Monto cobrado], [Monto pagado], [Saldo histórico por cobrar], [Saldo histórico por pagar], [Monto pedido]), "#,0", SELECTEDMEASUREFORMATSTRING())

	column 'Moneda de análisis'
		dataType: string
		summarizeBy: none
		sourceColumn: Name
		sortByColumn: Ordinal

	column Ordinal
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Ordinal

	partition 'MD_Moneda de análisis' = calculationGroup
		mode: import
"""


# ---------------------------------------------------------------------------------------------
# PARÁMETROS DE CAMPO (field parameters): tablas MD_* que se usan como segmentador para que un
# mismo visual cambie de métrica con un clic (pedido de Edwin: centralizar vistas por montos /
# % / conteos sin multiplicar visuales). Cada entrada: (nombre sin prefijo, [(medida, tabla
# física donde vive)]). El orden de la lista es el orden del segmentador.
# ---------------------------------------------------------------------------------------------
PARAMETROS_CAMPO: list[tuple[str, list[tuple[str, str]]]] = [
    ("Vista de ventas", [
        ("Ventas netas", "hecho_venta_linea"),
        ("Ventas a terceros", "hecho_venta_linea"),
        ("Margen bruto", "hecho_venta_linea"),
        ("% Margen terceros", "hecho_venta_linea"),
        ("Devoluciones", "hecho_venta_linea"),
        ("Unidades vendidas", "hecho_venta_linea"),
        ("Ticket promedio", "hecho_venta_linea"),
        ("Documentos de venta", "hecho_venta_linea"),
    ]),
    ("Vista de cartera", [
        ("Saldo por cobrar", "hecho_cartera_cobrar"),
        ("Saldo por cobrar terceros", "hecho_cartera_cobrar"),
        ("Saldo vencido terceros", "hecho_cartera_cobrar"),
        ("% Vencido terceros", "hecho_cartera_cobrar"),
        ("Días de cartera terceros", "hecho_cartera_cobrar"),
        ("Saldo por pagar", "hecho_cartera_pagar"),
        ("Posición neta", "hecho_cartera_pagar"),
    ]),
    ("Vista de compras", [
        ("Compras netas", "hecho_compra_linea"),
        ("Compras a terceros", "hecho_compra_linea"),
        ("Documentos de compra", "hecho_compra_linea"),
        ("Compra promedio por documento", "hecho_compra_linea"),
        ("Proveedores con compra", "hecho_compra_linea"),
        ("% Variación de precio de compra", "hecho_compra_linea"),
        ("Sobrecosto por precio de compra", "hecho_compra_linea"),
    ]),
    # Los indicadores con los que se dirige la caja. El ciclo de conversión es el que resume
    # los otros tres: si sube, hay dinero atrapado y hay que saber en cuál de las tres patas.
    ("Vista de liquidez", [
        ("Ciclo de conversión de efectivo", "hecho_cartera_pagar"),
        ("Días de cartera terceros", "hecho_cartera_cobrar"),
        ("Días de inventario", "hecho_inventario"),
        ("Días de pago terceros", "hecho_cartera_pagar"),
        ("Efectividad de cobranza", "hecho_cartera_cobrar_diaria"),
        ("Posición neta", "hecho_cartera_pagar"),
        ("Flujo neto próximas 4 semanas", "proyeccion_caja_semanal"),
    ]),
    ("Vista de inventario", [
        ("Valor de inventario", "hecho_inventario"),
        ("Valor de inventario ocioso", "analisis_producto"),
        ("% Inventario ocioso", "analisis_producto"),
        ("Valor sin rotación comercial", "analisis_producto"),
        ("Productos en quiebre", "analisis_producto"),
        ("Venta anual en riesgo por quiebre", "analisis_producto"),
        ("Rotación de inventario 12M", "hecho_inventario"),
        ("Cobertura promedio en días", "analisis_producto"),
    ]),
    # Lo que se le enseña a un gerente cuando pregunta "¿cómo vamos?".
    ("Vista de rentabilidad", [
        ("% Margen operativo", "hecho_movimiento_contable"),
        ("% Gasto sobre ingreso", "hecho_movimiento_contable"),
        ("Resultado contable", "hecho_movimiento_contable"),
        ("% Margen terceros", "hecho_venta_linea"),
        ("Ventas bajo costo", "hecho_venta_linea"),
        ("Margen perdido bajo costo", "hecho_venta_linea"),
        ("Efecto precio", "hecho_venta_linea"),
        ("Efecto volumen", "hecho_venta_linea"),
    ]),
]


def gen_parametro_campo(nombre: str, campos: list[tuple[str, str]]) -> str:
    """TMDL de un parámetro de campo. La estructura (columna visible + columna NAMEOF oculta
    con extendedProperty ParameterMetadata + columna de orden) es exactamente la que Desktop
    genera con Modelado → Nuevo parámetro; se produce aquí para que viva en el modelo
    versionado y no en el archivo de dashboards."""
    tabla = f"MD_{nombre}"
    col_campo = f"{nombre} · campo"
    col_orden = f"{nombre} · orden"
    filas = ",\n".join(
        f'\t\t\t\t  ("{medida}", NAMEOF({tmdl_nombre(ETIQUETA[t])}[{medida}]), {i})'
        for i, (medida, t) in enumerate(campos)
    )
    return f"""table '{tabla}'

\tcolumn '{nombre}'
\t\tdataType: string
\t\tsummarizeBy: none
\t\tsourceColumn: [Value1]
\t\tsortByColumn: '{col_orden}'
\t\trelatedColumnDetails
\t\t\tgroupByColumn: '{col_campo}'

\tcolumn '{col_campo}'
\t\tdataType: string
\t\tisHidden
\t\tsummarizeBy: none
\t\tsourceColumn: [Value2]
\t\textendedProperty ParameterMetadata =
\t\t\t\t{{
\t\t\t\t  "version": 3,
\t\t\t\t  "kind": 2
\t\t\t\t}}

\tcolumn '{col_orden}'
\t\tdataType: int64
\t\tisHidden
\t\tsummarizeBy: none
\t\tsourceColumn: [Value3]

\tpartition '{tabla}' = calculated
\t\tmode: import
\t\tsource =
\t\t\t\t{{
{filas}
\t\t\t\t}}
"""


PALABRAS = ("table", "column", "measure", "partition", "hierarchy", "level", "relationship",
            "annotation", "ref", "model", "database", "expression", "mode", "source",
            "dataCategory", "culture", "calculationGroup", "calculationItem",
            "formatStringDefinition", "relatedColumnDetails")


def validar_tmdl(ruta: Path) -> list[str]:
    """Verifica que cada línea sea una construcción TMDL válida.

    Existe por un fallo real: una expresión DAX multilínea puesta debajo de `measure X = ///…`
    produce líneas como `DIVIDE(` que TMDL rechaza con `InvalidLineType: Other`, y el modelo
    entero no abre. El error solo aparecía en Power BI Desktop, así que se valida aquí.
    """
    fallos: list[str] = []
    for f in sorted(ruta.rglob("*.tmdl")):
        en_source = False
        sangria_source = 0
        for i, linea in enumerate(f.read_text(encoding="utf-8").split("\n"), start=1):
            if not linea.strip():
                continue
            sangria = len(linea) - len(linea.lstrip("\t"))
            # Dentro del bloque `source =` va código M: cualquier línea vale mientras esté
            # más indentada que la declaración.
            if en_source:
                if sangria > sangria_source:
                    continue
                en_source = False
            s = linea.strip()
            if s.startswith("///") or s.startswith("//"):
                continue
            primera = s.split()[0].rstrip(":")
            # Bloques de contenido libre: código M (source), DAX de tabla calculada (los
            # parámetros de campo) y el JSON de extendedProperty. Cualquier línea vale
            # mientras esté más indentada que la declaración.
            if primera in ("source", "extendedProperty") or s.startswith("source ="):
                en_source, sangria_source = True, sangria
                continue
            if primera in PALABRAS:
                continue
            if ":" in s:                       # propiedad  nombre: valor
                continue
            if s.isidentifier() or s in ("isHidden", "isKey", "legacyRedirects",
                                         "returnErrorValuesAsNull", "discourageImplicitMeasures"):
                continue                        # flag booleano
            fallos.append(f"{f.name}:{i}  linea no valida para TMDL -> {s[:60]}")
    return fallos


def validar_referencias(defi: Path) -> list[str]:
    """Comprueba que toda medida referenciada con [Nombre] exista, y que las tablas y columnas
    citadas en relaciones y medidas estén declaradas.

    Existe porque al mover las medidas de una tabla única a su tabla propia es fácil dejar una
    referencia cruzada colgando (p. ej. 'Posición neta' en Cartera por pagar usa [Saldo por
    cobrar], que vive en Cartera por cobrar). Power BI no avisa al guardar el TMDL: falla al
    recalcular, con el modelo ya cargado y el usuario delante.
    """
    import re

    medidas: set[str] = set()
    tablas: set[str] = set()
    columnas_por_tabla: dict[str, set[str]] = {}
    # El nombre de medida es GLOBAL en el modelo, no por tabla: dos medidas homónimas en tablas
    # distintas no rompen el TMDL pero impiden que Desktop cargue el modelo. Se registra dónde
    # está cada una para poder señalar el choque.
    donde_medida: dict[str, list[str]] = {}
    for f in sorted((defi / "tables").glob("*.tmdl")):
        tabla_actual = ""
        for linea in f.read_text(encoding="utf-8").split("\n"):
            s = linea.strip()
            m = re.match(r"^table\s+('([^']+)'|\S+)", s)
            if m:
                tabla_actual = m.group(2) or m.group(1)
                tablas.add(tabla_actual)
                columnas_por_tabla.setdefault(tabla_actual, set())
            m = re.match(r"^measure\s+('([^']+)'|[^\s=]+)", s)
            if m:
                nombre_medida = m.group(2) or m.group(1)
                medidas.add(nombre_medida)
                donde_medida.setdefault(nombre_medida, []).append(tabla_actual)
            m = re.match(r"^column\s+('([^']+)'|\S+)", s)
            if m and tabla_actual:
                columnas_por_tabla[tabla_actual].add(m.group(2) or m.group(1))

    fallos: list[str] = []

    # Nombres de medida repetidos. Es el error que más caro sale: el TMDL es válido, el
    # generador termina en verde y Desktop revienta al abrir el modelo.
    for nombre, ubicaciones in sorted(donde_medida.items()):
        if len(ubicaciones) > 1:
            fallos.append(f"medida '{nombre}' duplicada en: {', '.join(ubicaciones)}")

    # Referencias a medidas dentro de expresiones DAX (medidas Y calculation items).
    for f in sorted((defi / "tables").glob("*.tmdl")):
        for i, linea in enumerate(f.read_text(encoding="utf-8").split("\n"), start=1):
            s = linea.strip()
            if not (s.startswith("measure ") or s.startswith("calculationItem ")):
                continue
            for ref in re.findall(r"(?<![\w'\]])\[([^\]]+)\]", s.split("=", 1)[-1]):
                # `[@x]` es una columna extendida creada por ADDCOLUMNS/SELECTCOLUMNS dentro
                # de la propia expresión, no una medida del modelo. Es la convención habitual
                # para nombrarlas y así se distinguen de una referencia colgando.
                if ref.startswith("@"):
                    continue
                if ref not in medidas:
                    fallos.append(f"{f.name}:{i}  medida [{ref}] no existe en el modelo")

    # Referencias Tabla[columna] dentro de expresiones DAX.
    for f in sorted((defi / "tables").glob("*.tmdl")):
        for i, linea in enumerate(f.read_text(encoding="utf-8").split("\n"), start=1):
            s = linea.strip()
            if not (s.startswith("measure ") or s.startswith("calculationItem ")):
                continue
            for m in re.finditer(r"(?:'([^']+)'|\b([A-Za-zÁÉÍÓÚÑáéíóúñ_]\w*))\[([^\]]+)\]", s):
                tab = m.group(1) or m.group(2)
                col = m.group(3)
                if tab in medidas or col in medidas:
                    continue
                if tab not in tablas:
                    fallos.append(f"{f.name}:{i}  tabla '{tab}' no existe (en {tab}[{col}])")
                elif col not in columnas_por_tabla.get(tab, set()):
                    fallos.append(f"{f.name}:{i}  columna {tab}[{col}] no existe")

    # Relaciones: ambos extremos deben existir.
    rel = defi / "relationships.tmdl"
    if rel.exists():
        for i, linea in enumerate(rel.read_text(encoding="utf-8").split("\n"), start=1):
            s = linea.strip()
            m = re.match(r"^(fromColumn|toColumn):\s*(?:'([^']+)'|(\S+?))\.(\S+)$", s)
            if not m:
                continue
            tab = m.group(2) or m.group(3)
            col = m.group(4)
            if tab not in tablas:
                fallos.append(f"relationships.tmdl:{i}  tabla '{tab}' no existe")
            elif col not in columnas_por_tabla.get(tab, set()):
                fallos.append(f"relationships.tmdl:{i}  columna {tab}.{col} no existe")
    return fallos


def validar_calendario(cur) -> list[str]:
    """Comprueba EN LOS DATOS los requisitos de una tabla de fechas de Power BI.

    Existe por un fallo real: `dim_tiempo` traía una fila "No definido" con fecha nula y Power BI
    rechazó el modelo completo al cargar ("contiene valores en blanco y esto no se permite para
    las columnas que se usan como clave principal"). La sintaxis del TMDL era correcta, así que
    solo se detectaba abriendo Desktop. Requisitos: única, sin nulos y contigua.
    """
    cur.execute("""
        select count(*),
               count(*) filter (where fecha is null),
               count(*) - count(distinct fecha),
               (max(fecha) - min(fecha) + 1) = count(*)
          from oro.dim_tiempo
    """)
    filas, nulas, dup, contigua = cur.fetchone()
    fallos = []
    if nulas:
        fallos.append(f"dim_tiempo.fecha tiene {nulas} nulos — Power BI no carga el modelo")
    if dup:
        fallos.append(f"dim_tiempo.fecha tiene {dup} duplicados — la clave debe ser única")
    if not contigua:
        fallos.append("dim_tiempo.fecha no es contigua — 'Marcar como tabla de fecha' fallará")
    return fallos


def main() -> int:
    base, proyecto, salida = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    host = os.environ.get("POSTGRES_HOST", "localhost")
    dsn = (f"host={host} port={os.environ.get('POSTGRES_PORT','5432')} dbname={base} "
           f"user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}")

    sm = salida / f"{proyecto}.SemanticModel"
    defi = sm / "definition"
    (defi / "tables").mkdir(parents=True, exist_ok=True)
    rep = salida / f"{proyecto}.Report"
    rep.mkdir(parents=True, exist_ok=True)

    conn = psycopg.connect(dsn); conn.read_only = True; cur = conn.cursor()

    # Moneda de presentación de la organización: define el símbolo de TODAS las medidas
    # de importe y el modo local del grupo de cálculo (genericidad multi-tenant).
    moneda = moneda_presentacion_de(base)
    print(f"  moneda de presentación: {moneda} (símbolo '{SIMBOLO_MONEDA.get(moneda, moneda)}')")

    problemas_datos = validar_calendario(cur)

    # Se limpian los .tmdl de la corrida anterior: tras el renombrado con prefijos DM_/FC_/MD_,
    # dejar los archivos con el nombre viejo haría que Desktop cargara cada tabla dos veces.
    for p in (defi / "tables").glob("*.tmdl"):
        p.unlink()

    presentes, rel_cols = [], {}
    for tabla in DIMENSIONES + HECHOS:
        cols = columnas(cur, tabla)
        if not cols:
            print(f"  [!] {tabla} no existe en oro — se omite")
            continue
        presentes.append(tabla)
        rel_cols[tabla] = {c for c, _ in cols}
        (defi / "tables" / f"{ETIQUETA.get(tabla, tabla)}.tmdl").write_text(
            aplicar_moneda(gen_tabla(tabla, cols, base), moneda), encoding="utf-8")
    # Ya no hay tabla única de métricas: cada medida vive en la tabla que mide. Si quedó de una
    # generación anterior se borra, o Desktop cargaría medidas duplicadas.
    viejo = defi / "tables" / "_ Métricas.tmdl"
    if viejo.exists():
        viejo.unlink()

    # Grupo de cálculo de moneda (no sale de oro: es puro modelo).
    (defi / "tables" / f"{GRUPO_MONEDA_NOMBRE}.tmdl").write_text(
        aplicar_moneda(renombrar_dax(GRUPO_MONEDA), moneda), encoding="utf-8")

    # Parámetros de campo (segmentador que conmuta la métrica del visual). Solo con medidas
    # de tablas presentes en esta base.
    parametros_escritos: list[str] = []
    for nombre_par, campos_par in PARAMETROS_CAMPO:
        vivos = [(m, t) for m, t in campos_par if t in presentes]
        if not vivos:
            continue
        (defi / "tables" / f"MD_{nombre_par}.tmdl").write_text(
            gen_parametro_campo(nombre_par, vivos), encoding="utf-8")
        parametros_escritos.append(f"MD_{nombre_par}")

    # ---------------- limpieza de artefactos de Power BI Desktop ----------------
    # Al abrir el proyecto, Desktop crea una tabla de fechas oculta por cada columna de fecha
    # ("fecha y hora automáticas"): LocalDateTable_<guid> y DateTableTemplate_<guid>. Aquí
    # sobran y estorban:
    #   - el modelo ya tiene `dim_tiempo` marcada como calendario, que es la única que debe
    #     gobernar la inteligencia de tiempo;
    #   - al regenerar relationships.tmdl sus relaciones desaparecen y quedan huérfanas, lo que
    #     puede impedir que el modelo abra;
    #   - infla el .pbix con una tabla por cada columna de fecha del modelo.
    # Se borran junto al caché del modelo (.pbi/cache.abf), que Desktop regenera solo.
    huerfanas = [p for p in (defi / "tables").glob("*.tmdl")
                 if p.stem.startswith(("LocalDateTable_", "DateTableTemplate_"))]
    for p in huerfanas:
        p.unlink()
    cache = sm / ".pbi" / "cache.abf"
    if cache.exists():
        cache.unlink()
    if huerfanas:
        print(f"  limpiadas {len(huerfanas)} tablas de fecha automatica de Desktop")
    conn.close()

    # ---------------- relaciones: dimensión 1 → N hecho, dirección simple ----------------
    mapa = [
        ("dim_tiempo", "tiempo_clave"), ("dim_cliente", "cliente_clave"),
        ("dim_proveedor", "proveedor_clave"), ("dim_socio_negocio", "socio_clave"),
        ("dim_direccion", "direccion_clave"), ("dim_producto", "producto_clave"),
        ("dim_vendedor", "vendedor_clave"), ("dim_organizacion", "organizacion_clave"),
        ("dim_almacen", "almacen_clave"), ("dim_moneda", "moneda_clave"),
        ("dim_cuenta", "cuenta_clave"), ("dim_centro_costo", "centro_costo_clave"),
        ("dim_tipo_documento", "tipo_documento_clave"),
    ]
    rels, n = [], 0
    for hecho in [h for h in HECHOS if h in presentes]:
        for dim, clave in mapa:
            if dim not in presentes or clave not in rel_cols.get(hecho, ()):
                continue
            if clave not in rel_cols.get(dim, ()):
                continue
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                f"\tfromColumn: {tmdl_nombre(ETIQUETA[hecho])}.{clave}",
                f"\ttoColumn: {tmdl_nombre(ETIQUETA[dim])}.{clave}",
                "",
            ]
        # Las fotos diarias se fechan por el CORTE, no por la fecha del documento.
        if "fecha_corte_clave" in rel_cols.get(hecho, ()):
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                f"	fromColumn: {tmdl_nombre(ETIQUETA[hecho])}.fecha_corte_clave",
                f"	toColumn: {tmdl_nombre(ETIQUETA['dim_tiempo'])}.tiempo_clave",
                "",
            ]
        # La fecha de vencimiento es una segunda relación con el calendario: queda INACTIVA
        # para no competir con la fecha del documento (se invoca con USERELATIONSHIP).
        if "tiempo_vencimiento_clave" in rel_cols.get(hecho, ()):
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                "\tisActive: false",
                f"\tfromColumn: {tmdl_nombre(ETIQUETA[hecho])}.tiempo_vencimiento_clave",
                f"\ttoColumn: {tmdl_nombre(ETIQUETA['dim_tiempo'])}.tiempo_clave",
                "",
            ]
        # Antigüedad de cartera: por CLAVE ENTERA. Antes la relación se hacía por la etiqueta
        # de texto ('1-30', '+90') para no tener que añadir una columna a los cuatro hechos.
        # El argumento de que "son solo 6 valores" mira la cardinalidad y no el tamaño: la
        # columna de relación se materializa en CADA fila, y las dos fotos diarias de cartera
        # son las tablas más grandes del modelo y crecen todos los días. Una relación por texto
        # ahí cuesta memoria y velocidad de forma permanente. Las claves las produce la misma
        # macro que la etiqueta (`aging_rango`), así que no pueden separarse del catálogo, y el
        # test de `relationships` de dbt sigue vigilando la etiqueta.
        if "dim_rango_aging" in presentes and "rango_aging_clave" in rel_cols.get(hecho, ()):
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                f"\tfromColumn: {tmdl_nombre(ETIQUETA[hecho])}.rango_aging_clave",
                f"\ttoColumn: {tmdl_nombre(ETIQUETA['dim_rango_aging'])}.rango_aging_clave",
                "",
            ]

    # Clasificación ABC ↔ Cliente: una fila por cliente, así que es 1:1 y se comporta como una
    # extensión de la dimensión. El filtrado cruzado va en ambos sentidos para que al elegir la
    # clase A se filtren las ventas; en 1:1 eso no introduce ambigüedad (con dos filas por
    # cliente sí la habría, y es la razón por la que el modelo de Oro pivotea los ámbitos).
    # Las clasificaciones tienen grano ANUAL y cuelgan de la dimensión Año. Antes no tenían
    # ninguna relación con el tiempo: al filtrar 2024 se devolvía la clasificación del último
    # año procesado, un número plausible y equivocado. Se usa una dimensión Año intermedia en
    # vez de un muchos-a-muchos contra el calendario porque Power BI resuelve las M:M filtrando
    # en ambas direcciones, que es la propagación cruzada que se acaba de eliminar.
    for ext in ("clasificacion_abc_cliente", "clasificacion_abc_proveedor"):
        if ext in presentes and "dim_anio" in presentes:
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                f"	fromColumn: {tmdl_nombre(ETIQUETA[ext])}.anio_clave",
                f"	toColumn: {tmdl_nombre(ETIQUETA['dim_anio'])}.anio_clave",
                "",
            ]

    # El calendario también cuelga del Año, y esa es la pieza que hace usable el diseño: con un
    # solo segmentador de 'Año de clasificación' se acotan a la vez las clasificaciones Y los
    # hechos (Año → Calendario → hechos). Al revés no propaga, que es lo correcto: un rango de
    # marzo a mayo no define una clase ABC anual.
    if "dim_anio" in presentes and "dim_tiempo" in presentes:
        n += 1
        rels += [
            f"relationship rel_{n:03d}",
            f"	fromColumn: {tmdl_nombre(ETIQUETA['dim_tiempo'])}.anio",
            f"	toColumn: {tmdl_nombre(ETIQUETA['dim_anio'])}.anio_clave",
            "",
        ]

    # Extensiones 1:1 de una dimensión (clasificaciones y ficha de producto).
    #
    # DIRECCIÓN SIMPLE, no bidireccional. Antes eran `bothDirections` y tres de ellas colgaban
    # de la MISMA dimensión (Cliente), lo que crea propagación cruzada entre clasificaciones
    # —filtrar por clase ABC alteraba el RFM y el comportamiento de pago sin que nadie lo
    # pidiera— y encarece cada consulta. Las 31 medidas de estas tablas son autocontenidas:
    # agregan columnas propias (`venta_anio`, `saldo_total`, `monto_neto_12m`) o cuentan sus
    # propias filas, así que no dependían de la propagación.
    #
    # Lo que SÍ dependía son tres medidas de la ficha de producto que acotan
    # [Valor de inventario] por estado; se reescribieron con TREATAS explícito, que es la vía
    # correcta: el filtro viaja solo donde la medida lo pide, no globalmente.
    #
    # Segmentar Ventas por clase ABC desde el panel de campos se recupera con las columnas de
    # clasificación vigente desnormalizadas en Cliente y Proveedor (Fase 6), no reactivando
    # esto.
    for ext, dim, clave in (
        ("clasificacion_abc_cliente", "dim_cliente", "cliente_clave"),
        ("clasificacion_abc_proveedor", "dim_proveedor", "proveedor_clave"),
        ("clasificacion_rfm_cliente", "dim_cliente", "cliente_clave"),
        ("comportamiento_pago_cliente", "dim_cliente", "cliente_clave"),
        ("analisis_producto", "dim_producto", "producto_clave"),
    ):
        if ext in presentes and dim in presentes:
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                f"\tfromColumn: {tmdl_nombre(ETIQUETA[ext])}.{clave}",
                f"\ttoColumn: {tmdl_nombre(ETIQUETA[dim])}.{clave}",
                "",
            ]

    (defi / "relationships.tmdl").write_text("\n".join(rels), encoding="utf-8")

    # ---------------- parámetros de conexión ----------------
    (defi / "expressions.tmdl").write_text(
        'expression Servidor = "' + host + '" meta [IsParameterQuery=true, Type="Text", '
        'IsParameterQueryRequired=true]\n'
        "\tlineageTag: par-servidor\n\n"
        'expression BaseDatos = "' + base + '" meta [IsParameterQuery=true, Type="Text", '
        'IsParameterQueryRequired=true]\n'
        "\tlineageTag: par-basedatos\n", encoding="utf-8")

    # El compatibilityLevel NUNCA baja: al abrir el proyecto, Desktop migra el modelo al nivel
    # que soporta (1606 al 2026-08) y volver a escribir 1567 lo degradaría en cada corrida —
    # diff perpetuo y, si alguna medida usara una función del nivel nuevo, un modelo que no abre.
    nivel, encabezado = COMPATIBILITY_LEVEL_MINIMO, f"database {proyecto}"
    db_path = defi / "database.tmdl"
    if db_path.exists():
        previo = db_path.read_text(encoding="utf-8")
        m = re.search(r"compatibilityLevel:\s*(\d+)", previo)
        if m:
            nivel = max(nivel, int(m.group(1)))
        # Desktop deja la declaración sin nombre; ambas formas son TMDL válido, así que se
        # respeta la existente para no generar un diff en cada corrida.
        if previo.lstrip().startswith("database"):
            encabezado = previo.lstrip().splitlines()[0].rstrip()
    db_path.write_text(f"{encabezado}\n\tcompatibilityLevel: {nivel}\n", encoding="utf-8")

    refs = "\n".join(f"ref table {tmdl_nombre(ETIQUETA.get(t, t))}" for t in presentes)
    refs += f"\nref table {tmdl_nombre(GRUPO_MONEDA_NOMBRE)}"
    for nombre_par in parametros_escritos:
        refs += f"\nref table {tmdl_nombre(nombre_par)}"
    (defi / "model.tmdl").write_text(
        "model Model\n"
        "\tculture: es-GT\n"
        "\tdefaultPowerBIDataSourceVersion: powerBI_V3\n"
        "\tdiscourageImplicitMeasures\n"
        "\tsourceQueryCulture: es-GT\n"
        "\tdataAccessOptions\n"
        "\t\tlegacyRedirects\n"
        "\t\treturnErrorValuesAsNull\n\n"
        # Desactiva las tablas de fecha automáticas: `dim_tiempo` es el único calendario del
        # modelo. Sin esto Desktop las vuelve a crear en cuanto se abre el proyecto.
        'annotation __PBI_TimeIntelligenceEnabled = 0\n\n'
        "annotation PBI_QueryOrder = [\"Servidor\",\"BaseDatos\"]\n\n"
        f"{refs}\n", encoding="utf-8")

    escribir_conservando(sm / "definition.pbism", {"version": "4.0", "settings": {}})

    escribir_conservando(rep / "definition.pbir", {
        "version": "1.0",
        "datasetReference": {"byPath": {"path": f"../{proyecto}.SemanticModel"}},
    }, claves_propias=("datasetReference",))

    # SOLO si no existe NINGÚN formato de reporte: regenerar el modelo NUNCA debe pisar las
    # páginas y visuales que el usuario haya construido. OJO: al guardar desde Desktop, el
    # reporte migra al formato PBIR (carpeta definition/) y el report.json legado DESAPARECE —
    # si aquí solo se comprobara report.json, se escribiría un stub que rompe el proyecto
    # (Desktop no admite ambos formatos a la vez). Pasó el 2026-08-02; no repetirlo.
    if not (rep / "report.json").exists() and not (rep / "definition").exists():
        (rep / "report.json").write_text(json.dumps({
            "config": json.dumps({
                "version": "5.43",
                "themeCollection": {"baseTheme": {"name": "CY24SU10", "version": "5.55", "type": 2}},
            }),
            "layoutOptimization": 0,
            "resourcePackages": [{"resourcePackage": {
                "disabled": False,
                "items": [{"name": "CY24SU10", "path": "BaseThemes/CY24SU10.json", "type": 202}],
                "name": "SharedResources", "type": 2}}],
            "sections": [{
                "config": "{}", "displayName": "Pulso", "displayOption": 1, "filters": "[]",
                "height": 720.0, "name": "pagina_pulso", "ordinal": 0,
                "visualContainers": [], "width": 1280.0,
            }],
            "filters": "[]",
            "publicCustomVisuals": [],
        }, indent=2, ensure_ascii=False), encoding="utf-8")

    escribir_conservando(salida / f"{proyecto}.pbip", {
        "version": "1.0",
        "artifacts": [{"report": {"path": f"{proyecto}.Report"}}],
        "settings": {"enableAutoRecovery": True},
    }, claves_propias=("artifacts",))

    fallos = problemas_datos + validar_tmdl(defi) + validar_referencias(defi)
    if fallos:
        print(f"FALLO · {proyecto} · TMDL invalido:")
        for x in fallos:
            print(f"   {x}")
        return 1

    print(f"OK · {proyecto} · {len(presentes)} tablas · {n} relaciones · base {base} · TMDL valido")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
