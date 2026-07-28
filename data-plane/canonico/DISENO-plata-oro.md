# Diseño definitivo — Capas Plata y Oro

> Diseño acordado tras validar contra los dos ERPs reales (SAP B1/Proavisa y Odoo 18/Iron Network).
> Complementa `PROPUESTA-canonico-v2.md` (decisiones y evidencia). Este documento es **el contrato**:
> qué tablas existen, con qué campos y de dónde sale cada uno en cada ERP.
>
> Nomenclatura: **español, sin mezcla**. Esquemas `bronce` · `plata` · `oro`.

---

## 0. Principios que fijan el diseño

1. **Plata unificada, Oro separada por proceso.** Plata absorbe la diferencia entre ERPs; Oro
   modela para el consumo (Power BI, semántica, agente).
2. **Todos los montos disponibles se conservan** (decisión de Edwin): sin impuesto, impuesto, con
   impuesto, en moneda del documento y en moneda local, descuento y costo. No se decide por el
   analista en la capa de datos — se le dan todos los ejes.
3. **La cartera sale del mayor**, filtrada por **tipo de cuenta**. Nunca de la factura.
4. **Ventana de extracción por fecha de creación/actualización**, no por fecha del documento
   (`DocDate` puede ser futura y es operación normal).
5. **Toda dimensión tiene miembro default** (`-1` / `DESCONOCIDO`) para que el hecho siempre cruce.
6. **Sin histórico previo a la migración**: Cresta migró de SQL Server a HANA en 2025-11; se
   trabaja sobre la base actual.

---

## 1. Cambios respecto a la propuesta anterior

| # | Cambio | Motivo |
|---|---|---|
| 1 | **Entra `almacen` como dimensión** | Ninguna sociedad de Cresta usa sucursales; usan **bodegas**. `INV1.WhsCode` está en 247,787 de 254,246 líneas (97.5%). Odoo tiene `stock_warehouse`. |
| 2 | **`organizacion` se reduce a empresa** | La sucursal (`BPLId`) está NULL en las 161,439 facturas y `OBPL` está vacía. El nivel sucursal desaparece; lo cubre `almacen`. |
| 3 | **Montos: se llevan todos** | Decisión de Edwin. Sin IVA / IVA / con IVA / doc / local / descuento / costo. |
| 4 | **Ventana por `UpdateDate` / `write_date`** | `DocDate` futura es operación normal en Cresta. |
| 5 | **`origen_partida` en cartera** | `display_type` en Odoo distingue partida de documento vs de asiento manual. Explica el saldo. |
| 6 | **Métricas duplicadas por base imponible** | El IVA guatemalteco va incluido en precio; "Ventas Netas" se publica **explícita** en versión sin IVA y con IVA, en vez de dejarlo implícito. |

---

## 2. Capa PLATA — 13 modelos

### 2.1 Maestros (9)

#### `plata_socio_negocio`
Grano: un socio por empresa. **Unifica cliente y proveedor.**

| Campo | Tipo | SAP B1 | Odoo 18 |
|---|---|---|---|
| `empresa_id` | text | de la conexión | `company_id` |
| `socio_codigo` | text | `OCRD.CardCode` | `res_partner.id` |
| `nombre` | text | `OCRD.CardName` | `res_partner.name` |
| `nit` | text | `OCRD.LicTradNum` | `res_partner.vat` |
| `es_cliente` | boolean | `CardType = 'C'` | `customer_rank > 0` |
| `es_proveedor` | boolean | `CardType = 'S'` | `supplier_rank > 0` |
| `grupo_codigo` | text | `OCRD.GroupCode` → `OCRG` | `res_partner_category` |
| `condicion_pago_codigo` | text | `OCRD.GroupNum` → `OCTG` | `property_payment_term_id` |
| `moneda_codigo` | text | `OCRD.Currency` | `res_partner.property_purchase_currency_id` |
| `pais` / `region` | text | `OCRD.Country` / `Territory` | `country_id` / `state_id` |
| `activo` | boolean | `OCRD.validFor = 'Y'` | `active` |

> **Filtro obligatorio en Odoo:** `active = true AND (customer_rank > 0 OR supplier_rank > 0)`.
> `res_partner` tiene 225 filas pero solo 74 son socios comerciales; el resto son contactos y
> direcciones.

#### `plata_producto`
`OITM` / `product_product` + `product_template`.
Campos: `producto_codigo`, `nombre`, `grupo_codigo`, `unidad_medida`, `tipo` (bien/servicio), `activo`.
> **Odoo 18:** `product_template.name` es **jsonb** → `name->>'es_GT'`.

#### `plata_vendedor`
`OSLP` (53 filas en Proavisa) / `res_users` vía `account_move.invoice_user_id`.
Campos: `vendedor_codigo`, `nombre`, `activo`. Miembro default obligatorio (Odoo lo usa poco).

#### `plata_organizacion`
Grano: una empresa. **Sin nivel sucursal.**
Campos: `empresa_id`, `nombre`, `nit`, `moneda_local`.

#### `plata_almacen` — **nuevo**
Grano: una bodega por empresa.

| Campo | SAP B1 | Odoo |
|---|---|---|
| `almacen_codigo` | `OWHS.WhsCode` | `stock_warehouse.code` |
| `nombre` | `OWHS.WhsName` | `stock_warehouse.name` |
| `activo` | `OWHS.Inactive = 'N'` | `active` |

#### `plata_cuenta` — **pieza obligatoria del pipeline de cartera**
Grano: una cuenta contable por empresa.

| Campo | SAP B1 | Odoo 18 |
|---|---|---|
| `cuenta_codigo` | `OACT.AcctCode` | **`account_account.code_store->>'<company_id>'`** |
| `nombre` | `OACT.AcctName` | **`account_account.name->>'es_GT'`** |
| `tipo_cuenta` | derivado de `OACT` (grupo/nivel) | `account_type` normalizado |
| `es_cartera_cobrar` | tipo = por cobrar | `account_type = 'asset_receivable'` |
| `es_cartera_pagar` | tipo = por pagar | `account_type = 'liability_payable'` |

> **`tipo_cuenta` normalizado:** `por_cobrar`, `por_pagar`, `banco`, `caja`, `ingreso`, `gasto`,
> `costo`, `inventario`, `activo`, `pasivo`, `patrimonio`, `orden`.

#### `plata_centro_costo`
`OPRC` (216 en Proavisa) / `account_analytic_account` (1 en Iron Network).
Con miembro default — el uso es opuesto entre los dos clientes.

#### `plata_moneda`
`OCRN` / `res_currency`. Campos: `moneda_codigo`, `nombre`, `es_local`.

#### `plata_tipo_cambio`
`ORTT` / `res_currency_rate`. Campos: `moneda_codigo`, `fecha`, `tasa`.
> **Solo informativo.** La conversión **no se recalcula**: ambos ERPs ya guardan el monto en las
> dos monedas. Iron Network tiene 1 sola tasa registrada — recalcular daría números falsos.

---

### 2.2 Documentos comerciales (2)

#### `plata_documento_comercial` — cabecera

| Campo | Tipo | SAP B1 | Odoo 18 |
|---|---|---|---|
| `empresa_id` | text | conexión | `company_id` |
| `documento_id` | text | `DocEntry` | `account_move.id` |
| `documento_numero` | text | `DocNum` | `name` |
| `flujo` | text | `venta` (OINV/ORIN) · `compra` (OPCH/ORPC) | `out_*` → venta · `in_*` → compra |
| `tipo_documento` | text | `factura` (13,18) · `nota_credito` (14,19) | `*_invoice` · `*_refund` |
| `tipo_documento_origen` | text | `ObjType` | `move_type` |
| `socio_codigo` | text | `CardCode` | `partner_id` |
| `vendedor_codigo` | text | `SlpCode` | `invoice_user_id` |
| `fecha_documento` | date | `DocDate` | `invoice_date` / `date` |
| `fecha_vencimiento` | date | `DocDueDate` | `invoice_date_due` |
| `fecha_registro` | date | `TaxDate` | `date` |
| `moneda_documento` | text | `DocCur` | `currency_id` |
| `moneda_local` | text | moneda de la empresa | `company_currency_id` |
| `tipo_cambio` | numeric | `DocRate` | derivado (`balance`/`amount_currency`) |
| `total_sin_impuesto_doc` | numeric | `DocTotal − VatSum` (FC: `DocTotalFC − VatSumFC`) | `amount_untaxed` |
| `total_impuesto_doc` | numeric | `VatSum` / `VatSumFC` | `amount_tax` |
| `total_con_impuesto_doc` | numeric | `DocTotal` / `DocTotalFC` | `amount_total` |
| `total_sin_impuesto_local` | numeric | `DocTotal − VatSum` | `amount_untaxed_signed` |
| `total_con_impuesto_local` | numeric | `DocTotal` | `amount_total_signed` |
| `saldo_documento` | numeric | `DocTotal − PaidToDate` | `amount_residual` *(informativo, no fuente de cartera)* |
| `estado` | text | `DocStatus` + `CANCELED` | `state` |
| `estado_pago` | text | `DocStatus` | `payment_state` |
| `documento_referencia` | text | `ORIN → OINV` (`RIN1.BaseEntry`) | `reversed_entry_id` |
| `referencia_externa` | text | `NumAtCard` | `ref` |
| `creado_en` / `actualizado_en` | timestamp | `CreateDate` / `UpdateDate` | `create_date` / `write_date` |

**Filtros duros:**
- SAP B1: `CANCELED <> 'Y'`; los borradores viven en `ODRF` (tabla aparte, no se extrae).
- Odoo: **`state = 'posted'`** — borradores y cancelados están en la misma tabla
  (37 `in_invoice` en draft sobre 150 posted = 25% de inflación si se cuelan).

**Signo:** `nota_credito` → negativo. Se normaliza aquí, en un solo lugar.

#### `plata_documento_linea` — **el grano del hecho**

| Campo | SAP B1 (`INV1`/`PCH1`…) | Odoo 18 (`account_move_line`) |
|---|---|---|
| `documento_id`, `linea_numero` | `DocEntry`, `LineNum` | `move_id`, `id` |
| `producto_codigo` | `ItemCode` | `product_id` |
| `descripcion` | `Dscription` | `name` |
| `almacen_codigo` | `WhsCode` | vía `stock` |
| `centro_costo_codigo` | `OcrCode` | `analytic_distribution` (clave única; `MULTIPLE` si >1) |
| `cuenta_codigo` | `AcctCode` | `account_id` |
| `cantidad` | `Quantity` | `quantity` |
| `unidad_medida` | `unitMsr` | `product_uom_id` |
| `precio_unitario_doc` | `Price` | `price_unit` |
| `precio_antes_descuento` | `PriceBefDi` | `price_unit` |
| `descuento_pct` | `DiscPrcnt` | `discount` |
| `monto_sin_impuesto_doc` | `TotalFrgn` | `price_subtotal` |
| `monto_sin_impuesto_local` | `LineTotal` | `balance` |
| `monto_impuesto_doc` | `VatSumFrgn` | `price_total − price_subtotal` |
| `monto_impuesto_local` | `VatSum` | derivado |
| `monto_con_impuesto_doc` | `GTotalFC` | `price_total` |
| `monto_con_impuesto_local` | `GTotal` | derivado |
| `costo_local` | `StockPrice` | vía `stock` / `product` |
| `margen_local` | `GrssProfit` | derivado |

**Filtro Odoo:** `display_type = 'product'`. Solo el 44% de las líneas lo son — el resto son
líneas de impuesto (`tax`) y de plazo de pago (`payment_term`).

---

### 2.3 Cartera (1)

#### `plata_partida_cartera` — el corazón

Grano: **una partida del mayor** en cuenta por cobrar o por pagar.

| Campo | SAP B1 (`JDT1` + `OJDT`) | Odoo 18 (`account_move_line`) |
|---|---|---|
| `empresa_id` | conexión | `company_id` |
| `partida_id` | `TransId` + `Line_ID` | `id` |
| `tipo_cartera` | `cobrar` / `pagar` según `tipo_cuenta` | `asset_receivable` / `liability_payable` |
| `socio_codigo` | `JDT1.ShortName` | `partner_id` |
| `cuenta_codigo` | `JDT1.Account` | `account_id` |
| `documento_origen` | `OJDT.BaseRef` / `TransId` | `move_id` |
| `tipo_documento_origen` | `OJDT.TransType` (ObjType) | `account_move.move_type` |
| `origen_partida` | derivado del `TransType` | **`display_type`** (`payment_term` = de documento, `product` = de asiento) |
| `fecha_documento` | `JDT1.RefDate` | `date` |
| `fecha_vencimiento` | `JDT1.DueDate` | `date_maturity` |
| `monto_original_local` | `Debit − Credit` | `balance` |
| `monto_original_doc` | `FCDebit − FCCredit` | `amount_currency` |
| `saldo_pendiente_local` | **`BalDueDeb − BalDueCred`** | **`amount_residual`** |
| `saldo_pendiente_doc` | `BalFcDeb − BalFcCred` | `amount_residual_currency` |
| `moneda_documento` | `JDT1.FCCurrency` | `currency_id` |
| `esta_abierta` | `BalDueDeb <> BalDueCred` | `amount_residual <> 0` |
| `dias_vencido` | `fecha_corte − DueDate` | igual |
| `conciliada` | — | `reconciled` / `full_reconcile_id` |

**Filtro obligatorio — y es el que se descubrió en el diagnóstico:**

```
plata_cuenta.tipo_cuenta IN ('por_cobrar','por_pagar')
  AND estado del asiento = contabilizado
```

**NO** filtrar por `display_type` (en Odoo, 370 líneas `product` apuntan a cuentas por cobrar —
excluirlas perdería Q22,118) ni por `BalDue* <> BalDue*` a secas (en SAP el mayor incluye
inventario y producción: de 1,732,253 partidas, 1,043,823 tienen saldo pero la mayoría no es cartera).

> **En Guatemala las retenciones de IVA reducen el saldo por cobrar.** Iron Network tiene un diario
> "RETENCIONES IVA" con 82 asientos. Esas partidas entran por el mayor de forma natural; por
> documento no se verían.

---

### 2.4 Control (1)

#### `plata_control_cuadre`
Grano: una verificación por empresa / concepto / fecha de corte.

| Campo | Contenido |
|---|---|
| `concepto` | `saldo_cxc`, `saldo_cxp`, `ventas_periodo`, `compras_periodo` |
| `valor_erp` | total calculado directamente contra el origen |
| `valor_canonico` | total según Plata |
| `diferencia`, `diferencia_pct` | |
| `cuadra` | `abs(diferencia) <= tolerancia` |

**Regla: si `cuadra = false`, Oro no publica ese concepto.** Es la credibilidad del producto.

#### `cuarentena_*`
Registros que fallan calidad, con regla violada y timestamp. No bloquean el pipeline (§10).

---

## 3. Capa ORO

### 3.1 Dimensiones (11)

| Dimensión | Versionado | Nota |
|---|---|---|
| `dim_tiempo` | — | calendario |
| `dim_cliente` | **SCD2** | de `plata_socio_negocio` donde `es_cliente` |
| `dim_proveedor` | **SCD2** | de `plata_socio_negocio` donde `es_proveedor` |
| `dim_producto` | SCD2 | |
| `dim_vendedor` | SCD1 | |
| `dim_organizacion` | SCD1 | empresa |
| `dim_almacen` | SCD1 | bodega |
| `dim_moneda` | SCD1 | |
| `dim_cuenta` | SCD1 | |
| `dim_centro_costo` | SCD1 | |
| `dim_tipo_documento` | SCD1 | homologa `ObjType` ↔ `move_type` |

Clave sustituta: `<entidad>_clave`. Vigencia: `valido_desde` / `valido_hasta` / `es_vigente`.
Miembro default `-1` / `DESCONOCIDO` en todas.

> `dim_cliente` y `dim_proveedor` separadas porque hay socios duales: **35 NIT en Cresta**, 2 en
> Iron Network. Con dimensión única, filtrar por uno de ellos en ventas arrastraría sus compras.

### 3.2 Hechos (6)

| Hecho | Grano | Dominio | Dimensiones |
|---|---|---|---|
| `hecho_venta_linea` | línea de factura/NC de venta | `ventas` | tiempo, cliente, producto, vendedor, organizacion, almacen, moneda, cuenta, centro_costo, tipo_documento |
| `hecho_compra_linea` | línea de factura/NC de compra | `compras` | tiempo, proveedor, producto, organizacion, almacen, moneda, cuenta, centro_costo, tipo_documento |
| `hecho_cartera_cobrar` | partida abierta de CxC | `tesoreria` | tiempo, cliente, vendedor, organizacion, moneda, cuenta, tipo_documento |
| `hecho_cartera_pagar` | partida abierta de CxP | `tesoreria` | tiempo, proveedor, organizacion, moneda, cuenta, tipo_documento |
| `hecho_cartera_cobrar_diaria` | foto diaria por partida | `tesoreria` | + `fecha_corte` |
| `hecho_cartera_pagar_diaria` | foto diaria por partida | `tesoreria` | + `fecha_corte` |

**Medidas en los hechos de línea** (todas, según la decisión de Edwin):
`cantidad`, `monto_sin_impuesto_doc/local`, `monto_impuesto_doc/local`,
`monto_con_impuesto_doc/local`, `descuento_monto`, `costo_local`, `margen_local`.

**Medidas en los hechos de cartera:**
`monto_original_doc/local`, `saldo_pendiente_doc/local`, `dias_vencido`, `rango_aging`.

### 3.3 Métricas certificadas (14)

| Dominio | Métrica | Base |
|---|---|---|
| `ventas` | Ventas Brutas (sin IVA) | `hecho_venta_linea`, factura |
| `ventas` | Ventas Brutas (con IVA) | ídem |
| `ventas` | Devoluciones (sin IVA) | nota de crédito |
| `ventas` | **Ventas Netas (sin IVA)** | brutas − devoluciones |
| `ventas` | **Ventas Netas (con IVA)** | ídem sobre monto con IVA |
| `compras` | Compras Brutas (sin IVA) | `hecho_compra_linea`, factura |
| `compras` | Notas de Crédito Compra | |
| `compras` | Compras Netas (sin IVA) | |
| `tesoreria` | Saldo CxC | `hecho_cartera_cobrar` |
| `tesoreria` | Aging CxC | corriente, 1-30, 31-60, 61-90, +90 |
| `tesoreria` | Saldo CxP | `hecho_cartera_pagar` |
| `tesoreria` | Aging CxP | |
| `ventas` | Margen Bruto | `monto_sin_impuesto − costo` |
| `ventas` | Rentabilidad por Cliente | margen agrupado |

> **Por qué "sin IVA" y "con IVA" van como métricas separadas:** el IVA guatemalteco va **incluido
> en el precio** (efectivo 13.60% sobre base = `12/(100−12)`). Publicar una sola "Ventas Netas" sin
> decir cuál es exactamente la ambigüedad que este proyecto existe para eliminar. Se publican las
> dos, nombradas sin ambigüedad, y el glosario del tenant decide cuál responde a la palabra
> "ventas" en ese negocio.
>
> El IVA efectivo de Cresta es **9.71%** contra el 13.64% esperado → alrededor del **29% de sus
> ventas son exentas o a tasa cero**. Con las dos métricas explícitas, eso se ve en vez de esconderse.

---

## 4. Bronce derivado

**SAP B1** (por sociedad): `OCRD`, `OCRG`, `OCTG`, `OITM`, `OITB`, `OSLP`, `OACT`, `OWHS`, `OPRC`,
`OCRN`, `ORTT`, `OJDT`, `JDT1`, `OINV`+`INV1`, `ORIN`+`RIN1`, `OPCH`+`PCH1`, `ORPC`+`RPC1`.
*(Sale `OBPL`: sin uso. Entra `OWHS`: bodegas.)*

**Odoo 18**: `res_company`, `res_partner`, `res_currency`, `res_currency_rate`, `res_users`,
`product_product`, `product_template`, `account_account`, `account_journal`, `account_move`,
`account_move_line`, `account_analytic_account`, `account_payment_term`, `stock_warehouse`.

**Ventana de extracción:** `UpdateDate` / `CreateDate` (SAP B1) · `write_date` / `create_date`
(Odoo). **No `DocDate`** — puede ser futura y es operación normal en Cresta.

> *A validar:* si `UpdateDate` en SAP B1 tiene solo fecha (sin hora), los incrementales intradía
> necesitan `UpdateTS` o una ventana con solape de un día.

---

## 5. Configuración de las dos sociedades

| | Grupo Cresta | Iron Network |
|---|---|---|
| ERP | SAP Business One / HANA | Odoo 18.0.1.3 |
| Acceso | `10.10.143.69:30015`, esquema por sociedad | Postgres directo |
| Empresas | 6 sociedades (1 BD c/u) — piloto `proavisa` | `company_id = 1` (**IRON NETWORK S.A.**, NIT 118149822) |
| Moneda local | GTQ | GTQ |
| Multimoneda | **49% del valor de compras en USD** | 3.5% de documentos |
| Centro de costo | 99.8% de líneas | prácticamente sin uso |
| Almacenes | sí (bodegas) | 1 almacén |
| FEL | — | `l10n_gt_fel` instalado |

> Las otras 3 compañías de la base Odoo (Colegio Mixto Cipresales, Little Hearts Daycare,
> Cipresales DayCare) **no tienen movimiento**. Se excluyen; si activan alguna, entra como
> `empresa_id` adicional sin tocar el motor.
