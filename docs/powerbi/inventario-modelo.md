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

- **Valor de inventario ocioso** — Dinero parado: productos que SÍ se vendieron alguna vez, tienen existencia, y llevan más de 90 días sin facturarse. Es la primera lista que debería recibir compras. Usa TREATAS porque la relación con Producto es unidireccional: el filtro de la ficha se aplica explícitamente y solo donde esta medida lo necesita, sin propagación global.
- **Productos ociosos** — Artículos con existencia que se vendieron alguna vez y llevan más de 90 días parados.
- **% Inventario ocioso** — Qué parte del valor en bodega está muerto y es accionable.
- **Valor sin rotación comercial** — Existencia de artículos que NUNCA se han facturado. En una comercializadora es alarma; en una productora es insumo normal (alimento, medicina, empaque) que se consume sin pasar por una factura. Se separa del ocioso justamente para no confundir las dos cosas.
- **Productos sin rotación comercial** — Artículos con existencia que NUNCA se facturaron. En una productora son insumos normales; en una comercializadora, alarma.

**02 Quiebre de stock**

- **Productos en quiebre** — Productos con demanda en los últimos 30 días y CERO existencia hoy: venta que se está perdiendo ahora mismo.
- **Venta anual en riesgo por quiebre** — Cuánto facturaron en 12 meses los productos que hoy están agotados. Dimensiona lo que está en juego mientras no se reponga.

**03 Cobertura**

- **Cobertura promedio en días** — Cuántos días de venta cubre la existencia al ritmo de los últimos 12 meses.
- **Productos sin existencia** — Artículos del catálogo sin nada en bodega hoy.

**04 Concentración**

- **Productos A** — Cuántos artículos hacen el 80% de la venta. Sobre estos se cuida el nivel de servicio; el resto puede esperar.
- **Productos B** — Artículos del tramo intermedio de la venta.
- **Productos C** — Cola larga del catálogo: poca venta y, con frecuencia, mucha bodega.
- **% Venta en productos A** — Concentración de la venta en los artículos clave.
- **Inventario en productos C** — Inventario inmovilizado en artículos de cola larga: lo que menos vende ocupando bodega.

### DM_Clasificación ABC (11)


**01 Conteos**

- **Clientes A** — Cuántos clientes concentran el 80% de la venta. En una cartera sana no son dos. Cuenta clientes DISTINTOS: la tabla tiene una fila por cliente y año, así que sin acotar el año un COUNTROWS contaría cliente-años.
- **Clientes B** — Clientes del tramo intermedio: entre el 80% y el 95% acumulado de la venta.
- **Clientes C** — Cola larga. Muchos nombres y poca venta; el costo de atenderlos es lo que hay que vigilar.
- **Clientes sin venta neta** — Clientes del catálogo sin venta en el año, o con solo devoluciones.
- **Clientes clasificados** — Clientes distintos en el catálogo ABC, excluida la intercompañía.
- **Clientes perdidos** — Clientes que facturaron algún año anterior y nada en el año seleccionado: la lista de llamadas pendientes.
- **Clientes estrenados en el año** — Clientes cuya PRIMERA factura cae en el año seleccionado.

**02 Concentración**

- **% Venta en clientes A** — Riesgo de concentración: si los A son el 90% de la venta, perder uno duele de verdad.
- **Venta del año clasificada** — Venta a terceros del año según el catálogo ABC. Sin filtrar un año en 'Año de clasificación' suma TODOS los años cargados.
- **Venta promedio cliente A** — Cuánto factura en promedio un cliente clave.
- **Margen de clientes A** — Margen que dejan los clientes que hacen el negocio. Que sean los que más venden no garantiza que sean los que más dejan.

### DM_Clasificación ABC Proveedor (10)


**01 Conteos**

- **Proveedores A** — Cuántos proveedores concentran el 80% de la compra: dependencia de suministro. Cuenta proveedores DISTINTOS, porque la tabla tiene una fila por proveedor y año.
- **Proveedores B** — Proveedores del tramo intermedio de la compra.
- **Proveedores C** — Cola larga de proveedores: muchos, con poco volumen cada uno.
- **Proveedores sin compra neta** — Proveedores del catálogo sin compra en el año.
- **Proveedores clasificados** — Proveedores distintos en el catálogo ABC, excluida la intercompañía.
- **Proveedores inactivos** — Proveedores a los que se compró algún año anterior y nada en el año seleccionado. No es una pérdida como la de un cliente, pero un abastecimiento que se apaga suele venir con una concentración que crece en otro lado.
- **Proveedores estrenados en el año** — Proveedores cuya PRIMERA compra cae en el año seleccionado.

**02 Concentración**

- **% Compra en proveedores A** — Riesgo de dependencia: si los A concentran el 90% de la compra, perder uno para la operación.
- **Compra del año clasificada** — Compra a terceros del año según el catálogo ABC. Sin filtrar un año en 'Año de clasificación' suma TODOS los años cargados.
- **Compra promedio proveedor A** — Volumen medio con un proveedor crítico.

### DM_Clasificación RFM (13)


**01 Conteos**

- **Clientes campeones** — Clientes recientes y frecuentes: el núcleo que sostiene la venta. Cuidarlos es más barato que reemplazarlos.
- **Clientes leales** — Compran seguido y hace poco, aunque no sean los de mayor monto. Son la base estable.
- **Clientes en riesgo** — Compraban y dejaron de venir. La lista de reactivación con mayor retorno por llamada.
- **Clientes en riesgo valiosos** — En riesgo Y de monto alto: si solo se va a llamar a alguien, que sea a estos.
- **Clientes dormidos** — Llevan mucho sin comprar y compraban poco. Reactivarlos rara vez paga el esfuerzo.

**02 Montos**

- **Venta 12m en riesgo** — Venta de 12 meses que está en manos de clientes en riesgo: lo que se pierde si nadie los llama.
- **Venta 12m clasificada** — Venta de los últimos 12 meses cubierta por el catálogo RFM.

**03 Rotación de cartera**

- **Clientes nuevos** — Clientes cuya PRIMERA compra cae dentro del período filtrado. Se quitan los filtros de Calendario y Ventas a propósito: sin eso la relación con Cliente ya habría recortado la tabla a quien compró en el período, y el conteo sería el de clientes activos, no el de nuevos.
- **Ventas de clientes nuevos** — Cuánto facturaron en el período los clientes que estrenaron relación en él. Mide si la captación trae volumen o solo nombres.
- **% Venta de clientes nuevos** — Qué parte de la facturación viene de relaciones estrenadas en el período.
- **Clientes activos 12m** — Clientes con al menos una compra en los últimos 12 meses según la recencia del RFM.
- **% Clientes activos** — Proporción de la cartera que compró en los últimos 12 meses. Es la medida de si el catálogo está vivo o es una lista histórica.
- **Antigüedad media del cliente** — Antigüedad media de la relación comercial. Una cartera joven crece; una muy vieja sin clientes nuevos se está apagando.

### DM_Comportamiento de pago (5)


**01 Conteos**

- **Clientes al día** — Clientes sin nada vencido. El objetivo de la gestión de cobranza.
- **Clientes en vencido crítico** — Más de 90 días vencido o más de la mitad del saldo vencido: revisar antes de despachar.
- **Clientes con saldo vencido** — Clientes con al menos una partida en mora.

**02 Montos**

- **Saldo en clientes críticos** — Dinero expuesto en los clientes de peor perfil de pago.
- **% cartera vencida (clientes)** — Del saldo total abierto, cuánto ya venció. El termómetro de la salud de la cartera.

### FC_Campos de usuario (2)


**01 Conteos**

- **Valores de usuario capturados** — Cuántos valores de campos de usuario hay capturados en el filtro vigente.
- **Campos de usuario distintos** — Cuántos campos de usuario del ERP tienen valores capturados en el filtro vigente.

### FC_Cartera cobrar histórico (7)


**01 Evolución**

- **Saldo histórico por cobrar** — Saldo por cobrar a la fecha de corte de la foto. Ya está en MONEDA DE PRESENTACIÓN pese al nombre de la columna (es incremental y no se renombró).
- **Vencido histórico por cobrar** — Mora en la fecha de corte de la foto. Es la serie que muestra si la cobranza mejora o se deteriora.
- **% Vencido histórico** — Proporción vencida en cada corte: la tendencia importa más que el valor de un día.

**02 Gestión**

- **Cartera al inicio del período** — Saldo en el PRIMER corte del período filtrado: el punto de partida contra el que se mide la gestión de cobranza.
- **Cartera al cierre del período** — Saldo en el ÚLTIMO corte del período filtrado.
- **Variación de cartera** — Cuánto creció o bajó la cartera en el período. Que suba mientras la venta no sube es la señal temprana de que se está cobrando peor.
- **Efectividad de cobranza** — Índice de efectividad de cobranza: del total cobrable del período (cartera inicial + lo facturado), qué porcentaje se cobró. 100% sería cobrar todo lo exigible; por debajo de 80% la cobranza va perdiendo terreno.

### FC_Cartera pagar histórico (3)


**01 Evolución**

- **Saldo histórico por pagar** — Saldo por pagar a la fecha de corte de la foto, en positivo. MONEDA DE PRESENTACIÓN.
- **Vencido histórico por pagar** — Deuda vencida en la fecha de corte de la foto.
- **Posición neta histórica** — Posición neta a lo largo del tiempo: la serie que muestra si la liquidez estructural mejora o se deteriora.

### FC_Cartera por cobrar (27)


**01 Saldo**

- **Saldo por cobrar** — Saldo del MAYOR CONTABLE, no del documento, en MONEDA DE PRESENTACIÓN (foto convertida a la tasa vigente).
- **Saldo por cobrar terceros** — Lo que deben los clientes reales. Sin separar el grupo, un aging estándar reporta una crisis de cartera que no existe.
- **Saldo por cobrar grupo** — Saldo entre empresas del propio grupo. Leerlo junto al de terceros hace parecer una crisis de cobranza que no existe.

**02 Conteos**

- **Partidas por cobrar** — Número de partidas abiertas en el mayor.
- **Clientes con saldo** — Clientes distintos con saldo pendiente.
- **Saldo promedio por cliente** — Exposición media por cliente con deuda.

**03 Antigüedad**

- **Saldo corriente** — Lo que aún no vence: es cobranza futura, no un problema.
- **Saldo vencido** — Lo que ya pasó su fecha de pago, grupo incluido.
- **Saldo vencido terceros** — La mora que de verdad hay que cobrar: vencida y fuera del grupo.
- **% Vencido** — Qué porción de la cartera está vencida. Mezcla el grupo; para gestión comercial usar la versión de terceros.
- **% Vencido terceros** — El indicador de salud de cobranza que sí se puede accionar.
- **Vencido 1 a 30** — Primer tramo de mora: normalmente es olvido o trámite, no riesgo.
- **Vencido 31 a 60** — Segundo tramo: aquí la gestión de cobranza tiene que estar activa.
- **Vencido 61 a 90** — Tercer tramo: la probabilidad de cobro empieza a caer de verdad.
- **Vencido más de 90** — Deuda vieja. Es la candidata natural a provisión y la que conviene mirar cliente por cliente.
- **% Crítico más de 90** — Riesgo alto: lo que pasó de 90 días pesa distinto en una provisión que lo que apenas venció.
- **Saldo sin vencimiento** — Partidas sin fecha de vencimiento pactada: no son ni corrientes ni vencidas, y suelen ser anticipos o ajustes sin depurar.

**04 Riesgo**

- **Días vencido promedio** — Días vencidos promedio ponderados por saldo: un promedio simple deja que una partida chica de 400 días arruine el indicador.
- **Días de cartera terceros** — Días de venta a terceros pendientes de cobro. Mezclar el saldo del grupo lo triplica.
- **Rotación de cartera** — Veces al año que se cobra la cartera completa. Es el recíproco de los días de cartera, más fácil de comparar entre empresas.

**05 Foto de hoy**

- **Por cobrar terceros hoy** — Foto de HOY: ignora el filtro de fechas de la página. El saldo es una foto, no un flujo — recortarlo al trimestre ocultaría las facturas viejas abiertas.
- **Por cobrar grupo hoy** — Saldo entre empresas del grupo, foto de hoy. No es riesgo de crédito: es conciliación pendiente.
- **Vencido terceros hoy** — Mora real a hoy, ignorando el filtro de fechas de la página.
- **% Vencido terceros hoy** — Salud de la cobranza a día de hoy, sin que el período seleccionado la maquille.

**06 Concentración**

- **Exposición mayor deudor** — Cuánto nos debe el cliente más expuesto. Si un solo deudor concentra la cartera, el riesgo no está diversificado.
- **% Exposición mayor deudor** — Cuánto pesa el cliente que más debe. Si un solo nombre concentra la cartera, el riesgo no está diversificado.
- **% Saldo en top 5 deudores** — Concentración de la deuda en los cinco mayores.

### FC_Cartera por pagar (17)


**01 Saldo**

- **Saldo por pagar** — En positivo para poder compararlo con la cartera por cobrar sin invertir signos en cada visual. MONEDA DE PRESENTACIÓN.
- **Saldo por pagar terceros** — Lo que se debe a proveedores reales.
- **Saldo por pagar grupo** — Deuda con empresas del propio grupo: se netea al consolidar.
- **Posición neta** — Lo que se cobra menos lo que se debe: la liquidez estructural del negocio.

**02 Conteos**

- **Partidas por pagar** — Número de partidas abiertas de deuda.
- **Proveedores con saldo** — Proveedores distintos a los que se les debe.
- **Proveedores con saldo vencido** — A cuántos proveedores se les debe algo ya vencido.

**03 Antigüedad**

- **Por pagar vencido** — Deuda que ya pasó su fecha de pago. Sostenida en el tiempo es señal de tensión de caja, no de buena negociación.
- **% Por pagar vencido** — Qué parte de lo que se debe ya está vencido.
- **Por pagar más de 90** — Deuda vieja con proveedores; suele venir con suministro en riesgo.
- **Por pagar sin vencimiento** — Partidas sin fecha de pago pactada: normalmente anticipos o ajustes sin depurar.
- **% Deuda en el mayor acreedor** — Concentración de la deuda: cuánto pesa el acreedor más grande sobre el total por pagar.

**04 Foto de hoy**

- **Por pagar hoy** — Foto de HOY: ignora el filtro de fechas de la página (el saldo es una foto, no un flujo).
- **Posición neta hoy** — Cobrar menos deber, foto de hoy, sin el filtro de período.

**05 Ciclo de efectivo**

- **Días de pago terceros** — DPO: días que tardamos en pagar a proveedores. Misma convención que 'Días de cartera terceros' para que el ciclo de efectivo cuadre.
- **Rotación de cuentas por pagar** — Veces al año que se paga la deuda completa. Es el recíproco de los días de pago.
- **Ciclo de conversión de efectivo** — CICLO DE CONVERSIÓN DE EFECTIVO: días que el dinero pasa atrapado en el negocio antes de volver a caja. Cobrar + inventario − pagar. Bajarlo libera capital de trabajo sin pedir un préstamo; es la métrica de liquidez que más mueve la aguja en una PyME. Negativo significa que los proveedores financian la operación.

### FC_Compras (34)


**01 Importes**

- **Compras netas** — Compra sin impuestos en MONEDA DE PRESENTACIÓN (consolidable entre sociedades).
- **Compras netas con IVA** — Compra con impuesto incluido, desde la cabecera del documento por la misma razón que en ventas.
- **Impuesto de compras** — IVA soportado en las compras, en moneda local.
- **Saldo de facturas de compra** — Saldo pendiente de pago de las facturas de compra, prorrateado por línea. INFORMATIVO: la cartera oficial sale del mayor.
- **Compras de servicios** — Compra de líneas sin artículo (servicios, fletes, gastos) — en Cresta son el 60% de las líneas.

**02 Terceros vs grupo**

- **Compras a terceros** — Compra a proveedores reales, sin el movimiento entre empresas del grupo.
- **Compras al grupo** — Compra a otras empresas del propio grupo: traslado interno, no abastecimiento.
- **% Compra al grupo** — Qué parte del abastecimiento es interno.

**03 Conteos**

- **Unidades compradas** — Cantidad neta recibida; la nota de crédito a proveedor resta.
- **Líneas de compra** — Número de líneas de documento de compra.
- **Documentos de compra** — Facturas y notas de crédito de compra distintas del período.
- **Proveedores con compra** — Proveedores distintos con movimiento en el período.

**04 Promedios**

- **Compra promedio por documento** — Tamaño medio de la factura de compra.
- **Compra promedio por proveedor** — Cuánto se le compra en promedio a cada proveedor activo.
- **Compra promedio diaria** — Promedio sobre los días que SÍ hubo compra.

**05 Comparativos**

- **Compras mes anterior** — Compra del mes previo, para ver si el abastecimiento se aceleró.
- **Compras año anterior** — Mismo período del año pasado, libre de estacionalidad.
- **Compras acumuladas mes** — Acumulado desde el primer día del mes.
- **Compras acumuladas año** — Acumulado del ejercicio.
- **Compras acumuladas año anterior** — Acumulado del ejercicio anterior a la misma altura del año.
- **Variación compras vs mes anterior** — Cambio contra el mes previo.
- **Variación compras vs año anterior** — Cambio contra el mismo período del año pasado.
- **Media móvil 3 meses compras** — Suaviza el ruido mensual del abastecimiento. Promedia MESES, no días.
- **Compras acumuladas trimestre** — Faltaba el espejo del acumulado trimestral de ventas.
- **Compras 12 meses móviles** — Compra de los últimos doce meses. Es la base de la rotación de inventario y de los días de pago.
- **Variación compras acumulada vs año anterior** — Cómo va el abastecimiento del ejercicio completo contra el anterior.

**06 Pareto**

- **Ranking de proveedor por compra** — Posición del proveedor por compra dentro del filtro vigente.
- **% acumulado de compra proveedores** — Curva de Pareto: % de la compra a terceros que acumulan este proveedor y los mayores que él.
- **% Compra en el mayor proveedor** — Dependencia del proveedor más grande. Un número alto es riesgo de suministro y cero poder de negociación.
- **% Compra en top 10 proveedores** — Concentración del abastecimiento en los diez mayores proveedores.

**07 Inflación de insumos**

- **Precio promedio de compra** — Precio unitario promedio pagado. Filtrar un producto para que signifique algo: mezclado entre artículos distintos no dice nada.
- **Precio de compra año anterior** — Precio unitario medio pagado el año pasado, base de la comparación de inflación de insumos.
- **% Variación de precio de compra** — Cuánto subió lo que compramos. Es la inflación REAL del negocio, medida sobre lo pagado, no sobre un índice.
- **Sobrecosto por precio de compra** — Lo que costó de más comprar el volumen de hoy a los precios de hoy en vez de a los del año pasado.

### FC_Estado de carga (5)


**01 Frescura**

- **Días desde última extracción** — Días desde la última extracción del dominio más rezagado. Es el aviso de que el tablero está viejo antes de que alguien tome una decisión con él.
- **Última extracción** — Momento en que corrió por última vez la extracción del dominio más rezagado.
- **Último dato del ERP** — Fecha del dato más reciente que hay en el ERP. Es un reloj distinto al de la extracción: el pipeline puede estar sano y la operación detenida.
- **Dominios desactualizados** — Cuántos dominios llevan más de tres días sin extraerse. Distinto de cero significa que hay tableros mostrando datos viejos.

**02 Volumen**

- **Filas cargadas** — Volumen de filas en el origen, para dimensionar cada dominio.

### FC_Inventario (9)


**01 Importes**

- **Valor de inventario** — Valor del inventario a la fecha de corte en MONEDA DE PRESENTACIÓN (SAP: OnHand × costo promedio; Odoo: capas de valoración).

**02 Conteos**

- **Unidades en existencia** — Cantidad física en bodega a la fecha de corte.
- **Productos con existencia** — Artículos distintos con saldo en bodega.
- **Bodegas con existencia** — Almacenes con movimiento vivo.

**03 Promedios**

- **Costo promedio ponderado** — Costo unitario medio de lo que hay en bodega.

**04 Rotación**

- **Rotación de inventario 12M** — Veces que el inventario rota al año: costo de ventas de los últimos 12 meses sobre el valor actual.
- **Días de inventario** — Cuántos días tarda en consumirse la existencia actual. Es una de las tres patas del ciclo de conversión de efectivo.
- **Meses de inventario** — Los días de inventario en la unidad con la que suele razonar compras.
- **Inventario sobre ventas** — Cuánto capital hay inmovilizado en bodega por cada quetzal de venta del período. Sube cuando se compra más rápido de lo que se vende.

### FC_Pagos efectuados (12)


**01 Importes**

- **Monto pagado** — Salidas de caja del período, cualquiera sea la contraparte.
- **Pagos a proveedores** — Solo pagos a PROVEEDORES (excluye operaciones de tesorería contra cuenta contable).
- **Flujo neto de caja** — Lo cobrado menos lo pagado en el período filtrado: el pulso de caja operativo.

**02 Conteos**

- **Cantidad de pagos** — Número de documentos de pago emitidos.
- **Proveedores pagados** — Proveedores distintos a los que se les pagó.

**03 Promedios**

- **Pago promedio** — Importe medio por documento de pago.

**04 Comparativos**

- **Pagos mes anterior** — Salidas del mes previo.
- **Pagos acumulados año** — Salidas acumuladas del ejercicio.
- **Pagos año anterior** — Salidas del mismo período del año pasado.
- **Pagos acumulados mes** — Salidas acumuladas desde el primer día del mes.
- **Variación de pagos vs año anterior** — Cambio en las salidas contra el año pasado.
- **Flujo neto acumulado año** — Caja neta acumulada del año: lo cobrado menos lo pagado desde el 1 de enero.

### FC_Pagos recibidos (13)


**01 Importes**

- **Monto cobrado** — Flujo de cobros del período en MONEDA DE PRESENTACIÓN. INFORMATIVO para caja: el saldo de cartera sale del mayor.
- **Cobros de clientes** — Solo cobranza de CLIENTES. En Cresta el 67% del monto de ORCT son operaciones de tesorería contra cuenta contable — sin este filtro la cobranza se triplica.
- **Cobros de tesorería** — Movimientos contra cuenta contable —depósitos y traslados—, no cobranza de clientes. En SAP viven en la misma tabla que los cobros y sin separarlos la cobranza se triplica.
- **% Cobrado vs facturado** — Cobranza de clientes contra la venta con IVA del mismo período: el pulso de la recuperación.

**02 Conteos**

- **Cantidad de cobros** — Número de documentos de cobro recibidos.
- **Clientes que pagaron** — Clientes distintos que hicieron algún pago en el período.

**03 Promedios**

- **Cobro promedio** — Importe medio por documento de cobro.

**04 Comparativos**

- **Cobros mes anterior** — Cobranza del mes previo.
- **Cobros acumulados año** — Cobranza acumulada del ejercicio.
- **Cobros año anterior** — Cobranza del mismo período del año pasado.
- **Cobros acumulados mes** — Cobranza acumulada desde el primer día del mes.
- **Variación de cobros vs año anterior** — Cambio en la cobranza contra el año pasado.

**05 Mix de cobro**

- **% Cobro en el medio principal** — Reparto del cobro por instrumento. Un salto del efectivo o una caída de la transferencia cambia el riesgo operativo y el costo bancario.

### FC_Pedidos (17)


**01 Pedido**

- **Monto pedido** — Base SIN impuesto de lo pedido en el período. El COMPROMISO, no el resultado (eso es Ventas).
- **Cantidad pedida** — Unidades comprometidas en los pedidos del período.
- **Pedidos del período** — Número de pedidos distintos captados.
- **Clientes con pedido** — Clientes distintos que colocaron pedido en el período.

**02 Backlog**

- **Backlog** — Pedido y AÚN no cumplido (líneas abiertas): lo que la operación debe entregar/facturar.
- **Cantidad pendiente** — Unidades que faltan por entregar.
- **Líneas abiertas** — Líneas de pedido con saldo por despachar.
- **Fill rate** — De lo pedido, cuánto ya se cumplió (1 − backlog/pedido). El pulso de la operación.
- **Backlog en días de venta** — Backlog traducido a días de venta: cuánto tiempo de operación hay ya comprometido.

**03 Cumplimiento**

- **Líneas de pedido vencidas** — Líneas abiertas cuya fecha de entrega prometida YA PASÓ. Es incumplimiento en curso: el cliente lo está viviendo hoy.
- **Backlog vencido** — Compromiso cuya fecha de entrega prometida ya pasó. El cliente lo está viviendo hoy.
- **% Backlog vencido** — Qué parte del compromiso pendiente ya está en incumplimiento.
- **Lead time prometido** — Días que se promete al cliente entre el pedido y la entrega. Si sube, la promesa comercial se está estirando.

**04 Promedios**

- **Ticket promedio de pedido** — Tamaño medio del pedido captado.

**05 Comparativos**

- **Pedidos mes anterior** — Captación del mes previo.
- **Pedidos año anterior** — Captación del mismo período del año pasado.
- **Pedido sobre facturado** — Pedido contra facturación del mismo período: mide si la demanda captada se está convirtiendo en venta o se está represando.

### FC_Proyección de caja (9)


**01 Proyección**

- **Entradas proyectadas** — Proyección CONTRACTUAL: si cada partida abierta se paga en su vencimiento. No es un pronóstico.
- **Salidas proyectadas** — Pagos comprometidos por semana de vencimiento.
- **Flujo neto proyectado** — Entradas menos salidas de la semana. Negativo sostenido es un problema de caja antes de ser un problema contable.

**02 Vencido**

- **Entradas vencidas (exigible)** — Ya venció y sigue abierto: en teoría es cobrable HOY. La brecha con lo programado mide la gestión de cobro.
- **Salidas vencidas (exigible)** — Pagos cuya fecha ya pasó: exigibles ahora mismo.

**03 Acumulado**

- **Posición proyectada acumulada** — Flujo acumulado semana a semana: la curva que muestra en qué semana la caja se pone negativa si nada cambia. Es la pregunta que hace un gerente el lunes por la mañana.
- **Entradas próximas 4 semanas** — Horizonte corto: lo que entra y sale en las próximas 4 semanas, sin contar lo ya vencido.
- **Salidas próximas 4 semanas** — Compromisos de pago del horizonte corto.
- **Flujo neto próximas 4 semanas** — Lo que queda en caja del mes si todo se cumple como está pactado.

### FC_Resultados contables (19)


**01 P&L**

- **Gasto operativo** — Gasto operativo del MAYOR (cuentas de gasto), con jerarquía de cuenta y centro de costo.
- **Costo (contable)** — Costo del período según el mayor. Es la cifra contable, no el costo de línea de la factura.
- **Ingresos contables** — Ingresos según el LIBRO MAYOR. Cuadra al centavo con Ventas Netas cuando todo ingreso pasa por factura.
- **Resultado contable** — Ingresos − costos − gastos, todo desde el mayor: el resultado operativo contable.
- **Partidas contables** — Número de partidas del mayor en el filtro vigente.

**02 Estructura**

- **% Margen operativo** — Margen operativo real, el del mayor contable — no el margen de línea de factura. Es el número que mira un banco.
- **% Gasto sobre ingreso** — Cuánto del ingreso se come la estructura. Subir la venta con este porcentaje subiendo no mejora nada.
- **% Costo sobre ingreso** — Qué parte del ingreso se va en costo directo.
- **% Gasto en el mayor rubro** — Peso del rubro de gasto más grande dentro del total. Filtrar por nivel de la jerarquía contable para leerlo.
- **Gasto promedio mensual** — Estructura media mensual: el piso que hay que cubrir cada mes.

**03 Comparativos**

- **Gasto mes anterior** — Gasto del mes previo.
- **Gasto año anterior** — Gasto del mismo período del año pasado.
- **Gasto acumulado año** — Gasto acumulado del ejercicio.
- **Variación de gasto vs año anterior** — Cómo crece la estructura. Que crezca más rápido que el ingreso es la señal más temprana de deterioro.
- **Ingresos acumulados año** — Ingreso contable acumulado del ejercicio.
- **Resultado acumulado año** — Resultado del ejercicio a la fecha, antes de ajustes de cierre.
- **Resultado mes anterior** — Resultado del mes previo.

**04 Control**

- **Brecha contable vs facturado** — Diferencia entre lo que dice contabilidad y lo que dice facturación. Debería ser cerca de cero; si no, hay anticipos, ajustes o cuentas de ingreso mal clasificadas. Es un control, no un KPI: cuando se despega, hay que ir a buscar por qué.
- **% Brecha contable** — La brecha contra facturación en porcentaje. Debería rondar cero; cuando se despega hay que buscar anticipos, ajustes o cuentas mal clasificadas.

### FC_Tipo de cambio (2)


**01 Tasa**

- **Tipo de cambio promedio** — Tasa promedio del período filtrado (moneda local por 1 unidad). Filtrar una moneda para leerla.
- **Tipo de cambio de cierre** — La tasa del último día con registro dentro del filtro.

### FC_Venta diaria (11)


**01 Serie**

- **Venta diaria neta** — Serie continua (un día sin ventas es un CERO, no un hueco): la única base correcta para tendencias.
- **Venta media móvil 7d** — Suaviza el efecto del día de semana. Útil para ver la tendencia corta sin el ruido del fin de semana.
- **Venta media móvil 30d** — Tendencia de fondo, ya sin efecto semanal ni de quincena.
- **Venta promedio día operado** — Promedio solo de los días que SÍ se vendió (excluye ceros): el ritmo real de un día operado.

**02 Actividad**

- **Días sin venta** — Días del período sin ninguna facturación. Un pico aquí suele ser paro, feriado o problema de captura.
- **Clientes activos por día** — Cuántos clientes distintos compran en un día operado promedio.
- **Días con venta** — Días del período con facturación real.

**03 Ritmo**

- **Venta por día hábil** — Ritmo real: dividir entre días NATURALES castiga a los meses con muchos feriados y hace parecer que la operación cayó cuando solo hubo menos días de trabajo.
- **Proyección de cierre de mes** — Dónde va a cerrar el mes si se mantiene el ritmo de los días hábiles ya trabajados. Solo tiene sentido con UN mes filtrado, y solo mientras el mes está en curso.
- **Índice de estacionalidad** — Cuánto se despega el período del promedio mensual de su propio año. 1.0 es un mes normal; 1.3 es un pico estacional.
- **Venta acumulada semana** — Acumulado dentro de la semana ISO en curso.

### FC_Ventas (54)


**01 Importes**

- **Ventas netas** — Base de todo: venta sin impuestos en MONEDA DE PRESENTACIÓN (consolidable entre sociedades), con la nota de crédito ya en negativo. Una sociedad sin tasa válida no suma aquí (regla: sin tipo de cambio, no se consolida).
- **Ventas netas con IVA** — Lo que el cliente realmente paga. Sale de la CABECERA del documento y no de la suma de líneas: el IVA se calcula por documento y sumarlo línea a línea desvía centavos contra el ERP.
- **Ventas brutas** — Facturación del período antes de restar devoluciones.
- **Devoluciones** — Notas de crédito del período, en positivo para poder compararlas contra la venta.
- **Impuesto facturado** — IVA de las ventas. Se queda en moneda LOCAL aunque el resto del modelo esté en moneda de presentación: es un concepto fiscal del país de cada sociedad.
- **Descuento otorgado** — Descuento concedido, tomado de lo realmente grabado en cada línea y no de una lista de precios teórica.
- **% Descuento** — Cuánto del precio se está cediendo. Que suba sin que suba el volumen es erosión de precio, no una promoción que funciona.
- **Saldo de facturas** — Saldo pendiente de las facturas visibles, prorrateado por línea (suma = saldo del documento). INFORMATIVO: la cartera oficial sale del mayor.
- **Ventas de servicios** — Venta de líneas sin artículo (servicios, fletes, gastos) — el miembro SERVICIO de Producto.

**02 Terceros vs grupo**

- **Ventas a terceros** — El mercado real. La venta al grupo no compite por precio: mezclarla distorsiona todo indicador comercial.
- **Ventas al grupo** — Facturación a otras empresas del propio grupo. Ni compite por precio ni la trabaja un vendedor.
- **% Venta al grupo** — Qué parte de la facturación es movimiento interno. En Grupo Cresta pesa lo suficiente como para cambiar la lectura de cualquier ranking comercial.

**03 Conteos**

- **Unidades vendidas** — Cantidad neta despachada; la nota de crédito resta.
- **Líneas de venta** — Número de líneas de documento — el grano del hecho.
- **Documentos de venta** — Facturas y notas de crédito distintas emitidas en el período.
- **Clientes con venta** — Clientes distintos con movimiento neto en el período.
- **Productos vendidos** — Artículos distintos con movimiento: la parte del catálogo que de verdad rota.

**04 Promedios**

- **Ticket promedio** — Venta media por documento. Subirlo suele costar menos que conseguir un cliente nuevo.
- **Precio promedio unidad** — Precio medio realmente cobrado. Solo significa algo con UN producto filtrado: mezclado entre artículos distintos no dice nada.
- **Venta promedio por línea** — Tamaño medio de la línea de documento.
- **Venta promedio diaria** — Promedio sobre los días que SÍ hubo venta: no diluye con domingos y feriados.
- **Venta promedio por cliente** — Facturación media por cliente activo en el período.
- **Productos por cliente** — Amplitud de catálogo: cuántos productos distintos se le venden al cliente promedio. Subirla es la venta cruzada.

**05 Rentabilidad**

- **Costo de ventas** — Costo registrado en la línea al momento de facturar. Solo existe en SAP B1; en Odoo la línea no lo trae y la medida sale en cero.
- **Margen bruto** — Venta neta menos costo, calculado línea a línea. Cero en Odoo por la misma razón que el costo.
- **% Margen** — Rentabilidad sobre la venta, grupo incluido. Para el margen del mercado real usar '% Margen terceros'.
- **% Margen terceros** — El margen de mercado. Incluir la venta al grupo, que no compite por precio, infla el indicador.

**06 Comparativos**

- **Ventas mes anterior** — Mismo período del mes anterior (respeta el filtro de fechas del visual).
- **Ventas año anterior** — El mismo período del año pasado. En un negocio con temporada dice más que la comparación contra el mes anterior.
- **Ventas acumuladas mes** — Acumulado del mes en curso hasta el último día con datos del filtro.
- **Ventas acumuladas trimestre** — Acumulado desde el inicio del trimestre hasta la fecha del contexto.
- **Ventas acumuladas año** — Acumulado desde el 1 de enero: la cifra con la que se mide el ejercicio.
- **Ventas acumuladas año anterior** — El acumulado del año PASADO al mismo corte: el comparable correcto del YTD.
- **Variación vs mes anterior** — Crecimiento contra el mes previo. Cuidado con la estacionalidad: un mes flojo puede ser normal para la época.
- **Variación vs año anterior** — Crecimiento contra el mismo período del año pasado, ya libre del efecto estacional.
- **Variación acumulada vs año anterior** — Cómo va el ejercicio completo contra el anterior. Es la que se lleva a una junta.
- **Media móvil 3 meses** — Promedio MENSUAL de los últimos 3 meses: alisa el diente de sierra de la facturación. (Iterar días con DATESINPERIOD daba un promedio diario disfrazado de mensual.)
- **Ventas 12 meses móviles** — Año móvil: los últimos 12 meses completos desde el corte. Quita la estacionalidad del calendario.

**07 Pareto**

- **Ranking de cliente por venta** — Posición del cliente ordenado por venta a terceros, dentro del filtro vigente.
- **% acumulado de venta clientes** — Curva de Pareto: % de la venta a terceros que acumulan este cliente y los mayores que él. La venta por cliente se materializa UNA vez en `base`: la versión anterior reevaluaba la medida dentro del FILTER, una vez por cliente y por cliente, lo que es cuadrático y se nota con miles de clientes.
- **Ranking de producto por venta** — Posición del producto por venta neta dentro del filtro vigente.
- **% acumulado de venta productos** — Curva de Pareto de productos sobre la venta neta. Misma materialización en `base` que la curva de clientes.
- **% Venta en top 10 clientes** — Peso de los 10 mayores clientes: la medida de riesgo comercial. Si perder un cliente hunde el año, se sabe aquí.

**08 Fugas de margen**

- **Ventas bajo costo** — Venta facturada por DEBAJO del costo registrado en la línea. Es fuga de margen pura, no una promoción: nadie la autorizó.
- **Líneas bajo costo** — Cuántas líneas se facturaron por debajo del costo registrado.
- **Margen perdido bajo costo** — Cuánto margen se dejó en la mesa, en positivo para poder sumarlo y priorizarlo.
- **% Ventas bajo costo** — Qué porción de la venta se hizo perdiendo margen. Cualquier cifra de dos dígitos aquí merece una revisión de política de precios.
- **Productos vendidos bajo costo** — Artículos distintos que se vendieron perdiendo margen: la lista corta por donde empezar.
- **Clientes con venta bajo costo** — Clientes a los que se les facturó por debajo del costo. Suele concentrarse en pocos y negociados.

**09 Precio y volumen**

- **Precio promedio año anterior** — Precio promedio del mismo período del año pasado, base del desglose precio/volumen.
- **Unidades año anterior** — Volumen del mismo período del año pasado, base del desglose precio/volumen.
- **Efecto precio** — Cuánto de la variación anual viene de haber vendido MÁS CARO: diferencia de precio aplicada al volumen actual.
- **Efecto volumen** — Cuánto viene de haber vendido MÁS UNIDADES: diferencia de volumen valorada al precio del año pasado.
- **Efecto mezcla** — El resto: cambio en la MEZCLA de productos y clientes. Los tres efectos suman exactamente la variación anual.

## Medidas sin descripción

Ninguna: las 294 medidas están documentadas.
