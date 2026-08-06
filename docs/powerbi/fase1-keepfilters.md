# Fase 1 — KEEPFILTERS en filtros de dimensión

_Generado del diff de `consumo/powerbi/generar_pbip.py`._

## Qué se corrigió

Un predicado de columna dentro de `CALCULATE` se expande a `FILTER(ALL(columna), …)`: **reemplaza**
el filtro externo sobre esa columna en lugar de intersectarlo. El efecto práctico es que el
segmentador del usuario se ignora — poner el slicer de antigüedad en «61-90» y ver que
`Vencido 1 a 30` sigue devolviendo su tramo.

`KEEPFILTERS` cambia el reemplazo por intersección, que es lo que el usuario espera de un
segmentador.

**Los cambios se hicieron en el GENERADOR, no en el TMDL.** `generar_pbip.py` borra y reescribe
todos los `.tmdl` en cada corrida: una edición manual del modelo se pierde en la siguiente
regeneración.

## Excepción deliberada: intercompañía

Los predicados sobre `Cliente[es_intercompania]` y `Proveedor[es_intercompania]` **se dejaron
intactos** (decisión de Edwin). Una medida que declara su universo en el nombre — `Ventas a
terceros`, `Saldo por cobrar grupo` — conserva ese significado pase lo que pase en el
segmentador de intercompañía.

Esto no las vuelve sordas al resto de filtros: el predicado solo reemplaza el filtro de **esa
columna**, así que fecha, empresa, producto y vendedor siguen aplicando con normalidad. Se ve
bien en `Saldo vencido terceros`, que quedó mixta a propósito:

```dax
CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE), Cliente[es_intercompania] = FALSE)
```

## No tocadas: medidas con `FILTER` explícito

Diez medidas usan `FILTER(ALL(…))` a propósito para construir acumulados y ventanas (los tres
Pareto, `Venta acumulada semana`, `Posición proyectada acumulada`, las de horizonte de 4
semanas, `Ventas de clientes nuevos`). Ahí el predicado no vive dentro de `CALCULATE` y
envolverlo sería inválido. Tres de ellas se optimizan en la Fase 4.

## Hallazgo: un bug propio corregido de paso

`Proyección de cierre de mes` llevaba `Calendario[fecha] <= TODAY()` sin `KEEPFILTERS`. Con un
slicer de **rango de fechas** activo, ese predicado habría descartado el filtro del período y
contado los días hábiles desde 2020 — proyección disparatada. Con `KEEPFILTERS` intersecta y
cuenta solo los del mes en curso.

## Medidas modificadas (53)

### Ventas brutas

```dax
- CALCULATE([Ventas netas], 'Tipo de documento'[tipo_documento] = "factura")
+ CALCULATE([Ventas netas], KEEPFILTERS('Tipo de documento'[tipo_documento] = "factura"))
```

### Devoluciones

```dax
- ABS(CALCULATE([Ventas netas], 'Tipo de documento'[tipo_documento] = "nota_credito"))
+ ABS(CALCULATE([Ventas netas], KEEPFILTERS('Tipo de documento'[tipo_documento] = "nota_credito")))
```

### Clientes con venta

```dax
- CALCULATE(DISTINCTCOUNT(Ventas[cliente_clave]), Ventas[monto_sin_impuesto] <> 0)
+ CALCULATE(DISTINCTCOUNT(Ventas[cliente_clave]), KEEPFILTERS(Ventas[monto_sin_impuesto] <> 0))
```

### Ventas de servicios

```dax
- CALCULATE([Ventas netas], Producto[producto_codigo] = "SERVICIO")
+ CALCULATE([Ventas netas], KEEPFILTERS(Producto[producto_codigo] = "SERVICIO"))
```

### Proveedores con compra

```dax
- CALCULATE(DISTINCTCOUNT(Compras[proveedor_clave]), Compras[monto_sin_impuesto] <> 0)
+ CALCULATE(DISTINCTCOUNT(Compras[proveedor_clave]), KEEPFILTERS(Compras[monto_sin_impuesto] <> 0))
```

### Compras de servicios

```dax
- CALCULATE([Compras netas], Producto[producto_codigo] = "SERVICIO")
+ CALCULATE([Compras netas], KEEPFILTERS(Producto[producto_codigo] = "SERVICIO"))
```

### Saldo corriente

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[es_vencido] = FALSE)
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = FALSE))
```

### Saldo vencido

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[es_vencido] = TRUE)
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE))
```

### Saldo vencido terceros

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[es_vencido] = TRUE, Cliente[es_intercompania] = FALSE)
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE), Cliente[es_intercompania] = FALSE)
```

### Vencido 1 a 30

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "1-30")
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "1-30"))
```

### Vencido 31 a 60

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "31-60")
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "31-60"))
```

### Vencido 61 a 90

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "61-90")
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "61-90"))
```

### Vencido más de 90

```dax
- CALCULATE([Saldo por cobrar], 'Antigüedad'[rango_aging] = "+90")
+ CALCULATE([Saldo por cobrar], KEEPFILTERS('Antigüedad'[rango_aging] = "+90"))
```

### Por pagar vencido

```dax
- CALCULATE([Saldo por pagar], 'Antigüedad'[es_vencido] = TRUE)
+ CALCULATE([Saldo por pagar], KEEPFILTERS('Antigüedad'[es_vencido] = TRUE))
```

### Por pagar más de 90

```dax
- CALCULATE([Saldo por pagar], 'Antigüedad'[rango_aging] = "+90")
+ CALCULATE([Saldo por pagar], KEEPFILTERS('Antigüedad'[rango_aging] = "+90"))
```

### Clientes A

```dax
- CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "A")
+ CALCULATE(COUNTROWS('Clasificación ABC'), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "A"))
```

### Clientes B

```dax
- CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "B")
+ CALCULATE(COUNTROWS('Clasificación ABC'), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "B"))
```

### Clientes C

```dax
- CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "C")
+ CALCULATE(COUNTROWS('Clasificación ABC'), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "C"))
```

### Clientes sin venta neta

```dax
- CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[clase_abc_anio] = "S")
+ CALCULATE(COUNTROWS('Clasificación ABC'), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "S"))
```

### Clientes perdidos

```dax
- CALCULATE(COUNTROWS('Clasificación ABC'), 'Clasificación ABC'[perdido_en_anio] = TRUE)
+ CALCULATE(COUNTROWS('Clasificación ABC'), KEEPFILTERS('Clasificación ABC'[perdido_en_anio] = TRUE))
```

### % Venta en clientes A

```dax
- DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta_anio]), 'Clasificación ABC'[clase_abc_anio] = "A"), SUM('Clasificación ABC'[venta_anio]))
+ DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta_anio]), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "A")), SUM('Clasificación ABC'[venta_anio]))
```

### Venta promedio cliente A

```dax
- DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta_anio]), 'Clasificación ABC'[clase_abc_anio] = "A"), [Clientes A])
+ DIVIDE(CALCULATE(SUM('Clasificación ABC'[venta_anio]), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "A")), [Clientes A])
```

### Margen de clientes A

```dax
- CALCULATE(SUM('Clasificación ABC'[margen_anio]), 'Clasificación ABC'[clase_abc_anio] = "A")
+ CALCULATE(SUM('Clasificación ABC'[margen_anio]), KEEPFILTERS('Clasificación ABC'[clase_abc_anio] = "A"))
```

### Proveedores A

```dax
- CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "A")
+ CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc_anio] = "A"))
```

### Proveedores B

```dax
- CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "B")
+ CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc_anio] = "B"))
```

### Proveedores C

```dax
- CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "C")
+ CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc_anio] = "C"))
```

### Proveedores sin compra neta

```dax
- CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[clase_abc_anio] = "S")
+ CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc_anio] = "S"))
```

### Proveedores inactivos

```dax
- CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), 'Clasificación ABC Proveedor'[inactivo_en_anio] = TRUE)
+ CALCULATE(COUNTROWS('Clasificación ABC Proveedor'), KEEPFILTERS('Clasificación ABC Proveedor'[inactivo_en_anio] = TRUE))
```

### % Compra en proveedores A

```dax
- DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra_anio]), 'Clasificación ABC Proveedor'[clase_abc_anio] = "A"), SUM('Clasificación ABC Proveedor'[compra_anio]))
+ DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra_anio]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc_anio] = "A")), SUM('Clasificación ABC Proveedor'[compra_anio]))
```

### Compra promedio proveedor A

```dax
- DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra_anio]), 'Clasificación ABC Proveedor'[clase_abc_anio] = "A"), [Proveedores A])
+ DIVIDE(CALCULATE(SUM('Clasificación ABC Proveedor'[compra_anio]), KEEPFILTERS('Clasificación ABC Proveedor'[clase_abc_anio] = "A")), [Proveedores A])
```

### Clientes campeones

```dax
- CALCULATE(COUNTROWS('Clasificación RFM'), 'Clasificación RFM'[segmento_rfm] = "campeon")
+ CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "campeon"))
```

### Clientes leales

```dax
- CALCULATE(COUNTROWS('Clasificación RFM'), 'Clasificación RFM'[segmento_rfm] = "leal")
+ CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "leal"))
```

### Clientes en riesgo valiosos

```dax
- CALCULATE(COUNTROWS('Clasificación RFM'), 'Clasificación RFM'[segmento_rfm] = "en_riesgo_valioso")
+ CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "en_riesgo_valioso"))
```

### Clientes dormidos

```dax
- CALCULATE(COUNTROWS('Clasificación RFM'), 'Clasificación RFM'[segmento_rfm] = "dormido")
+ CALCULATE(COUNTROWS('Clasificación RFM'), KEEPFILTERS('Clasificación RFM'[segmento_rfm] = "dormido"))
```

### Clientes al día

```dax
- CALCULATE(COUNTROWS('Comportamiento de pago'), 'Comportamiento de pago'[perfil_riesgo] = "al_dia")
+ CALCULATE(COUNTROWS('Comportamiento de pago'), KEEPFILTERS('Comportamiento de pago'[perfil_riesgo] = "al_dia"))
```

### Clientes en vencido crítico

```dax
- CALCULATE(COUNTROWS('Comportamiento de pago'), 'Comportamiento de pago'[perfil_riesgo] = "vencido_critico")
+ CALCULATE(COUNTROWS('Comportamiento de pago'), KEEPFILTERS('Comportamiento de pago'[perfil_riesgo] = "vencido_critico"))
```

### Saldo en clientes críticos

```dax
- CALCULATE(SUM('Comportamiento de pago'[saldo_total]), 'Comportamiento de pago'[perfil_riesgo] = "vencido_critico")
+ CALCULATE(SUM('Comportamiento de pago'[saldo_total]), KEEPFILTERS('Comportamiento de pago'[perfil_riesgo] = "vencido_critico"))
```

### Días sin venta

```dax
- CALCULATE(COUNTROWS('Venta diaria'), 'Venta diaria'[es_dia_sin_venta] = TRUE)
+ CALCULATE(COUNTROWS('Venta diaria'), KEEPFILTERS('Venta diaria'[es_dia_sin_venta] = TRUE))
```

### Entradas proyectadas

```dax
- CALCULATE(SUM('Proyección de caja'[monto]), 'Proyección de caja'[flujo] = "entrada")
+ CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "entrada"))
```

### Salidas proyectadas

```dax
- CALCULATE(SUM('Proyección de caja'[monto]), 'Proyección de caja'[flujo] = "salida")
+ CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "salida"))
```

### Entradas vencidas (exigible)

```dax
- CALCULATE(SUM('Proyección de caja'[monto]), 'Proyección de caja'[flujo] = "entrada", 'Proyección de caja'[estado_vencimiento] = "vencido")
+ CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "entrada"), KEEPFILTERS('Proyección de caja'[estado_vencimiento] = "vencido"))
```

### Salidas vencidas (exigible)

```dax
- CALCULATE(SUM('Proyección de caja'[monto]), 'Proyección de caja'[flujo] = "salida", 'Proyección de caja'[estado_vencimiento] = "vencido")
+ CALCULATE(SUM('Proyección de caja'[monto]), KEEPFILTERS('Proyección de caja'[flujo] = "salida"), KEEPFILTERS('Proyección de caja'[estado_vencimiento] = "vencido"))
```

### Backlog

```dax
- CALCULATE(SUM(Pedidos[monto_abierto]), Pedidos[es_abierta] = TRUE)
+ CALCULATE(SUM(Pedidos[monto_abierto]), KEEPFILTERS(Pedidos[es_abierta] = TRUE))
```

### Cantidad pendiente

```dax
- CALCULATE(SUM(Pedidos[cantidad_abierta]), Pedidos[es_abierta] = TRUE)
+ CALCULATE(SUM(Pedidos[cantidad_abierta]), KEEPFILTERS(Pedidos[es_abierta] = TRUE))
```

### Líneas abiertas

```dax
- CALCULATE(COUNTROWS(Pedidos), Pedidos[es_abierta] = TRUE)
+ CALCULATE(COUNTROWS(Pedidos), KEEPFILTERS(Pedidos[es_abierta] = TRUE))
```

### Gasto operativo

```dax
- CALCULATE(SUM('Resultados contables'[monto_resultado]), 'Resultados contables'[naturaleza] = "gasto")
+ CALCULATE(SUM('Resultados contables'[monto_resultado]), KEEPFILTERS('Resultados contables'[naturaleza] = "gasto"))
```

### Costo (contable)

```dax
- CALCULATE(SUM('Resultados contables'[monto_resultado]), 'Resultados contables'[naturaleza] = "costo")
+ CALCULATE(SUM('Resultados contables'[monto_resultado]), KEEPFILTERS('Resultados contables'[naturaleza] = "costo"))
```

### Ingresos contables

```dax
- CALCULATE(SUM('Resultados contables'[monto_resultado]), 'Resultados contables'[naturaleza] = "ingreso")
+ CALCULATE(SUM('Resultados contables'[monto_resultado]), KEEPFILTERS('Resultados contables'[naturaleza] = "ingreso"))
```

### Cobros de clientes

```dax
- CALCULATE([Monto cobrado], 'Pagos recibidos'[contraparte] = "cliente")
+ CALCULATE([Monto cobrado], KEEPFILTERS('Pagos recibidos'[contraparte] = "cliente"))
```

### Cobros de tesorería

```dax
- CALCULATE([Monto cobrado], 'Pagos recibidos'[contraparte] = "cuenta_contable")
+ CALCULATE([Monto cobrado], KEEPFILTERS('Pagos recibidos'[contraparte] = "cuenta_contable"))
```

### Pagos a proveedores

```dax
- CALCULATE([Monto pagado], 'Pagos efectuados'[contraparte] = "proveedor")
+ CALCULATE([Monto pagado], KEEPFILTERS('Pagos efectuados'[contraparte] = "proveedor"))
```

### Productos con existencia

```dax
- CALCULATE(DISTINCTCOUNT(Inventario[producto_clave]), Inventario[cantidad] <> 0)
+ CALCULATE(DISTINCTCOUNT(Inventario[producto_clave]), KEEPFILTERS(Inventario[cantidad] <> 0))
```

### Bodegas con existencia

```dax
- CALCULATE(DISTINCTCOUNT(Inventario[almacen_clave]), Inventario[cantidad] <> 0)
+ CALCULATE(DISTINCTCOUNT(Inventario[almacen_clave]), KEEPFILTERS(Inventario[cantidad] <> 0))
```

