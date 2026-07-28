{#
  Homologa el tipo nativo de cada ERP a un vocabulario único:
    SAP B1 ObjType 13/14/18/19  ≡  Odoo out_invoice/out_refund/in_invoice/in_refund
  Es la dimensión que permite comparar los dos tenants con el mismo lenguaje.

  Llaves FIJAS (1-4): es un catálogo cerrado del motor, no depende de los datos del cliente, así
  que no necesita mapa incremental — y fijarlas hace que signifiquen lo mismo en todos los tenants.
#}
{{ config(materialized='table') }}

with tipos(llave, codigo, flujo, tipo_documento, nombre, signo) as (
    values
        (1, 'venta_factura',       'venta',  'factura',      'Factura de venta',            1),
        (2, 'venta_nota_credito',  'venta',  'nota_credito', 'Nota de crédito de venta',   -1),
        (3, 'compra_factura',      'compra', 'factura',      'Factura de compra',           1),
        (4, 'compra_nota_credito', 'compra', 'nota_credito', 'Nota de crédito de compra',  -1)
)

select
    llave                                             as tipo_documento_clave,
    codigo                                            as tipo_documento_codigo,
    flujo,
    tipo_documento,
    nombre,
    signo,
    {{ columnas_vigencia() }}
from tipos

union all

select
    {{ clave_no_definido() }}, {{ codigo_no_definido() }}, null, null,
    {{ nombre_no_definido() }}, 1,
    {{ columnas_vigencia() }}
