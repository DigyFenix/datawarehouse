# Inventario del modelo semántico

_Generado por `inventario_modelo.py` desde el TMDL publicado. No editar a mano._

**43 tablas** · **662 columnas** · **294 medidas** · **98 relaciones**


## Tablas por rol


### Dimensiones (20)

| Tabla | Columnas | Medidas | Jerarquías |
|---|---:|---:|---|
| DM_Antigüedad | 11 | 0 | — |
| DM_Análisis de producto | 30 | 14 | — |
| DM_Año de clasificación | 9 | 0 | — |
| DM_Bodega | 8 | 0 | — |
| DM_Calendario | 55 | 0 | Jerarquía natural, Jerarquía ISO |
| DM_Centro de costo | 8 | 0 | — |
| DM_Clasificación ABC | 18 | 11 | — |
| DM_Clasificación ABC Proveedor | 17 | 10 | — |
| DM_Clasificación RFM | 15 | 13 | — |
| DM_Cliente | 19 | 0 | — |
| DM_Comportamiento de pago | 20 | 5 | — |
| DM_Cuenta contable | 26 | 0 | Jerarquía contable |
| DM_Dirección de entrega | 16 | 0 | — |
| DM_Empresa | 8 | 0 | — |
| DM_Moneda | 8 | 0 | — |
| DM_Producto | 11 | 0 | — |
| DM_Proveedor | 17 | 0 | — |
| DM_Socio de negocio | 18 | 0 | — |
| DM_Tipo de documento | 9 | 0 | — |
| DM_Vendedor | 8 | 0 | — |

### Hechos (16)

| Tabla | Columnas | Medidas | Jerarquías |
|---|---:|---:|---|
| FC_Campos de usuario | 11 | 2 | — |
| FC_Cartera cobrar histórico | 17 | 7 | — |
| FC_Cartera pagar histórico | 18 | 3 | — |
| FC_Cartera por cobrar | 24 | 27 | — |
| FC_Cartera por pagar | 25 | 17 | — |
| FC_Compras | 32 | 34 | — |
| FC_Estado de carga | 12 | 5 | — |
| FC_Inventario | 11 | 9 | — |
| FC_Pagos efectuados | 19 | 12 | — |
| FC_Pagos recibidos | 19 | 13 | — |
| FC_Pedidos | 30 | 17 | — |
| FC_Proyección de caja | 14 | 9 | — |
| FC_Resultados contables | 19 | 19 | — |
| FC_Tipo de cambio | 9 | 2 | — |
| FC_Venta diaria | 15 | 11 | — |
| FC_Ventas | 36 | 54 | — |

### Solo medidas (7)

| Tabla | Columnas | Medidas | Jerarquías |
|---|---:|---:|---|
| MD_Moneda de análisis | 2 | 0 | — |
| MD_Vista de cartera | 3 | 0 | — |
| MD_Vista de compras | 3 | 0 | — |
| MD_Vista de inventario | 3 | 0 | — |
| MD_Vista de liquidez | 3 | 0 | — |
| MD_Vista de rentabilidad | 3 | 0 | — |
| MD_Vista de ventas | 3 | 0 | — |

## Relaciones

- Total: **98**
- Inactivas (para `USERELATIONSHIP`): **5**
- Bidireccionales: **0**


**Inactivas**

- `rel_029` · 'FC_Cartera por cobrar'.tiempo_vencimiento_clave → DM_Calendario.tiempo_clave
- `rel_037` · 'FC_Cartera por pagar'.tiempo_vencimiento_clave → DM_Calendario.tiempo_clave
- `rel_044` · 'FC_Cartera cobrar histórico'.tiempo_vencimiento_clave → DM_Calendario.tiempo_clave
- `rel_051` · 'FC_Cartera pagar histórico'.tiempo_vencimiento_clave → DM_Calendario.tiempo_clave
- `rel_085` · FC_Pedidos.tiempo_vencimiento_clave → DM_Calendario.tiempo_clave

## Medidas por carpeta


### DM_Análisis de producto (14)


**01 Inventario muerto**

- Valor de inventario ocioso
- Productos ociosos ⚠ sin descripción
- % Inventario ocioso ⚠ sin descripción
- Valor sin rotación comercial
- Productos sin rotación comercial ⚠ sin descripción

**02 Quiebre de stock**

- Productos en quiebre
- Venta anual en riesgo por quiebre

**03 Cobertura**

- Cobertura promedio en días ⚠ sin descripción
- Productos sin existencia ⚠ sin descripción

**04 Concentración**

- Productos A
- Productos B ⚠ sin descripción
- Productos C ⚠ sin descripción
- % Venta en productos A ⚠ sin descripción
- Inventario en productos C

### DM_Clasificación ABC (11)


**01 Conteos**

- Clientes A
- Clientes B ⚠ sin descripción
- Clientes C ⚠ sin descripción
- Clientes sin venta neta ⚠ sin descripción
- Clientes clasificados ⚠ sin descripción
- Clientes perdidos
- Clientes estrenados en el año

**02 Concentración**

- % Venta en clientes A
- Venta del año clasificada
- Venta promedio cliente A ⚠ sin descripción
- Margen de clientes A ⚠ sin descripción

### DM_Clasificación ABC Proveedor (10)


**01 Conteos**

- Proveedores A
- Proveedores B ⚠ sin descripción
- Proveedores C ⚠ sin descripción
- Proveedores sin compra neta ⚠ sin descripción
- Proveedores clasificados ⚠ sin descripción
- Proveedores inactivos
- Proveedores estrenados en el año

**02 Concentración**

- % Compra en proveedores A
- Compra del año clasificada
- Compra promedio proveedor A ⚠ sin descripción

### DM_Clasificación RFM (13)


**01 Conteos**

- Clientes campeones
- Clientes leales ⚠ sin descripción
- Clientes en riesgo
- Clientes en riesgo valiosos
- Clientes dormidos ⚠ sin descripción

**02 Montos**

- Venta 12m en riesgo
- Venta 12m clasificada ⚠ sin descripción

**03 Rotación de cartera**

- Clientes nuevos
- Ventas de clientes nuevos
- % Venta de clientes nuevos ⚠ sin descripción
- Clientes activos 12m
- % Clientes activos ⚠ sin descripción
- Antigüedad media del cliente

### DM_Comportamiento de pago (5)


**01 Conteos**

- Clientes al día ⚠ sin descripción
- Clientes en vencido crítico
- Clientes con saldo vencido ⚠ sin descripción

**02 Montos**

- Saldo en clientes críticos ⚠ sin descripción
- % cartera vencida (clientes)

### FC_Campos de usuario (2)


**01 Conteos**

- Valores de usuario capturados
- Campos de usuario distintos ⚠ sin descripción

### FC_Cartera cobrar histórico (7)


**01 Evolución**

- Saldo histórico por cobrar
- Vencido histórico por cobrar ⚠ sin descripción
- % Vencido histórico ⚠ sin descripción

**02 Gestión**

- Cartera al inicio del período
- Cartera al cierre del período ⚠ sin descripción
- Variación de cartera
- Efectividad de cobranza

### FC_Cartera pagar histórico (3)


**01 Evolución**

- Saldo histórico por pagar
- Vencido histórico por pagar ⚠ sin descripción
- Posición neta histórica

### FC_Cartera por cobrar (27)


**01 Saldo**

- Saldo por cobrar
- Saldo por cobrar terceros ⚠ sin descripción
- Saldo por cobrar grupo

**02 Conteos**

- Partidas por cobrar ⚠ sin descripción
- Clientes con saldo ⚠ sin descripción
- Saldo promedio por cliente ⚠ sin descripción

**03 Antigüedad**

- Saldo corriente ⚠ sin descripción
- Saldo vencido ⚠ sin descripción
- Saldo vencido terceros
- % Vencido ⚠ sin descripción
- % Vencido terceros ⚠ sin descripción
- Vencido 1 a 30 ⚠ sin descripción
- Vencido 31 a 60 ⚠ sin descripción
- Vencido 61 a 90 ⚠ sin descripción
- Vencido más de 90 ⚠ sin descripción
- % Crítico más de 90
- Saldo sin vencimiento

**04 Riesgo**

- Días vencido promedio
- Días de cartera terceros
- Rotación de cartera

**05 Foto de hoy**

- Por cobrar terceros hoy
- Por cobrar grupo hoy ⚠ sin descripción
- Vencido terceros hoy ⚠ sin descripción
- % Vencido terceros hoy ⚠ sin descripción

**06 Concentración**

- Exposición mayor deudor
- % Exposición mayor deudor ⚠ sin descripción
- % Saldo en top 5 deudores ⚠ sin descripción

### FC_Cartera por pagar (17)


**01 Saldo**

- Saldo por pagar
- Saldo por pagar terceros ⚠ sin descripción
- Saldo por pagar grupo ⚠ sin descripción
- Posición neta

**02 Conteos**

- Partidas por pagar ⚠ sin descripción
- Proveedores con saldo ⚠ sin descripción
- Proveedores con saldo vencido ⚠ sin descripción

**03 Antigüedad**

- Por pagar vencido ⚠ sin descripción
- % Por pagar vencido ⚠ sin descripción
- Por pagar más de 90 ⚠ sin descripción
- Por pagar sin vencimiento ⚠ sin descripción
- % Deuda en el mayor acreedor

**04 Foto de hoy**

- Por pagar hoy
- Posición neta hoy ⚠ sin descripción

**05 Ciclo de efectivo**

- Días de pago terceros
- Rotación de cuentas por pagar ⚠ sin descripción
- Ciclo de conversión de efectivo

### FC_Compras (34)


**01 Importes**

- Compras netas
- Compras netas con IVA ⚠ sin descripción
- Impuesto de compras ⚠ sin descripción
- Saldo de facturas de compra
- Compras de servicios

**02 Terceros vs grupo**

- Compras a terceros ⚠ sin descripción
- Compras al grupo ⚠ sin descripción
- % Compra al grupo ⚠ sin descripción

**03 Conteos**

- Unidades compradas ⚠ sin descripción
- Líneas de compra ⚠ sin descripción
- Documentos de compra ⚠ sin descripción
- Proveedores con compra ⚠ sin descripción

**04 Promedios**

- Compra promedio por documento ⚠ sin descripción
- Compra promedio por proveedor ⚠ sin descripción
- Compra promedio diaria

**05 Comparativos**

- Compras mes anterior ⚠ sin descripción
- Compras año anterior ⚠ sin descripción
- Compras acumuladas mes ⚠ sin descripción
- Compras acumuladas año ⚠ sin descripción
- Compras acumuladas año anterior ⚠ sin descripción
- Variación compras vs mes anterior ⚠ sin descripción
- Variación compras vs año anterior ⚠ sin descripción
- Media móvil 3 meses compras ⚠ sin descripción
- Compras acumuladas trimestre
- Compras 12 meses móviles ⚠ sin descripción
- Variación compras acumulada vs año anterior ⚠ sin descripción

**06 Pareto**

- Ranking de proveedor por compra ⚠ sin descripción
- % acumulado de compra proveedores
- % Compra en el mayor proveedor
- % Compra en top 10 proveedores ⚠ sin descripción

**07 Inflación de insumos**

- Precio promedio de compra
- Precio de compra año anterior ⚠ sin descripción
- % Variación de precio de compra
- Sobrecosto por precio de compra

### FC_Estado de carga (5)


**01 Frescura**

- Días desde última extracción
- Última extracción ⚠ sin descripción
- Último dato del ERP
- Dominios desactualizados ⚠ sin descripción

**02 Volumen**

- Filas cargadas ⚠ sin descripción

### FC_Inventario (9)


**01 Importes**

- Valor de inventario

**02 Conteos**

- Unidades en existencia ⚠ sin descripción
- Productos con existencia ⚠ sin descripción
- Bodegas con existencia ⚠ sin descripción

**03 Promedios**

- Costo promedio ponderado ⚠ sin descripción

**04 Rotación**

- Rotación de inventario 12M
- Días de inventario ⚠ sin descripción
- Meses de inventario ⚠ sin descripción
- Inventario sobre ventas

### FC_Pagos efectuados (12)


**01 Importes**

- Monto pagado ⚠ sin descripción
- Pagos a proveedores
- Flujo neto de caja

**02 Conteos**

- Cantidad de pagos ⚠ sin descripción
- Proveedores pagados ⚠ sin descripción

**03 Promedios**

- Pago promedio ⚠ sin descripción

**04 Comparativos**

- Pagos mes anterior ⚠ sin descripción
- Pagos acumulados año ⚠ sin descripción
- Pagos año anterior ⚠ sin descripción
- Pagos acumulados mes ⚠ sin descripción
- Variación de pagos vs año anterior ⚠ sin descripción
- Flujo neto acumulado año

### FC_Pagos recibidos (13)


**01 Importes**

- Monto cobrado
- Cobros de clientes
- Cobros de tesorería ⚠ sin descripción
- % Cobrado vs facturado

**02 Conteos**

- Cantidad de cobros ⚠ sin descripción
- Clientes que pagaron ⚠ sin descripción

**03 Promedios**

- Cobro promedio ⚠ sin descripción

**04 Comparativos**

- Cobros mes anterior ⚠ sin descripción
- Cobros acumulados año ⚠ sin descripción
- Cobros año anterior ⚠ sin descripción
- Cobros acumulados mes ⚠ sin descripción
- Variación de cobros vs año anterior ⚠ sin descripción

**05 Mix de cobro**

- % Cobro en el medio principal

### FC_Pedidos (17)


**01 Pedido**

- Monto pedido
- Cantidad pedida ⚠ sin descripción
- Pedidos del período ⚠ sin descripción
- Clientes con pedido ⚠ sin descripción

**02 Backlog**

- Backlog
- Cantidad pendiente ⚠ sin descripción
- Líneas abiertas ⚠ sin descripción
- Fill rate
- Backlog en días de venta

**03 Cumplimiento**

- Líneas de pedido vencidas
- Backlog vencido ⚠ sin descripción
- % Backlog vencido ⚠ sin descripción
- Lead time prometido

**04 Promedios**

- Ticket promedio de pedido ⚠ sin descripción

**05 Comparativos**

- Pedidos mes anterior ⚠ sin descripción
- Pedidos año anterior ⚠ sin descripción
- Pedido sobre facturado

### FC_Proyección de caja (9)


**01 Proyección**

- Entradas proyectadas
- Salidas proyectadas ⚠ sin descripción
- Flujo neto proyectado ⚠ sin descripción

**02 Vencido**

- Entradas vencidas (exigible)
- Salidas vencidas (exigible) ⚠ sin descripción

**03 Acumulado**

- Posición proyectada acumulada
- Entradas próximas 4 semanas
- Salidas próximas 4 semanas ⚠ sin descripción
- Flujo neto próximas 4 semanas ⚠ sin descripción

### FC_Resultados contables (19)


**01 P&L**

- Gasto operativo
- Costo (contable) ⚠ sin descripción
- Ingresos contables
- Resultado contable
- Partidas contables ⚠ sin descripción

**02 Estructura**

- % Margen operativo
- % Gasto sobre ingreso
- % Costo sobre ingreso ⚠ sin descripción
- % Gasto en el mayor rubro
- Gasto promedio mensual ⚠ sin descripción

**03 Comparativos**

- Gasto mes anterior ⚠ sin descripción
- Gasto año anterior ⚠ sin descripción
- Gasto acumulado año ⚠ sin descripción
- Variación de gasto vs año anterior ⚠ sin descripción
- Ingresos acumulados año ⚠ sin descripción
- Resultado acumulado año ⚠ sin descripción
- Resultado mes anterior ⚠ sin descripción

**04 Control**

- Brecha contable vs facturado
- % Brecha contable ⚠ sin descripción

### FC_Tipo de cambio (2)


**01 Tasa**

- Tipo de cambio promedio
- Tipo de cambio de cierre

### FC_Venta diaria (11)


**01 Serie**

- Venta diaria neta
- Venta media móvil 7d ⚠ sin descripción
- Venta media móvil 30d ⚠ sin descripción
- Venta promedio día operado

**02 Actividad**

- Días sin venta ⚠ sin descripción
- Clientes activos por día ⚠ sin descripción
- Días con venta ⚠ sin descripción

**03 Ritmo**

- Venta por día hábil
- Proyección de cierre de mes
- Índice de estacionalidad
- Venta acumulada semana ⚠ sin descripción

### FC_Ventas (54)


**01 Importes**

- Ventas netas
- Ventas netas con IVA ⚠ sin descripción
- Ventas brutas ⚠ sin descripción
- Devoluciones ⚠ sin descripción
- Impuesto facturado ⚠ sin descripción
- Descuento otorgado ⚠ sin descripción
- % Descuento ⚠ sin descripción
- Saldo de facturas
- Ventas de servicios

**02 Terceros vs grupo**

- Ventas a terceros
- Ventas al grupo ⚠ sin descripción
- % Venta al grupo ⚠ sin descripción

**03 Conteos**

- Unidades vendidas ⚠ sin descripción
- Líneas de venta ⚠ sin descripción
- Documentos de venta ⚠ sin descripción
- Clientes con venta ⚠ sin descripción
- Productos vendidos ⚠ sin descripción

**04 Promedios**

- Ticket promedio ⚠ sin descripción
- Precio promedio unidad ⚠ sin descripción
- Venta promedio por línea ⚠ sin descripción
- Venta promedio diaria
- Venta promedio por cliente ⚠ sin descripción
- Productos por cliente

**05 Rentabilidad**

- Costo de ventas ⚠ sin descripción
- Margen bruto ⚠ sin descripción
- % Margen ⚠ sin descripción
- % Margen terceros

**06 Comparativos**

- Ventas mes anterior
- Ventas año anterior ⚠ sin descripción
- Ventas acumuladas mes
- Ventas acumuladas trimestre ⚠ sin descripción
- Ventas acumuladas año ⚠ sin descripción
- Ventas acumuladas año anterior
- Variación vs mes anterior ⚠ sin descripción
- Variación vs año anterior ⚠ sin descripción
- Variación acumulada vs año anterior ⚠ sin descripción
- Media móvil 3 meses
- Ventas 12 meses móviles

**07 Pareto**

- Ranking de cliente por venta
- % acumulado de venta clientes
- Ranking de producto por venta ⚠ sin descripción
- % acumulado de venta productos
- % Venta en top 10 clientes

**08 Fugas de margen**

- Ventas bajo costo
- Líneas bajo costo ⚠ sin descripción
- Margen perdido bajo costo
- % Ventas bajo costo ⚠ sin descripción
- Productos vendidos bajo costo ⚠ sin descripción
- Clientes con venta bajo costo ⚠ sin descripción

**09 Precio y volumen**

- Precio promedio año anterior
- Unidades año anterior ⚠ sin descripción
- Efecto precio
- Efecto volumen
- Efecto mezcla

## Medidas sin descripción

**176 de 294.** La descripción `///` es lo único que el usuario final ve al pasar el cursor sobre el campo, y lo que permite que un agente genere DAX correcto contra el modelo.


**DM_Análisis de producto** (8)

- Productos ociosos
- % Inventario ocioso
- Productos sin rotación comercial
- Cobertura promedio en días
- Productos sin existencia
- Productos B
- Productos C
- % Venta en productos A

**DM_Clasificación ABC** (6)

- Clientes B
- Clientes C
- Clientes sin venta neta
- Clientes clasificados
- Venta promedio cliente A
- Margen de clientes A

**DM_Clasificación ABC Proveedor** (5)

- Proveedores B
- Proveedores C
- Proveedores sin compra neta
- Proveedores clasificados
- Compra promedio proveedor A

**DM_Clasificación RFM** (5)

- Clientes leales
- Clientes dormidos
- Venta 12m clasificada
- % Venta de clientes nuevos
- % Clientes activos

**DM_Comportamiento de pago** (3)

- Clientes al día
- Clientes con saldo vencido
- Saldo en clientes críticos

**FC_Campos de usuario** (1)

- Campos de usuario distintos

**FC_Cartera cobrar histórico** (3)

- Vencido histórico por cobrar
- % Vencido histórico
- Cartera al cierre del período

**FC_Cartera pagar histórico** (1)

- Vencido histórico por pagar

**FC_Cartera por cobrar** (17)

- Saldo por cobrar terceros
- Partidas por cobrar
- Clientes con saldo
- Saldo promedio por cliente
- Saldo corriente
- Saldo vencido
- % Vencido
- % Vencido terceros
- Vencido 1 a 30
- Vencido 31 a 60
- Vencido 61 a 90
- Vencido más de 90
- Por cobrar grupo hoy
- Vencido terceros hoy
- % Vencido terceros hoy
- % Exposición mayor deudor
- % Saldo en top 5 deudores

**FC_Cartera por pagar** (11)

- Saldo por pagar terceros
- Saldo por pagar grupo
- Partidas por pagar
- Proveedores con saldo
- Por pagar vencido
- % Por pagar vencido
- Por pagar más de 90
- Posición neta hoy
- Rotación de cuentas por pagar
- Proveedores con saldo vencido
- Por pagar sin vencimiento

**FC_Compras** (24)

- Compras netas con IVA
- Impuesto de compras
- Compras a terceros
- Compras al grupo
- % Compra al grupo
- Unidades compradas
- Líneas de compra
- Documentos de compra
- Proveedores con compra
- Compra promedio por documento
- Compra promedio por proveedor
- Compras mes anterior
- Compras año anterior
- Compras acumuladas mes
- Compras acumuladas año
- Compras acumuladas año anterior
- Variación compras vs mes anterior
- Variación compras vs año anterior
- Media móvil 3 meses compras
- Ranking de proveedor por compra
- % Compra en top 10 proveedores
- Compras 12 meses móviles
- Variación compras acumulada vs año anterior
- Precio de compra año anterior

**FC_Estado de carga** (3)

- Última extracción
- Dominios desactualizados
- Filas cargadas

**FC_Inventario** (6)

- Unidades en existencia
- Productos con existencia
- Bodegas con existencia
- Costo promedio ponderado
- Días de inventario
- Meses de inventario

**FC_Pagos efectuados** (9)

- Monto pagado
- Cantidad de pagos
- Proveedores pagados
- Pago promedio
- Pagos mes anterior
- Pagos acumulados año
- Pagos año anterior
- Pagos acumulados mes
- Variación de pagos vs año anterior

**FC_Pagos recibidos** (9)

- Cobros de tesorería
- Cantidad de cobros
- Clientes que pagaron
- Cobro promedio
- Cobros mes anterior
- Cobros acumulados año
- Cobros año anterior
- Cobros acumulados mes
- Variación de cobros vs año anterior

**FC_Pedidos** (10)

- Cantidad pedida
- Pedidos del período
- Cantidad pendiente
- Líneas abiertas
- Backlog vencido
- % Backlog vencido
- Ticket promedio de pedido
- Clientes con pedido
- Pedidos mes anterior
- Pedidos año anterior

**FC_Proyección de caja** (5)

- Salidas proyectadas
- Flujo neto proyectado
- Salidas vencidas (exigible)
- Salidas próximas 4 semanas
- Flujo neto próximas 4 semanas

**FC_Resultados contables** (12)

- Costo (contable)
- Partidas contables
- % Costo sobre ingreso
- Gasto promedio mensual
- Gasto mes anterior
- Gasto año anterior
- Gasto acumulado año
- Variación de gasto vs año anterior
- Ingresos acumulados año
- Resultado acumulado año
- Resultado mes anterior
- % Brecha contable

**FC_Venta diaria** (6)

- Venta media móvil 7d
- Venta media móvil 30d
- Días sin venta
- Clientes activos por día
- Días con venta
- Venta acumulada semana

**FC_Ventas** (32)

- Ventas netas con IVA
- Ventas brutas
- Devoluciones
- Impuesto facturado
- Descuento otorgado
- % Descuento
- Ventas al grupo
- % Venta al grupo
- Unidades vendidas
- Líneas de venta
- Documentos de venta
- Clientes con venta
- Productos vendidos
- Ticket promedio
- Precio promedio unidad
- Venta promedio por línea
- Venta promedio por cliente
- Costo de ventas
- Margen bruto
- % Margen
- Ventas año anterior
- Ventas acumuladas trimestre
- Ventas acumuladas año
- Variación vs mes anterior
- Variación vs año anterior
- Variación acumulada vs año anterior
- Ranking de producto por venta
- Líneas bajo costo
- % Ventas bajo costo
- Productos vendidos bajo costo
- Clientes con venta bajo costo
- Unidades año anterior
