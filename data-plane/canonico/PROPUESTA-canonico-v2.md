# Propuesta — Canónico v2: Plata y Oro agnósticos (SAP B1 + Odoo)

> **Estado: PROPUESTA — pendiente de acuerdo con Edwin.** No implementar hasta confirmar.
> Sustituye al canónico v1 (`modelo-canonico.md`), sesgado a ventas y a SAP B1.
> Revisión 2 (2026-07-26): **nomenclatura 100% español** + **Oro separado por proceso de negocio**
> (corrección aportada por Edwin — ver §3). Investigación de respaldo en §8.

---

## 0. Por qué v2

El canónico v1 tiene tres problemas que solo se ven al meter un segundo ERP:

1. **Está sesgado a ventas.** Con CxP entrando al alcance, duplicar todo en versión "compra" sería
   el error caro.
2. **Calcula el saldo desde el documento.** En ambos ERPs eso es incorrecto ante pagos parciales,
   notas de crédito conciliadas, anticipos y ajustes manuales.
3. **No lleva multimoneda ni impuesto separado.** Con una sola empresa en GTQ no se nota; con dos
   ERPs y facturación en USD, todos los totales quedan mal.

Y un cuarto, de forma: **mezcla español e inglés** (`fct_`, `stg_`, `snap_`, `quarantine_`,
`source_origen`, `item`, `_key`). Se estandariza a español (§1).

---

## 1. Nomenclatura — español, sin mezcla

### Esquemas

| Antes | Ahora |
|---|---|
| `bronze` | `bronce` |
| `silver` | `plata` |
| `gold` | `oro` |
| `metadata` | `metadatos` |
| `gobierno` | `gobierno` (ya en español) |

> **Costo del cambio:** `bronce`/`plata`/`oro` es gratis (los esquemas están vacíos tras el borrón
> y cuenta nueva). `metadatos` toca el portal (Drizzle, NestJS, seeds, macros dbt, worker): es un
> reemplazo mecánico + migración Nivel 2 con rollback. **Hacerlo ahora cuesta una sesión; con 3
> clientes en producción cuesta un mes.** Recomendación: hacerlo ahora.

### Prefijos de modelo

| Antes | Ahora | Nota |
|---|---|---|
| `stg_` | *(desaparece)* | Plata lee directo del `jsonb` de bronce |
| `silver_` | `plata_` | |
| `quarantine_` | `cuarentena_` | |
| `snap_` | `version_` | snapshots SCD2 |
| `fct_` | `hecho_` | |
| `dim_` | `dim_` | "dimensión" ya es español |
| `metrica_` | `metrica_` | |
| `rpt_` | `reporte_` | |

### Campos

| Antes | Ahora | Nota |
|---|---|---|
| `source_origen` | `fuente_origen` | era mezcla |
| `<dim>_key`, `sk` | `<entidad>_clave` | consistente con `<algo>_codigo` |
| `dbt_valid_from` / `_to` | se exponen como `valido_desde` / `valido_hasta` | dbt los genera; se renombran en la dimensión |
| `item` | `producto` | entidad y campos (`item_codigo` → `producto_codigo`) |
| `empresa_id` | **se mantiene** | `id` = identificador, idéntico en español; renombrarlo tocaría todo sin ganancia |

---

## 2. El hallazgo: los dos ERPs tienen el mismo modelo contable

SAP B1 y Odoo **parecen** opuestos (B1 separa las facturas en 4 tablas; Odoo las unifica en una).
Debajo son casi idénticos: doble partida con **asiento cabecera + línea de asiento que arrastra su
propio saldo residual**.

| Concepto contable | SAP B1 | Odoo |
|---|---|---|
| Asiento (cabecera) | `OJDT` (`TransId`) | `account_move` (`id`) |
| Línea de asiento (mayor) | `JDT1` (`TransId`,`Line_ID`) | `account_move_line` (`id`) |
| **Saldo abierto de la partida** | `BalDueDeb − BalDueCred` | `amount_residual` |
| Vencimiento de la partida | `JDT1.DueDate` | `date_maturity` |
| Socio de la partida | `JDT1.ShortName` → `OCRD` | `partner_id` → `res_partner` |
| Cuenta contable | `JDT1.Account` → `OACT` | `account_id` → `account_account` |
| Clasificación CxC / CxP | tipo de cuenta `OACT` / `OCRD.CardType` | `account_account.account_type` = `asset_receivable` / `liability_payable` |
| Tipo de documento origen | `OJDT.TransType` (= `ObjType`) | `account_move.move_type` |
| Conciliado | `BalDue* = 0` | `reconciled` / `full_reconcile_id` |

### Equivalencia de documentos

| Documento | SAP B1 (tabla / `ObjType`) | Odoo (`move_type`) | Canónico |
|---|---|---|---|
| Factura de venta | `OINV`/`INV1` — 13 | `out_invoice` | venta / factura |
| Nota de crédito venta | `ORIN`/`RIN1` — 14 | `out_refund` | venta / nota_credito |
| Factura de compra | `OPCH`/`PCH1` — 18 | `in_invoice` | compra / factura |
| Nota de crédito compra | `ORPC`/`RPC1` — 19 | `in_refund` | compra / nota_credito |
| Cobro recibido | `ORCT` — 24 | `account_payment` | → cartera |
| Pago emitido | `OVPM` — 46 | `account_payment` | → cartera |
| Asiento manual | `OJDT` — 30 | `move_type='entry'` | → cartera |
| Socio de negocio | `OCRD` — 2 (`CardType` C/S/L) | `res_partner` | socio_negocio |
| Producto | `OITM` — 4 | `product_product` | producto |

---

## 3. La decisión de fondo: **unificado en Plata, separado en Oro**

Edwin objetó la tabla única de la revisión 1. **La objeción es correcta para Oro.** Las dos capas
tienen objetivos distintos y merecen respuestas distintas:

### Plata → UNIFICADA (una tabla para venta y compra; una para CxC y CxP)

Plata es la **costura agnóstica** (`CLAUDE.md` §6): su objetivo es absorber la diferencia entre
ERPs y reutilizar el mapeo, que es el trabajo caro y el que se repite en cada cliente nuevo.

- En SAP B1 los documentos vienen de **4 tablas**; en Odoo de **1** (`account_move`).
  Si Plata estuviera separada, habría que **partir la tabla de Odoo en dos y unir las 4 de B1 en
  dos** → más mapeo, no menos.
- La cartera sale del **mismo objeto** en ambos (`JDT1` / `account_move_line`). Separarla en Plata
  sería duplicar la misma lectura con distinto `WHERE`.
- **Respuesta directa a "¿agrega complejidad para parametrizar?":** en Plata la *quita* — un solo
  mapeo por ERP en vez de dos.

### Oro → SEPARADA por proceso de negocio

Oro es el **modelo dimensional de consumo** (Power BI, capa semántica, agente). Aquí unificar
sí agrega complejidad y riesgo. Cinco razones concretas:

1. **Power BI.** Con una tabla de hechos mixta, *toda* medida DAX necesita
   `CALCULATE(..., flujo="venta")`. Si alguien arrastra el campo crudo al lienzo, ve **ventas +
   compras sumadas**: un número sin sentido y difícil de detectar. Con hechos separados, el modelo
   estrella es limpio y las medidas son `SUM()`.
2. **Dimensiones no conformadas.** Ventas tiene vendedor y precio de venta; compras tiene orden de
   compra y condiciones del proveedor. Mezclarlas produce una tabla con muchas columnas nulas — el
   anti-patrón clásico de Kimball (ver la matriz de bus abajo).
3. **Escalamiento.** Mañana ventas necesita lote, ruta de entrega, promoción, lista de precios;
   compras necesita recepción, retención, tipo de gasto. Con tabla única, cada columna nueva de un
   proceso es un nulo permanente en el otro. La tabla se degrada con el tiempo.
4. **Gobernanza por dominio.** `CLAUDE.md` §12: "dominio = dueño del dato". `hecho_venta_linea` →
   dominio `ventas`; `hecho_compra_linea` → dominio `compras`. Con tablas separadas la autorización
   es **por objeto** (simple y auditable); con tabla única habría que hacer RLS por valor de columna
   — más frágil y más difícil de auditar.
5. **El agente.** Con hechos separados es **estructuralmente imposible** que "Ventas Netas" toque
   una compra. Con tabla única depende de que el filtro esté bien escrito en la definición de la
   métrica. `CLAUDE.md` §11 pide **guardas, no convenciones**.

El costo de separar es bajo: en Oro cada hecho es un `WHERE` sobre Plata.

### Matriz de bus (por qué separar, en una imagen)

| Proceso (hecho) | tiempo | cliente | proveedor | producto | vendedor | organizacion | moneda | cuenta | centro_costo | tipo_doc |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `hecho_venta_linea` | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `hecho_compra_linea` | ✔ | | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | ✔ |
| `hecho_cartera_cobrar` | ✔ | ✔ | | | ✔ | ✔ | ✔ | ✔ | | ✔ |
| `hecho_cartera_pagar` | ✔ | | ✔ | | | ✔ | ✔ | ✔ | | ✔ |

Las celdas vacías serían **columnas nulas** en una tabla única. Las dimensiones compartidas son
**conformadas**: permiten comparar entre procesos por *drill-across* (consultar cada hecho por
separado y unir por la dimensión común), que es la técnica correcta y la que Power BI maneja bien.

### Cliente y proveedor: una maestra, dos dimensiones

`plata_socio_negocio` es **una sola** tabla (ambos ERPs ya los unifican). En Oro se exponen
`dim_cliente` y `dim_proveedor` filtradas por `es_cliente` / `es_proveedor`.

Motivo: si un socio es cliente **y** proveedor (frecuente — se le compra y se le vende al mismo),
una dimensión única haría que filtrar por ese socio en un reporte de ventas arrastre también sus
compras. Dos dimensiones lo hacen imposible. En Power BI además evita el dolor de las
*role-playing dimensions* (`USERELATIONSHIP`).

---

## 4. Capa PLATA propuesta (unificada, 12 modelos)

### Bloque A — Maestros

| Modelo | Grano | Notas |
|---|---|---|
| `plata_socio_negocio` | un socio por empresa | **unifica cliente y proveedor** (`es_cliente`, `es_proveedor`) |
| `plata_producto` | un producto por empresa | antes `item` |
| `plata_vendedor` | un vendedor por empresa | opcional, con default |
| `plata_organizacion` | empresa → sucursal | sucursal con miembro default |
| `plata_cuenta` | una cuenta contable | `tipo_cuenta` normalizado (`por_cobrar`, `por_pagar`, `ingreso`, `gasto`, …) ← **clasifica la cartera** |
| `plata_centro_costo` | un centro de costo | |
| `plata_moneda` | una moneda + tipo de cambio por fecha | **nuevo**; sin esto no hay consolidación |

### Bloque B — Documentos comerciales

| Modelo | Grano |
|---|---|
| `plata_documento_comercial` | un documento (cabecera) — venta y compra, discriminadas por `flujo` |
| `plata_documento_linea` | una línea de documento — **el grano del hecho** |

Campos nuevos frente a v1: `flujo` (venta/compra), `moneda` + `tipo_cambio` + montos en local,
`total_sin_impuesto` / `total_impuesto` / `total_documento`, `estado`
(borrador/abierto/cerrado/cancelado), `documento_referencia` (NC → factura origen).

### Bloque C — Cartera

| Modelo | Grano |
|---|---|
| `plata_partida_cartera` | **una partida del mayor con saldo** — CxC y CxP, discriminadas por `tipo_cartera` |

Campos: `tipo_cartera` (cobrar/pagar), `socio_negocio_codigo`, `cuenta_codigo`,
`documento_origen` + `tipo_documento_origen`, `fecha_documento`, `fecha_vencimiento`,
`monto_original`, `saldo_pendiente` (documento y local), `moneda`, `esta_abierta`, `dias_vencido`.

Origen: `JDT1` en B1, `account_move_line` filtrado por `account_type` en Odoo. **Nunca desde la
factura.**

### Bloque D — Control

| Modelo | Propósito |
|---|---|
| `plata_control_cuadre` | Compara el total del canónico contra el total del ERP. **Si no cuadra, Oro no publica.** Es la credibilidad del producto en la demo. |
| `cuarentena_*` | registros que fallan calidad, con regla violada y timestamp (§10) |

---

## 5. Capa ORO propuesta (separada por proceso)

### Dimensiones (10) — conformadas

`dim_tiempo` · `dim_cliente` · `dim_proveedor` · `dim_producto` · `dim_vendedor` ·
`dim_organizacion` · `dim_moneda` · `dim_cuenta` · `dim_centro_costo` · `dim_tipo_documento`

Todas con miembro default `-1` / `'DESCONOCIDO'`. `dim_cliente` y `dim_proveedor` versionadas SCD2.

### Hechos (6)

| Hecho | Grano | Dominio |
|---|---|---|
| `hecho_venta_linea` | línea de factura/NC de venta | `ventas` |
| `hecho_compra_linea` | línea de factura/NC de compra | `compras` |
| `hecho_cartera_cobrar` | partida abierta de CxC | `tesoreria` |
| `hecho_cartera_pagar` | partida abierta de CxP | `tesoreria` |
| `hecho_cartera_cobrar_diaria` | **foto diaria** del saldo por partida | `tesoreria` |
| `hecho_cartera_pagar_diaria` | **foto diaria** del saldo por partida | `tesoreria` |

> **Las fotos diarias no son un extra.** Sin ellas el aging solo se calcula *a hoy*: no se puede
> responder "cómo estaba la cartera el mes pasado" ni medir evolución de DSO. El costo en una PyME
> es trivial. Si no se hace ahora, el histórico se pierde para siempre.

### Métricas v1 (10)

| Dominio | Métricas |
|---|---|
| `ventas` | Ventas Brutas · Devoluciones · Ventas Netas |
| `compras` | Compras Brutas · Notas de Crédito Compra · Compras Netas |
| `tesoreria` | Saldo CxC · Aging CxC · Saldo CxP · Aging CxP |

Aging con los rangos definidos: corriente, 1-30, 31-60, 61-90, +90.
DSO / rotación quedan para v1.1 (dependen de las fotos diarias ya pobladas).

---

## 6. Diferencias B1 ↔ Odoo que hay que resolver

| # | Diferencia | SAP B1 | Odoo | Resolución en Plata |
|---|---|---|---|---|
| D1 | **Multi-empresa** | 1 base HANA **por sociedad** | 1 base, `company_id` **por fila** | `empresa_id` viene de la *conexión* en B1 y de la *columna* en Odoo. El extractor lo inyecta. |
| D2 | **Impuestos** | monto de línea + `VatSum` | genera **líneas de impuesto separadas** (`tax_line_id`) | `monto_linea` = **base sin impuesto** siempre. En Odoo filtrar a líneas de producto (`display_type='product'`). |
| D3 | **Sucursal** | `BPLId` nativo (`OBPL`) | **no existe** | `dim_organizacion` con miembro default. |
| D4 | **Centro de costo** | `OcrCode`, 1 por línea | `analytic_distribution` JSON, **N con %** | v1: 1 → se toma; varios → `MULTIPLE`. Explotar por % rompe el grano (v1.1). |
| D5 | **Vendedor** | `OSLP` fuerte | débil (`invoice_user_id`) | Dimensión opcional con miembro default. |
| D6 | **Cancelados / borradores** | `CANCELED='Y'`; borradores en `ODRF` (tabla aparte) | `state IN ('draft','cancel')` **en la misma tabla** | Plata excluye ambos y los cuenta en el control de cuadre. **En Odoo es fácil colar borradores** — filtrar `state='posted'` siempre. |
| D7 | **Moneda** | `DocCur` + `DocRate` | `currency_id` + `amount_currency` vs `company_currency_id` | Todo monto se guarda **dos veces**: moneda del documento y moneda local. |
| D8 | **Signo de la NC** | `ORIN` positivo | `out_refund` positivo | Plata normaliza: factura +, nota de crédito −. Regla en un solo lugar. |
| D9 | **Cliente y proveedor** | `OCRD` unificada (`CardType`) | `res_partner` unificada (`customer_rank`/`supplier_rank`) | Un `plata_socio_negocio`; dos dimensiones en Oro. |
| D10 | **Estado de pago** | `DocStatus` + `PaidToDate` | `payment_state` | **No se usa para el saldo** — el saldo sale del mayor. Se conserva como atributo informativo. |

---

## 7. Bronce derivado (consecuencia, no punto de partida)

**Paquete SAP B1** (por sociedad): `OCRD`, `OCRG`, `OITM`, `OITB`, `OSLP`, `OACT`, `OJDT`, `JDT1`,
`OINV`+`INV1`, `ORIN`+`RIN1`, `OPCH`+`PCH1`, `ORPC`+`RPC1`, `OCRN`, `ORTT`, `OBPL`, `OPRC`, `OCTG`.

**Paquete Odoo**: `res_partner`, `res_company`, `res_currency`(+`res_currency_rate`),
`product_product`+`product_template`, `account_account`, `account_move`, `account_move_line`,
`account_journal`, `res_users`, `account_analytic_account`, `account_payment_term`.

Ambos entran a Bronce como `jsonb` + trazabilidad con el mecanismo config-driven que ya existe y
funciona. **No hay que construir nada nuevo en Bronce**, solo declarar los objetos.

---

## 8. Fuentes de la investigación

- [Odoo — `account.move.line` (`amount_residual`, `date_maturity`, `reconciled`)](https://www.dasolo.ai/blog/odoo-data-api-5/odoo-account-move-line-model-guide-156)
- [Odoo — `account.move` (`move_type`, `state`, `payment_state`, `invoice_line_ids` vs `line_ids`)](https://www.dasolo.ai/blog/odoo-data-api-5/odoo-account-move-model-guide-157)
- [Odoo — `account.account` / `account_type`](https://www.odoo.com/documentation/19.0/developer/reference/standard_modules/account/account_account.html)
- [Odoo — código fuente `account_account.py` 17.0](https://github.com/odoo/odoo/blob/17.0/addons/account/models/account_account.py)
- [Odoo — Aged Receivable / Aged Payable](https://www.odoo.com/forum/help-1/aged-receivable-payable-on-spreadsheet-298913)
- [SAP B1 — aging con `JDT1.BalDueDeb`/`BalDueCred` y `OJDT`](https://community.sap.com/t5/enterprise-resource-planning-q-a/customer-aging-report-query/qaq-p/5330759)
- [SAP B1 — por qué `BalDueDeb − BalDueCred` no siempre coincide con `Balance`](https://community.sap.com/t5/enterprise-resource-planning-q-a/ar-aging-report-why-balduedeb-minus-balduecred-not-same-as-balance/qaq-p/8054281)
- [SAP B1 — lista de `ObjType`](https://www.sap-business-one-tips.com/en/list-of-object-types-on-sap-business-one/)
- [SAP B1 SDK — tabla `OINV`](https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/Marketing_Documents/OINV.htm)

> **A validar contra las instalaciones reales** (no dar por bueno desde la documentación):
> comportamiento de anticipos y reconciliaciones internas en `BalDueDeb`/`BalDueCred`, y la
> **versión de Odoo** del segundo cliente (`account_type` solo existe en Odoo ≥16; en ≤15 es
> `user_type_id` y el mapeo cambia).

---

## 8bis. Validación contra datos reales (Proavisa, 2026-07-26)

Diagnóstico read-only ejecutado contra `SBOPROAVISA_` (10.10.143.69). Resultados que **confirman o
corrigen** el diseño:

### Volumen — Postgres confirmado

`JDT1` 1,732,253 · `OINV` 161,439 · `INV1` 254,246 · `OJDT` 441,001 · `OPCH` 11,224 · `PCH1` 42,281
· `ORCT` 129,855 · `OITM` 10,353 · `OCRD` 1,932. **~2.5M filas en total.** Postgres queda muy por
debajo de cualquier umbral de preocupación.

### Confirmaciones

| Hipótesis | Resultado | Veredicto |
|---|---|---|
| Cliente y proveedor conviven | 814 clientes (`C`) + 1,118 proveedores (`S`) | **CxP no es solo del cliente Odoo**: Cresta tiene más proveedores que clientes |
| Socios duales existen | **35 NIT aparecen como cliente Y proveedor** | **A7 confirmada**: `dim_cliente`/`dim_proveedor` separadas son necesarias, no solo prudentes |
| Multimoneda | Ventas: 161,085 QTZ / 354 USD · **Compras: 10,633 QTZ / 591 USD** — los documentos en USD representan **~49% del valor de compras** | **A3 es crítica, no opcional** |
| Sucursal | `BPLId` = NULL en las 161,439 facturas; `OBPL` vacía | **D3 confirmada**: miembro default |
| Grano de línea sin impuesto | `INV1.LineTotal` 585.2M vs `VatSum` 56.8M | **D2 confirmada**: `LineTotal` es base sin IVA |
| Vencimiento para aging | `JDT1.DueDate` **0 nulos**, rango 2017-04-15 → 2026-12-30 | sirve como base del aging |
| Centro de costo | `OcrCode` presente en 253,752 de 254,246 líneas (**99.8%**) | dimensión de primera clase, no opcional |

### La prueba del saldo (§ decisión A2)

```
(a) OINV abiertas   8,207 docs    92,314,328.00
(b) ORIN abiertas      36 docs       237,979.41
(c) JDT1 (mayor)    8,272 partidas 92,013,402.88

Documento (a−b) = 92,076,348.59
Mayor      (c)  = 92,013,402.88
DIFERENCIA      =    −62,945.71   (0.07%)
```

**Honestidad sobre la magnitud:** la diferencia global es pequeña (0.07%). El argumento para usar el
mayor **no es el tamaño del desvío**, es que:
- son Q62,946 reales que un contador va a notar en la conciliación;
- el desvío **no está repartido**: se concentra en los socios con anticipos y pagos a cuenta, donde
  el error para *ese* cliente puede ser del 100%;
- hay **8,272 partidas en el mayor contra 8,243 documentos** — 29 partidas de cartera que no
  provienen de ninguna factura y que el enfoque por documento simplemente no ve;
- el mayor **cuadra con contabilidad por construcción**, que es justamente lo que sostiene
  `plata_control_cuadre`.

### Corrección al diseño (hallazgo no previsto)

El mayor **no es solo cartera**. De 1,732,253 partidas, 1,043,823 tienen `BalDueDeb <> BalDueCred`,
e incluyen asientos de inventario, producción y transferencias (`TransType` 59, 60, 67, 20, 202 y
al menos un objeto no estándar `1470000049`).

> **Consecuencia:** `plata_partida_cartera` **debe filtrar por tipo de cuenta**
> (`plata_cuenta.tipo_cuenta IN ('por_cobrar','por_pagar')`), **no** por `BalDue* <> BalDue*` a secas.
> Esto eleva `plata_cuenta` de maestro de apoyo a **pieza obligatoria del pipeline de cartera**, y
> hace que el equivalente en Odoo (`account_type`) sea igual de crítico.

### A validar con Edwin

1. **El histórico de documentos arranca 2025-11-30** (161k facturas en 8 meses). ¿Migración o
   arranque de sistema en esa fecha? `JDT1.DueDate` llega hasta 2017 → parece haber saldos
   históricos migrados sin sus documentos. Afecta qué se puede prometer como "histórico".
2. **Hay facturas con fecha futura** (`MAX(DocDate)` = 2026-07-27, un día adelante). ¿Práctica
   normal? Afecta los cortes por período.
3. **IVA efectivo 9.71%** (56.8M sobre 585.2M) contra 12% nominal → hay ventas exentas o a tasa
   cero. **Afecta la definición de "Ventas Netas"** y hay que dejarlo explícito en el catálogo.
4. `BPLId` NULL en Proavisa: ¿alguna de las otras 5 sociedades sí usa sucursales?

---

## 8ter. Validación contra Odoo real (cliente 2, 2026-07-26)

Diagnóstico read-only sobre la base Odoo del segundo cliente.

### Versión y contexto

**Odoo 18.0.1.3** con `account`, `sale`, `purchase`, `stock` y **`l10n_gt`** (localización
Guatemala) instalados. → Se usa `account_account.account_type`; el camino `user_type_id` (≤15)
queda descartado.

**Volumen:** 1,054 asientos · 2,923 líneas de asiento · 225 socios · 647 productos · 100 cuentas.
Es una empresa chica — tres órdenes de magnitud por debajo de Cresta. Confirma que el mismo motor
sirve a los dos sin ajustes.

### LA PRUEBA DEL SALDO — aquí es demoledora

```
Mayor (account_move_line, cuentas receivable/payable, residual ≠ 0):
    asset_receivable      74 partidas     553,009.54
    liability_payable      5 partidas     -14,668.06

Documento (account_move.amount_residual, posted):
    out_invoice           70 docs         468,136.86
    in_invoice             4 docs          14,672.00

CxC:  mayor 553,009.54  vs  documento 468,136.86
      DIFERENCIA = 84,872.68  →  18.1 %
```

**En Odoo la diferencia es del 18%, no del 0.07% como en SAP B1.** Un reporte de cuentas por cobrar
construido desde facturas estaría Q84,872 por debajo del real. La causa: de los 1,054 asientos,
**516 son `move_type='entry'`** (asientos manuales/automáticos) que mueven cartera sin pasar por
una factura. **A2 queda demostrada.**

### Descomposición: `display_type` revela el ORIGEN de la partida

| `display_type` | `account_type` | Líneas | Residual |
|---|---|---:|---:|
| `payment_term` | `asset_receivable` | 309 | 575,127.81 |
| `product` | `asset_receivable` | 370 | −22,118.27 |
| `payment_term` | `liability_payable` | 150 | −14,672.00 |
| `product` | `liability_payable` | 146 | 3.94 |

Suma CxC = 553,009.54 · suma CxP = −14,668.06 → **cuadra exactamente** con el total del mayor.

Dos conclusiones de diseño:
1. **El filtro de cartera es `account_type`, no `display_type`.** Hay 370 líneas de producto que
   apuntan a cuentas por cobrar; excluirlas por `display_type` perdería Q22,118.
2. `display_type` sí sirve como **`origen_partida`** (de documento vs de asiento) — es información
   valiosa para explicar un saldo y **se añade al canónico**.

### D2 confirmada de forma contundente

| `display_type` | Líneas | Subtotal |
|---|---:|---:|
| `product` | 699 | 2,152,280.43 |
| `payment_term` | 459 | 0.00 |
| `tax` | 441 | 0.00 |

**Solo el 44% de las líneas de factura son de producto.** Sin filtrar `display_type='product'` el
grano del hecho quedaría inflado con líneas de impuesto y de plazo de pago.

### D6 confirmada con números

Borradores y cancelados **en la misma tabla**: 37 `in_invoice` en `draft` (contra 150 `posted` —
un 25% de inflación en compras si se cuelan), 33 `out_invoice` en `cancel`, más 4 `entry` draft y
otros. **Filtrar `state='posted'` siempre.**

### CORRECCIONES a la propuesta

**C1 — Multimoneda es más barata de lo que dije (A3 se mantiene, el argumento cambia).**
Ambos ERPs **ya guardan el monto en las dos monedas**: Odoo `balance` (moneda de la compañía) +
`amount_currency` (moneda del documento); SAP B1 `DocTotal` (local) + `DocTotalFC` (extranjera).
**No hay conversión que calcular** — son dos columnas más en el mapeo. El argumento correcto para
A3 no es "cuesta reprocesar", es "sin ella los totales de compra de Cresta (49% en USD) están mal".
En este Odoo hay **1 sola tasa de cambio registrada** (`res_currency_rate`, 2025-12-12), lo que
refuerza que hay que tomar el valor ya convertido del ERP y **no** recalcular con tasas propias.

**C2 — Odoo 18 guarda campos clave en `jsonb` (no previsto).**
`account_account` **no tiene columna `code` ni `company_id`**. Tiene:
- `code_store` `jsonb` → el código **por compañía**: `code_store->>'1'`
- `name` `jsonb` → traducciones: `name->>'es_GT'`

→ El mapeo Odoo necesita **expresiones**, no solo nombres de columna. El mecanismo ya existe
(`metadata.campo_ingesta.transformacion`), pero hay que usarlo desde el día uno para este ERP.

**C3 — `res_partner` no es la tabla de socios de negocio.**
225 filas · 221 activos · 214 raíz · **74 con rango comercial** · **62 con movimiento contable real**.
El resto son contactos y direcciones. → `plata_socio_negocio` debe filtrar
(`customer_rank > 0 OR supplier_rank > 0`, `active`), no traer `res_partner` completo.
**Socios duales (cliente Y proveedor): 2** → A7 confirmada también aquí.

**C4 — Multi-empresa: 4 compañías creadas, solo `company_id = 1` con movimiento.**
Las otras 3 están vacías. El filtro por compañía es obligatorio igualmente. *Preguntar a Edwin si
el cliente piensa activarlas.*

**C5 — El IVA guatemalteco es del 12% INCLUIDO en el precio.**
IVA efectivo sobre base en este Odoo: **13.60%** (276,130 sobre 2,029,625), que es exactamente
`12/(100−12) = 13.64%`. Las 4 tasas de `l10n_gt` son del 12% (2 venta, 2 compra).
→ Esto explica el **9.71% de Cresta**: si el efectivo esperado es 13.64%, alrededor de un **29% de
las ventas de Cresta son exentas o a tasa cero** (plausible en avícola por canasta básica).
→ **La definición de "Ventas Netas" debe declarar explícitamente si es con o sin IVA**, y el
catálogo debe registrarlo. No puede quedar implícito.

### Contraste entre los dos clientes (valida el diseño de dimensión opcional)

| | Cresta (SAP B1) | Cliente 2 (Odoo) |
|---|---|---|
| Centro de costo | **99.8%** de las líneas | **1 línea de 2,923** |
| Sucursal | no se usa (`BPLId` NULL) | no existe |
| Multimoneda | **49% de compras en USD** | 3.5% de documentos |
| Volumen | ~2.5M filas | ~5k filas |
| Diferencia mayor vs documento | 0.07% | **18.1%** |

Dos clientes con perfiles opuestos y el mismo canónico los cubre. Es la validación que se buscaba.

---

## 9. Decisiones para confirmar

| # | Decisión | Recomendación |
|---|---|---|
| A1 | **Plata unificada / Oro separada por proceso** | **Sí** — resuelve la objeción sin duplicar el mapeo |
| A2 | Saldo de cartera desde el **mayor**, no desde la factura | **Sí** — innegociable para que cuadre con contabilidad |
| A3 | Multimoneda (monto en documento + monto local) desde v1 | **Sí** — meterlo después obliga a reprocesar todo |
| A4 | Fotos diarias de cartera desde v1 | **Sí** — el histórico no se recupera después |
| A5 | Nomenclatura española completa (§1), incluidos esquemas | **Sí** — hoy cuesta una sesión |
| A6 | `metadata` → `metadatos` (toca el portal) | **Sí**, pero es la decisión con más costo: confirmar aparte |
| A7 | `dim_cliente` + `dim_proveedor` desde `plata_socio_negocio` | **Sí** — evita el cruce de socios duales |
| A8 | Odoo v1 = solo cartera + documentos (no inventario, no proyectos) | **Sí** — es lo que pidió el cliente |

Con A1–A8 confirmadas: contratos YAML v2 → paquete base SAP B1 (seeds versionados en git) → Plata
→ Oro → control de cuadre → paquete base Odoo.
