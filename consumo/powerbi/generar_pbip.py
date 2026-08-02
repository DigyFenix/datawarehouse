"""Genera un proyecto Power BI (PBIP) con el modelo semántico en TMDL desde el esquema `oro`.

Se introspecciona la base en vez de escribir 17 archivos a mano: los tipos, nombres y columnas
salen del modelo real, así que el PBIP no puede quedar desincronizado del warehouse.

Uso:  python generar_pbip.py <base> <nombre_proyecto> <carpeta_salida>
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

for _p in [Path.cwd(), *Path.cwd().parents]:
    if (_p / ".env").exists():
        load_dotenv(_p / ".env")
        break

# ---------------------------------------------------------------- qué entra al modelo
DIMENSIONES = [
    "dim_tiempo", "dim_cliente", "dim_proveedor", "dim_producto", "dim_vendedor",
    "dim_organizacion", "dim_almacen", "dim_moneda", "dim_cuenta", "dim_centro_costo",
    "dim_tipo_documento", "dim_rango_aging", "clasificacion_abc_cliente",
    "clasificacion_abc_proveedor",
]
HECHOS = [
    "hecho_venta_linea", "hecho_compra_linea",
    "hecho_cartera_cobrar", "hecho_cartera_pagar",
    "hecho_cartera_cobrar_diaria", "hecho_cartera_pagar_diaria",
    "hecho_pago_recibido", "hecho_pago_efectuado", "hecho_inventario",
    "tipo_cambio", "campo_usuario",
]

# Formato de moneda local: quetzales sin decimales. Las medidas de importe lo llevan TODAS;
# la conmutación a la moneda original del documento la hace el grupo de cálculo
# 'Moneda de análisis' (ver gen_grupo_moneda), que quita la Q en ese modo.
FMT_Q = '"Q" #,0'

# Nombres amigables: el usuario de negocio no debería ver `hecho_` ni `dim_`.
ETIQUETA = {
    "dim_tiempo": "Calendario", "dim_cliente": "Cliente", "dim_proveedor": "Proveedor",
    "dim_producto": "Producto", "dim_vendedor": "Vendedor", "dim_organizacion": "Empresa",
    "dim_almacen": "Bodega", "dim_moneda": "Moneda", "dim_cuenta": "Cuenta contable",
    "dim_centro_costo": "Centro de costo", "dim_tipo_documento": "Tipo de documento",
    "dim_rango_aging": "Antigüedad", "clasificacion_abc_cliente": "Clasificación ABC",
    "clasificacion_abc_proveedor": "Clasificación ABC Proveedor",
    "hecho_venta_linea": "Ventas", "hecho_compra_linea": "Compras",
    "hecho_cartera_cobrar": "Cartera por cobrar", "hecho_cartera_pagar": "Cartera por pagar",
    "hecho_cartera_cobrar_diaria": "Cartera cobrar histórico",
    "hecho_cartera_pagar_diaria": "Cartera pagar histórico",
    "hecho_pago_recibido": "Pagos recibidos", "hecho_pago_efectuado": "Pagos efectuados",
    "hecho_inventario": "Inventario", "tipo_cambio": "Tipo de cambio",
    "campo_usuario": "Campos de usuario",
}

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
    # `rango_aging` es la columna de relación con los hechos, pero es el código crudo
    # ('+90', '1-30'). El usuario debe arrastrar `rango_aging_nombre`, que sí está ordenado.
    if tabla == "dim_rango_aging" and col == "rango_aging":
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
        L.append(medidas.strip("\n"))
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
	/// Base de todo: venta sin impuestos, con la nota de crédito ya en negativo.
	measure 'Ventas netas' = SUM(Ventas[monto_sin_impuesto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Ventas netas con IVA' = SUM(Ventas[monto_con_impuesto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Ventas brutas' = CALCULATE([Ventas netas], 'Tipo de documento'[tipo_documento] = "factura")
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure Devoluciones = ABS(CALCULATE([Ventas netas], 'Tipo de documento'[tipo_documento] = "nota_credito"))
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Impuesto facturado' = SUM(Ventas[monto_impuesto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Descuento otorgado' = SUM(Ventas[monto_descuento_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure '% Descuento' = DIVIDE([Descuento otorgado], [Ventas netas] + [Descuento otorgado])
		formatString: 0.0%
		displayFolder: 01 Importes

	/// Saldo pendiente de las facturas visibles, prorrateado por línea (suma = saldo del documento). INFORMATIVO: la cartera oficial sale del mayor.
	measure 'Saldo de facturas' = SUM(Ventas[saldo_pendiente_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// El mercado real. La venta al grupo no compite por precio: mezclarla distorsiona todo indicador comercial.
	measure 'Ventas a terceros' = CALCULATE([Ventas netas], Cliente[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	measure 'Ventas al grupo' = CALCULATE([Ventas netas], Cliente[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	measure '% Venta al grupo' = DIVIDE([Ventas al grupo], [Ventas netas])
		formatString: 0.0%
		displayFolder: 02 Terceros vs grupo

	measure 'Unidades vendidas' = SUM(Ventas[cantidad])
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Líneas de venta' = COUNTROWS(Ventas)
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Documentos de venta' = DISTINCTCOUNT(Ventas[documento_id])
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Clientes con venta' = CALCULATE(DISTINCTCOUNT(Ventas[cliente_clave]), Ventas[monto_sin_impuesto_local] <> 0)
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Productos vendidos' = DISTINCTCOUNT(Ventas[producto_clave])
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Ticket promedio' = DIVIDE([Ventas netas], [Documentos de venta])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	measure 'Precio promedio unidad' = DIVIDE([Ventas netas], [Unidades vendidas])
		formatString: "Q" #,0.00
		displayFolder: 04 Promedios

	measure 'Venta promedio por línea' = DIVIDE([Ventas netas], [Líneas de venta])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Promedio sobre los días que SÍ hubo venta: no diluye con domingos y feriados.
	measure 'Venta promedio diaria' = DIVIDE([Ventas netas], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Ventas))
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	measure 'Venta promedio por cliente' = DIVIDE([Ventas netas], [Clientes con venta])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	measure 'Costo de ventas' = SUM(Ventas[costo_local])
		formatString: "Q" #,0
		displayFolder: 05 Rentabilidad

	measure 'Margen bruto' = SUM(Ventas[margen_local])
		formatString: "Q" #,0
		displayFolder: 05 Rentabilidad

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

	measure 'Ventas año anterior' = CALCULATE([Ventas netas], DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Acumulado del mes en curso hasta el último día con datos del filtro.
	measure 'Ventas acumuladas mes' = TOTALMTD([Ventas netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	measure 'Ventas acumuladas trimestre' = TOTALQTD([Ventas netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	measure 'Ventas acumuladas año' = TOTALYTD([Ventas netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// El acumulado del año PASADO al mismo corte: el comparable correcto del YTD.
	measure 'Ventas acumuladas año anterior' = CALCULATE(TOTALYTD([Ventas netas], Calendario[fecha]), DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	measure 'Variación vs mes anterior' = DIVIDE([Ventas netas] - [Ventas mes anterior], [Ventas mes anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 06 Comparativos

	measure 'Variación vs año anterior' = DIVIDE([Ventas netas] - [Ventas año anterior], [Ventas año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 06 Comparativos

	measure 'Variación acumulada vs año anterior' = DIVIDE([Ventas acumuladas año] - [Ventas acumuladas año anterior], [Ventas acumuladas año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 06 Comparativos

	/// Promedio MENSUAL de los últimos 3 meses: alisa el diente de sierra de la facturación. (Iterar días con DATESINPERIOD daba un promedio diario disfrazado de mensual.)
	measure 'Media móvil 3 meses' = CALCULATE(AVERAGEX(VALUES(Calendario[anio_mes]), [Ventas netas]), DATESINPERIOD(Calendario[fecha], MAX(Calendario[fecha]), -3, MONTH))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Año móvil: los últimos 12 meses completos desde el corte. Quita la estacionalidad del calendario.
	measure 'Ventas 12 meses móviles' = CALCULATE([Ventas netas], DATESINPERIOD(Calendario[fecha], MAX(Calendario[fecha]), -12, MONTH))
		formatString: "Q" #,0
		displayFolder: 06 Comparativos

	/// Venta de líneas sin artículo (servicios, fletes, gastos) — el miembro SERVICIO de Producto.
	measure 'Ventas de servicios' = CALCULATE([Ventas netas], Producto[producto_codigo] = "SERVICIO")
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Posición del cliente ordenado por venta a terceros, dentro del filtro vigente.
	measure 'Ranking de cliente por venta' = RANKX(ALLSELECTED(Cliente), [Ventas a terceros])
		formatString: #,0
		displayFolder: 07 Pareto

	/// Curva de Pareto: % de la venta a terceros que acumulan este cliente y los mayores que él.
	measure '% acumulado de venta clientes' = VAR actual = [Ventas a terceros] RETURN DIVIDE(SUMX(FILTER(ALLSELECTED(Cliente), [Ventas a terceros] >= actual), [Ventas a terceros]), CALCULATE([Ventas a terceros], ALLSELECTED(Cliente)))
		formatString: 0.0%
		displayFolder: 07 Pareto

	measure 'Ranking de producto por venta' = RANKX(ALLSELECTED(Producto), [Ventas netas])
		formatString: #,0
		displayFolder: 07 Pareto

	/// Curva de Pareto de productos sobre la venta neta.
	measure '% acumulado de venta productos' = VAR actual = [Ventas netas] RETURN DIVIDE(SUMX(FILTER(ALLSELECTED(Producto), [Ventas netas] >= actual), [Ventas netas]), CALCULATE([Ventas netas], ALLSELECTED(Producto)))
		formatString: 0.0%
		displayFolder: 07 Pareto
"""

MEDIDAS_POR_TABLA["hecho_compra_linea"] = r"""
	measure 'Compras netas' = SUM(Compras[monto_sin_impuesto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Compras netas con IVA' = SUM(Compras[monto_con_impuesto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Impuesto de compras' = SUM(Compras[monto_impuesto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Saldo pendiente de pago de las facturas de compra, prorrateado por línea. INFORMATIVO: la cartera oficial sale del mayor.
	measure 'Saldo de facturas de compra' = SUM(Compras[saldo_pendiente_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Compras a terceros' = CALCULATE([Compras netas], Proveedor[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	measure 'Compras al grupo' = CALCULATE([Compras netas], Proveedor[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 02 Terceros vs grupo

	measure '% Compra al grupo' = DIVIDE([Compras al grupo], [Compras netas])
		formatString: 0.0%
		displayFolder: 02 Terceros vs grupo

	measure 'Unidades compradas' = SUM(Compras[cantidad])
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Líneas de compra' = COUNTROWS(Compras)
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Documentos de compra' = DISTINCTCOUNT(Compras[documento_id])
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Proveedores con compra' = CALCULATE(DISTINCTCOUNT(Compras[proveedor_clave]), Compras[monto_sin_impuesto_local] <> 0)
		formatString: #,0
		displayFolder: 03 Conteos

	measure 'Compra promedio por documento' = DIVIDE([Compras netas], [Documentos de compra])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	measure 'Compra promedio por proveedor' = DIVIDE([Compras netas], [Proveedores con compra])
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	/// Promedio sobre los días que SÍ hubo compra.
	measure 'Compra promedio diaria' = DIVIDE([Compras netas], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Compras))
		formatString: "Q" #,0
		displayFolder: 04 Promedios

	measure 'Compras mes anterior' = CALCULATE([Compras netas], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	measure 'Compras año anterior' = CALCULATE([Compras netas], DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	measure 'Compras acumuladas mes' = TOTALMTD([Compras netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	measure 'Compras acumuladas año' = TOTALYTD([Compras netas], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	measure 'Compras acumuladas año anterior' = CALCULATE(TOTALYTD([Compras netas], Calendario[fecha]), DATEADD(Calendario[fecha], -1, YEAR))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	measure 'Variación compras vs mes anterior' = DIVIDE([Compras netas] - [Compras mes anterior], [Compras mes anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 05 Comparativos

	measure 'Variación compras vs año anterior' = DIVIDE([Compras netas] - [Compras año anterior], [Compras año anterior])
		formatString: +0.0%;-0.0%;0.0%
		displayFolder: 05 Comparativos

	measure 'Media móvil 3 meses compras' = CALCULATE(AVERAGEX(VALUES(Calendario[anio_mes]), [Compras netas]), DATESINPERIOD(Calendario[fecha], MAX(Calendario[fecha]), -3, MONTH))
		formatString: "Q" #,0
		displayFolder: 05 Comparativos

	/// Compra de líneas sin artículo (servicios, fletes, gastos) — en Cresta son el 60% de las líneas.
	measure 'Compras de servicios' = CALCULATE([Compras netas], Producto[producto_codigo] = "SERVICIO")
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Ranking de proveedor por compra' = RANKX(ALLSELECTED(Proveedor), [Compras a terceros])
		formatString: #,0
		displayFolder: 06 Pareto

	/// Curva de Pareto: % de la compra a terceros que acumulan este proveedor y los mayores que él.
	measure '% acumulado de compra proveedores' = VAR actual = [Compras a terceros] RETURN DIVIDE(SUMX(FILTER(ALLSELECTED(Proveedor), [Compras a terceros] >= actual), [Compras a terceros]), CALCULATE([Compras a terceros], ALLSELECTED(Proveedor)))
		formatString: 0.0%
		displayFolder: 06 Pareto
"""

MEDIDAS_POR_TABLA["hecho_cartera_cobrar"] = r"""
	/// Saldo del MAYOR CONTABLE, no del documento: es el número que el contador reconoce.
	measure 'Saldo por cobrar' = SUM('Cartera por cobrar'[saldo_pendiente_local])
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	measure 'Saldo por cobrar terceros' = CALCULATE([Saldo por cobrar], Cliente[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Saldo entre empresas del propio grupo. Leerlo junto al de terceros hace parecer una crisis de cobranza que no existe.
	measure 'Saldo por cobrar grupo' = CALCULATE([Saldo por cobrar], Cliente[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	measure 'Partidas por cobrar' = COUNTROWS('Cartera por cobrar')
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Clientes con saldo' = DISTINCTCOUNT('Cartera por cobrar'[cliente_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Saldo promedio por cliente' = DIVIDE([Saldo por cobrar], [Clientes con saldo])
		formatString: "Q" #,0
		displayFolder: 02 Conteos

	measure 'Saldo corriente' = CALCULATE([Saldo por cobrar], 'Antigüedad'[es_vencido] = FALSE)
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	measure 'Saldo vencido' = CALCULATE([Saldo por cobrar], 'Antigüedad'[es_vencido] = TRUE)
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// La mora que de verdad hay que cobrar: vencida y fuera del grupo.
	measure 'Saldo vencido terceros' = CALCULATE([Saldo por cobrar], 'Antigüedad'[es_vencido] = TRUE, Cliente[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	measure '% Vencido' = DIVIDE([Saldo vencido], [Saldo por cobrar])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	measure '% Vencido terceros' = DIVIDE([Saldo vencido terceros], [Saldo por cobrar terceros])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	measure 'Vencido 1 a 30' = CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "1-30")
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	measure 'Vencido 31 a 60' = CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "31-60")
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	measure 'Vencido 61 a 90' = CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "61-90")
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	measure 'Vencido más de 90' = CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "+90")
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	/// Riesgo alto: lo que pasó de 90 días pesa distinto en una provisión que lo que apenas venció.
	measure '% Crítico más de 90' = DIVIDE([Vencido más de 90], [Saldo por cobrar])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	/// Días vencidos promedio ponderados por saldo: un promedio simple deja que una partida chica de 400 días arruine el indicador.
	measure 'Días vencido promedio' = DIVIDE(SUMX('Cartera por cobrar', 'Cartera por cobrar'[saldo_pendiente_local] * 'Cartera por cobrar'[dias_vencido]), [Saldo por cobrar])
		formatString: #,0.0
		displayFolder: 04 Riesgo

	/// Días de venta a terceros pendientes de cobro. Mezclar el saldo del grupo lo triplica.
	measure 'Días de cartera terceros' = DIVIDE([Saldo por cobrar terceros], DIVIDE([Ventas a terceros], CALCULATE(DISTINCTCOUNT(Calendario[fecha]), Ventas)))
		formatString: #,0.0
		displayFolder: 04 Riesgo
"""

MEDIDAS_POR_TABLA["hecho_cartera_pagar"] = r"""
	/// En positivo para poder compararlo con la cartera por cobrar sin invertir signos en cada visual.
	measure 'Saldo por pagar' = SUM('Cartera por pagar'[saldo_pendiente_absoluto])
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	measure 'Saldo por pagar terceros' = CALCULATE([Saldo por pagar], Proveedor[es_intercompania] = FALSE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	measure 'Saldo por pagar grupo' = CALCULATE([Saldo por pagar], Proveedor[es_intercompania] = TRUE)
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	/// Lo que se cobra menos lo que se debe: la liquidez estructural del negocio.
	measure 'Posición neta' = [Saldo por cobrar] - [Saldo por pagar]
		formatString: "Q" #,0
		displayFolder: 01 Saldo

	measure 'Partidas por pagar' = COUNTROWS('Cartera por pagar')
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Proveedores con saldo' = DISTINCTCOUNT('Cartera por pagar'[proveedor_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Por pagar vencido' = CALCULATE([Saldo por pagar], 'Antigüedad'[es_vencido] = TRUE)
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad

	measure '% Por pagar vencido' = DIVIDE([Por pagar vencido], [Saldo por pagar])
		formatString: 0.0%
		displayFolder: 03 Antigüedad

	measure 'Por pagar más de 90' = CALCULATE([Saldo por pagar], 'Antigüedad'[rango_aging] = "+90")
		formatString: "Q" #,0
		displayFolder: 03 Antigüedad
"""

MEDIDAS_POR_TABLA["clasificacion_abc_cliente"] = r"""
	/// Cuántos clientes concentran el 80% de la venta del año. En una cartera sana no son dos.
	measure 'Clientes A' = CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "A")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Clientes B' = CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "B")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Clientes C' = CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "C")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Clientes sin venta neta' = CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "S")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Clientes clasificados' = COUNTROWS('Clasificación ABC')
		formatString: #,0
		displayFolder: 01 Conteos

	/// Clientes que facturaron algún año anterior y nada en el año en curso: la lista de llamadas pendientes.
	measure 'Clientes perdidos' = CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[perdido_en_anio] = TRUE)
		formatString: #,0
		displayFolder: 01 Conteos

	/// Riesgo de concentración: si los A son el 90% de la venta, perder uno duele de verdad.
	measure '% Venta en clientes A' = DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta_anio]), 'Clasificación ABC'[clase_abc_anio] = "A"), SUM('Clasificación ABC'[venta_anio]))
		formatString: 0.0%
		displayFolder: 02 Concentración

	measure 'Venta del año clasificada' = SUM('Clasificación ABC'[venta_anio])
		formatString: "Q" #,0
		displayFolder: 02 Concentración

	measure 'Venta promedio cliente A' = DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta_anio]), 'Clasificación ABC'[clase_abc_anio] = "A"), [Clientes A])
		formatString: "Q" #,0
		displayFolder: 02 Concentración

	measure 'Margen de clientes A' = CALCULATE(SUM('Clasificación ABC'[margen_anio]), 'Clasificación ABC'[clase_abc_anio] = "A")
		formatString: "Q" #,0
		displayFolder: 02 Concentración
"""


MEDIDAS_POR_TABLA["clasificacion_abc_proveedor"] = r"""
	/// Cuántos proveedores concentran el 80% de la compra del año: dependencia de suministro.
	measure 'Proveedores A' = CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "A")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Proveedores B' = CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "B")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Proveedores C' = CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "C")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Proveedores sin compra neta' = CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "S")
		formatString: #,0
		displayFolder: 01 Conteos

	measure 'Proveedores clasificados' = COUNTROWS('Clasificación ABC Proveedor')
		formatString: #,0
		displayFolder: 01 Conteos

	/// Proveedores a los que se les compró algún año anterior y nada en el año en curso.
	measure 'Proveedores inactivos' = CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[inactivo_en_anio] = TRUE)
		formatString: #,0
		displayFolder: 01 Conteos

	/// Riesgo de dependencia: si los A concentran el 90% de la compra, perder uno para la operación.
	measure '% Compra en proveedores A' = DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra_anio]), 'Clasificación ABC Proveedor'[clase_abc_anio] = "A"), SUM('Clasificación ABC Proveedor'[compra_anio]))
		formatString: 0.0%
		displayFolder: 02 Concentración

	measure 'Compra del año clasificada' = SUM('Clasificación ABC Proveedor'[compra_anio])
		formatString: "Q" #,0
		displayFolder: 02 Concentración

	measure 'Compra promedio proveedor A' = DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra_anio]), 'Clasificación ABC Proveedor'[clase_abc_anio] = "A"), [Proveedores A])
		formatString: "Q" #,0
		displayFolder: 02 Concentración
"""

MEDIDAS_POR_TABLA["hecho_pago_recibido"] = r"""
	/// Flujo de cobros del período. INFORMATIVO para caja: el saldo de cartera sale del mayor.
	measure 'Monto cobrado' = SUM('Pagos recibidos'[monto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Solo cobranza de CLIENTES. En Cresta el 67% del monto de ORCT son operaciones de tesorería contra cuenta contable — sin este filtro la cobranza se triplica.
	measure 'Cobros de clientes' = CALCULATE([Monto cobrado], 'Pagos recibidos'[contraparte] = "cliente")
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Cobros de tesorería' = CALCULATE([Monto cobrado], 'Pagos recibidos'[contraparte] = "cuenta_contable")
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Cobranza de clientes contra la venta con IVA del mismo período: el pulso de la recuperación.
	measure '% Cobrado vs facturado' = DIVIDE([Cobros de clientes], [Ventas netas con IVA])
		formatString: 0.0%
		displayFolder: 01 Importes

	measure 'Cantidad de cobros' = COUNTROWS('Pagos recibidos')
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Clientes que pagaron' = DISTINCTCOUNT('Pagos recibidos'[cliente_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Cobro promedio' = DIVIDE([Monto cobrado], [Cantidad de cobros])
		formatString: "Q" #,0
		displayFolder: 03 Promedios

	measure 'Cobros mes anterior' = CALCULATE([Monto cobrado], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	measure 'Cobros acumulados año' = TOTALYTD([Monto cobrado], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 04 Comparativos
"""

MEDIDAS_POR_TABLA["hecho_pago_efectuado"] = r"""
	measure 'Monto pagado' = SUM('Pagos efectuados'[monto_local])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Solo pagos a PROVEEDORES (excluye operaciones de tesorería contra cuenta contable).
	measure 'Pagos a proveedores' = CALCULATE([Monto pagado], 'Pagos efectuados'[contraparte] = "proveedor")
		formatString: "Q" #,0
		displayFolder: 01 Importes

	/// Lo cobrado menos lo pagado en el período filtrado: el pulso de caja operativo.
	measure 'Flujo neto de caja' = [Monto cobrado] - [Monto pagado]
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Cantidad de pagos' = COUNTROWS('Pagos efectuados')
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Proveedores pagados' = DISTINCTCOUNT('Pagos efectuados'[proveedor_clave])
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Pago promedio' = DIVIDE([Monto pagado], [Cantidad de pagos])
		formatString: "Q" #,0
		displayFolder: 03 Promedios

	measure 'Pagos mes anterior' = CALCULATE([Monto pagado], DATEADD(Calendario[fecha], -1, MONTH))
		formatString: "Q" #,0
		displayFolder: 04 Comparativos

	measure 'Pagos acumulados año' = TOTALYTD([Monto pagado], Calendario[fecha])
		formatString: "Q" #,0
		displayFolder: 04 Comparativos
"""

MEDIDAS_POR_TABLA["hecho_inventario"] = r"""
	/// Valor del inventario a la fecha de corte (SAP: OnHand × costo promedio; Odoo: capas de valoración).
	measure 'Valor de inventario' = SUM(Inventario[valor])
		formatString: "Q" #,0
		displayFolder: 01 Importes

	measure 'Unidades en existencia' = SUM(Inventario[cantidad])
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Productos con existencia' = CALCULATE(DISTINCTCOUNT(Inventario[producto_clave]), Inventario[cantidad] <> 0)
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Bodegas con existencia' = CALCULATE(DISTINCTCOUNT(Inventario[almacen_clave]), Inventario[cantidad] <> 0)
		formatString: #,0
		displayFolder: 02 Conteos

	measure 'Costo promedio ponderado' = DIVIDE([Valor de inventario], [Unidades en existencia])
		formatString: "Q" #,0.00
		displayFolder: 03 Promedios

	/// Veces que el inventario rota al año: costo de ventas de los últimos 12 meses sobre el valor actual.
	measure 'Rotación de inventario 12M' = DIVIDE(CALCULATE([Costo de ventas], DATESINPERIOD(Calendario[fecha], MAX(Calendario[fecha]), -12, MONTH)), [Valor de inventario])
		formatString: #,0.0
		displayFolder: 04 Rotación

	measure 'Días de inventario' = DIVIDE(365, [Rotación de inventario 12M])
		formatString: #,0
		displayFolder: 04 Rotación
"""

MEDIDAS_POR_TABLA["campo_usuario"] = r"""
	/// Cuántos valores de campos de usuario hay capturados en el filtro vigente.
	measure 'Valores de usuario capturados' = COUNTROWS('Campos de usuario')
		formatString: #,0
		displayFolder: 01 Conteos

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
# GRUPO DE CÁLCULO: Moneda de análisis
#
# El pedido de negocio: "ver todo el dato en una u otra moneda" desde un filtro. Un grupo de
# cálculo hace exactamente eso: una tabla de un solo campo que, al filtrarse, cambia CÓMO se
# evalúa la medida seleccionada.
#   · 'Quetzales (local)'  → la medida tal cual (todos los importes _local ya vienen convertidos
#     a moneda local por el ERP — decisión C1: no se recalcula con tasas propias).
#   · 'Moneda original'    → conmuta las medidas base de importe a su columna *_doc (el importe
#     en la moneda del documento). SOLO tiene sentido leyéndolo con un filtro de Moneda activo:
#     sumar dólares con quetzales no es un número. Las medidas derivadas (variaciones, %, conteos)
#     pasan sin conmutarse.
# Requiere discourageImplicitMeasures (ya activo) y compatibilityLevel >= 1470 (estamos en 1567).
# ---------------------------------------------------------------------------------------------
GRUPO_MONEDA = r"""table 'Moneda de análisis'

	calculationGroup
		precedence: 1

		calculationItem 'Quetzales (local)' = SELECTEDMEASURE()
			ordinal: 0

		calculationItem 'Moneda original' = SWITCH(TRUE(), ISSELECTEDMEASURE([Ventas netas]), SUM(Ventas[monto_sin_impuesto_doc]), ISSELECTEDMEASURE([Ventas netas con IVA]), SUM(Ventas[monto_con_impuesto_doc]), ISSELECTEDMEASURE([Impuesto facturado]), SUM(Ventas[monto_impuesto_doc]), ISSELECTEDMEASURE([Compras netas]), SUM(Compras[monto_sin_impuesto_doc]), ISSELECTEDMEASURE([Compras netas con IVA]), SUM(Compras[monto_con_impuesto_doc]), ISSELECTEDMEASURE([Impuesto de compras]), SUM(Compras[monto_impuesto_doc]), ISSELECTEDMEASURE([Saldo por cobrar]), SUM('Cartera por cobrar'[saldo_pendiente_doc]), ISSELECTEDMEASURE([Saldo por pagar]), ABS(SUM('Cartera por pagar'[saldo_pendiente_doc])), ISSELECTEDMEASURE([Monto cobrado]), SUM('Pagos recibidos'[monto_doc]), ISSELECTEDMEASURE([Monto pagado]), SUM('Pagos efectuados'[monto_doc]), SELECTEDMEASURE())
			ordinal: 1
			formatStringDefinition = IF(ISSELECTEDMEASURE([Ventas netas], [Ventas netas con IVA], [Impuesto facturado], [Compras netas], [Compras netas con IVA], [Impuesto de compras], [Saldo por cobrar], [Saldo por pagar], [Monto cobrado], [Monto pagado]), "#,0", SELECTEDMEASUREFORMATSTRING())

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

	partition 'Moneda de análisis' = calculationGroup
		mode: import
"""


PALABRAS = ("table", "column", "measure", "partition", "hierarchy", "level", "relationship",
            "annotation", "ref", "model", "database", "expression", "mode", "source",
            "dataCategory", "culture", "calculationGroup", "calculationItem",
            "formatStringDefinition")


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
            if primera == "source" or s.startswith("source ="):
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
                medidas.add(m.group(2) or m.group(1))
            m = re.match(r"^column\s+('([^']+)'|\S+)", s)
            if m and tabla_actual:
                columnas_por_tabla[tabla_actual].add(m.group(2) or m.group(1))

    fallos: list[str] = []

    # Referencias a medidas dentro de expresiones DAX (medidas Y calculation items).
    for f in sorted((defi / "tables").glob("*.tmdl")):
        for i, linea in enumerate(f.read_text(encoding="utf-8").split("\n"), start=1):
            s = linea.strip()
            if not (s.startswith("measure ") or s.startswith("calculationItem ")):
                continue
            for ref in re.findall(r"(?<![\w'\]])\[([^\]]+)\]", s.split("=", 1)[-1]):
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

    problemas_datos = validar_calendario(cur)

    presentes, rel_cols = [], {}
    for tabla in DIMENSIONES + HECHOS:
        cols = columnas(cur, tabla)
        if not cols:
            print(f"  [!] {tabla} no existe en oro — se omite")
            continue
        presentes.append(tabla)
        rel_cols[tabla] = {c for c, _ in cols}
        (defi / "tables" / f"{ETIQUETA.get(tabla, tabla)}.tmdl").write_text(
            gen_tabla(tabla, cols, base), encoding="utf-8")
    # Ya no hay tabla única de métricas: cada medida vive en la tabla que mide. Si quedó de una
    # generación anterior se borra, o Desktop cargaría medidas duplicadas.
    viejo = defi / "tables" / "_ Métricas.tmdl"
    if viejo.exists():
        viejo.unlink()

    # Grupo de cálculo de moneda (no sale de oro: es puro modelo).
    (defi / "tables" / "Moneda de análisis.tmdl").write_text(GRUPO_MONEDA, encoding="utf-8")

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
        ("dim_proveedor", "proveedor_clave"), ("dim_producto", "producto_clave"),
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
        # Antigüedad de cartera: la relación es por la ETIQUETA de texto ('1-30', '+90'), no por
        # una clave numérica, para no tener que añadir una columna a los cuatro hechos de cartera.
        # Son 6 valores distintos: el coste de una relación por texto es irrelevante y el test
        # `relationships` de dbt garantiza que el hecho no invente etiquetas fuera del catálogo.
        if "dim_rango_aging" in presentes and "rango_aging" in rel_cols.get(hecho, ()):
            n += 1
            rels += [
                f"relationship rel_{n:03d}",
                f"\tfromColumn: {tmdl_nombre(ETIQUETA[hecho])}.rango_aging",
                f"\ttoColumn: {tmdl_nombre(ETIQUETA['dim_rango_aging'])}.rango_aging",
                "",
            ]

    # Clasificación ABC ↔ Cliente: una fila por cliente, así que es 1:1 y se comporta como una
    # extensión de la dimensión. El filtrado cruzado va en ambos sentidos para que al elegir la
    # clase A se filtren las ventas; en 1:1 eso no introduce ambigüedad (con dos filas por
    # cliente sí la habría, y es la razón por la que el modelo de Oro pivotea los ámbitos).
    if "clasificacion_abc_cliente" in presentes and "dim_cliente" in presentes:
        n += 1
        rels += [
            f"relationship rel_{n:03d}",
            "\tcrossFilteringBehavior: bothDirections",
            f"\tfromColumn: {tmdl_nombre(ETIQUETA['clasificacion_abc_cliente'])}.cliente_clave",
            f"\ttoColumn: {tmdl_nombre(ETIQUETA['dim_cliente'])}.cliente_clave",
            "",
        ]

    # Mismo patrón para el ABC de proveedores (1:1 con la dimensión Proveedor).
    if "clasificacion_abc_proveedor" in presentes and "dim_proveedor" in presentes:
        n += 1
        rels += [
            f"relationship rel_{n:03d}",
            "\tcrossFilteringBehavior: bothDirections",
            f"\tfromColumn: {tmdl_nombre(ETIQUETA['clasificacion_abc_proveedor'])}.proveedor_clave",
            f"\ttoColumn: {tmdl_nombre(ETIQUETA['dim_proveedor'])}.proveedor_clave",
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

    (defi / "database.tmdl").write_text(
        f"database {proyecto}\n\tcompatibilityLevel: 1567\n", encoding="utf-8")

    refs = "\n".join(f"ref table {tmdl_nombre(ETIQUETA.get(t, t))}" for t in presentes)
    refs += f"\nref table {tmdl_nombre('Moneda de análisis')}"
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

    (sm / "definition.pbism").write_text(
        json.dumps({"version": "4.0", "settings": {}}, indent=2), encoding="utf-8")

    (rep / "definition.pbir").write_text(json.dumps({
        "version": "1.0",
        "datasetReference": {"byPath": {"path": f"../{proyecto}.SemanticModel"}},
    }, indent=2), encoding="utf-8")

    # SOLO si no existe: regenerar el modelo NUNCA debe pisar las páginas y visuales que el
    # usuario haya construido (el stub anterior destruía el reporte en cada corrida — así es
    # como Edwin va a trabajar: el modelo se regenera, sus dashboards se quedan).
    if not (rep / "report.json").exists():
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

    (salida / f"{proyecto}.pbip").write_text(json.dumps({
        "version": "1.0",
        "artifacts": [{"report": {"path": f"{proyecto}.Report"}}],
        "settings": {"enableAutoRecovery": True},
    }, indent=2), encoding="utf-8")

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
