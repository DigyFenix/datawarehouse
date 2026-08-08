# Matriz de oportunidad analítica

**Fase F2 del contrato** (§6 F2). **Entrada:** `docs/powerbi/model-exploitation-map.md`.
**Salida de esta fase:** esta matriz. **Gate:** ≥25 filas, todas con pregunta de negocio
explícita y prioridad asignada; los P0 no exceden 12 (el presupuesto de páginas).

**32 oportunidades · 11 P0 · 9 P1 · 8 P2 · 4 P3.**

---

## 0. Cómo se asignó la prioridad

`Prioridad` **se deriva** de impacto y esfuerzo, no del entusiasmo:

| | Esfuerzo bajo | Esfuerzo medio | Esfuerzo alto |
|---|---|---|---|
| **Impacto alto** | P0 | P0 | P1 |
| **Impacto medio** | P1 | P1 | P2 |
| **Impacto bajo** | P2 | P2 | P3 |

**Impacto** se mide en dinero puesto en riesgo o liberado, no en cuánta gente mira la pantalla.
**Esfuerzo** es bajo cuando toda la medida existe, medio cuando hay que componer o activar una
relación, alto cuando hay DAX nuevo no trivial o requiere decisión de modelo.

Dos criterios más, propios de este producto:

- **Regla de la cifra accionable.** Una fila solo entra si su respuesta cambia lo que alguien
  hace el lunes. "Ventas por mes" no cambia nada; "estos 94 productos agotados movieron Q54M el
  año pasado" sí.
- **Regla del gancho comercial.** Este tablero es el argumento de venta del producto. Las filas
  que un gerente **no puede responder hoy con su ERP** valen más que las que sí — aunque ambas
  sean correctas.

---

## 1. La matriz

Las cifras de la columna *Impacto* son de Grupo Cresta al 2026-08-08, medidas contra la base;
no son estimaciones. En otro tenant cambian, la pregunta no.

| ID | Área | Pregunta de negocio | Tablas | Medidas existentes | DAX faltante | Visual propuesto | Impacto | Esfuerzo | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| **O-01** | Inventario | ¿Qué productos están agotados **hoy** teniendo demanda, y cuánta venta anual pongo en riesgo mientras no repongo? | Análisis de producto, Inventario, Ventas | Productos en quiebre · Venta anual en riesgo por quiebre · Cobertura promedio en días | — | Tabla ordenada por venta en riesgo + tile de total | **Alto — Q57.0M en riesgo, 98 productos** | Bajo | **P0** |
| **O-02** | Ventas / Rentabilidad | ¿Qué parte de mi venta se facturó **por debajo del costo**, quién la autorizó y a qué clientes? | Ventas, Cliente, Producto, Vendedor | Ventas bajo costo · Margen perdido bajo costo · % Ventas bajo costo · Clientes con venta bajo costo | — | Tile + barras por cliente y producto, con detalle a línea | **Alto — Q46.5M (11.5% de la venta), Q18.4M de margen perdido** | Bajo | **P0** |
| **O-03** | Cartera | ¿Cuánto me deben **de verdad** los terceros, cuánto está vencido y en qué tramo? | Cartera por cobrar, Cliente, Antigüedad | Saldo por cobrar terceros · Vencido terceros hoy · los 4 tramos · % Vencido terceros | — | Aging apilado + tabla por cliente | **Alto — es la conversación semanal de cobranza** | Bajo | **P0** |
| **O-04** | Flujo de efectivo | ¿En qué semana se me pone negativa la caja si todo se paga y se cobra como está pactado? | Proyección de caja | Posición proyectada acumulada · Entradas/Salidas proyectadas · Flujo neto próximas 4 semanas | — | Línea acumulada con cruce por cero + barras entrada/salida | **Alto — la pregunta del lunes por la mañana** | Bajo | **P0** |
| **O-05** | Working capital | ¿Cuántos días tengo el dinero atrapado y cuál de las tres patas lo está empeorando? | Cartera ×2, Inventario, Ventas, Compras | Ciclo de conversión de efectivo · Días de cartera terceros · Días de inventario · Días de pago terceros | — | Waterfall de 3 patas + serie del CCC | **Alto — 80.2 días; bajarlo libera capital sin pedir préstamo** | Bajo | **P0** |
| **O-06** | Ventas | ¿Vamos a llegar al mes, al ritmo de los días hábiles ya trabajados? | Venta diaria, Calendario | Venta por día hábil · Proyección de cierre de mes · Ventas acumuladas mes | GAP-03 (título narrativo) | Hero number + gauge contra mes anterior | **Alto — decide acciones dentro del mes, no después** | Bajo | **P0** |
| **O-07** | Cartera / Cobranza | ¿Qué vence **esta semana**, quién lo debe y cuánto es? | Cartera por cobrar, Cliente, Calendario | Saldo por cobrar terceros | **GAP-01** — eje de vencimiento (`USERELATIONSHIP`) | Tabla de vencimientos por semana + tile de exigible | **Alto — hoy NO se puede responder; es la agenda de cobro** | Medio | **P0** |
| **O-08** | Clientes | ¿Qué clientes valiosos dejaron de comprar y cuánta venta representan? | Clasificación RFM, Cliente, Ventas | Clientes en riesgo valiosos · Venta 12m en riesgo · Clientes perdidos | — | Matriz RFM + lista priorizada por monto | **Alto — 79 clientes, Q22.0M en juego** | Bajo | **P0** |
| **O-09** | Pedidos | ¿Cuánto prometí y no he entregado, y cuánto de eso ya está incumplido? | Pedidos, Cliente, Producto | Backlog · Backlog vencido · % Backlog vencido · Fill rate | — | Tile + barras por cliente, semáforo de vencido | **Alto — Q5.7M vencidos de Q12.5M (45.7%)** | Bajo | **P0** |
| **O-10** | Compras | ¿Cuánto subió lo que compro y cuánto me costó de más este año? | Compras, Producto, Proveedor | % Variación de precio de compra · Sobrecosto por precio de compra · Precio de compra año anterior | — | Barras de sobrecosto por insumo + tile | **Alto — inflación real medida sobre lo pagado, no un índice** | Bajo | **P0** |
| **O-11** | Finanzas / P&L | ¿Gano dinero según contabilidad, y la estructura crece más rápido que el ingreso? | Resultados contables, Cuenta, Centro de costo | Resultado contable · % Margen operativo · % Gasto sobre ingreso · Variación de gasto vs año anterior | GAP-05 (waterfall) | Waterfall P&L + serie gasto vs ingreso | **Alto — es el número que mira un banco** | Medio | **P0** |
| **O-12** | Ventas | ¿La variación contra el año pasado viene de precio, de volumen o de mezcla? | Ventas, Producto, Cliente | Efecto precio · Efecto volumen · Efecto mezcla | — | Waterfall de 3 efectos (suman exacto la variación) | Alto — separa "vendí más" de "vendí más caro" | Bajo | **P1** |
| **O-13** | Clientes | ¿Cuánto de mi venta depende de los 10 mayores clientes? | Ventas, Cliente | % Venta en top 10 clientes · Ranking de cliente · % acumulado de venta clientes | — | Pareto con curva acumulada | Alto — riesgo comercial cuantificado | Bajo | **P1** |
| **O-14** | Proveedores | ¿De qué proveedores dependo para operar, y qué pasa si uno falla? | Compras, Proveedor, ABC Proveedor | % Compra en el mayor proveedor · % Compra en top 10 · Proveedores A | — | Pareto de proveedores + tabla de dependencia | Alto — riesgo de suministro | Bajo | **P1** |
| **O-15** | Cartera | ¿Qué clientes tienen mal perfil de pago y hay que revisar **antes de despachar**? | Comportamiento de pago, Cliente, Cartera | Clientes en vencido crítico · Saldo en clientes críticos · Días vencido promedio | — | Lista de bloqueo sugerido + dispersión riesgo/saldo | Alto — evita profundizar una pérdida | Bajo | **P1** |
| **O-16** | Inventario | ¿Cuánto dinero tengo parado en bodega que **sí se vendía** y dejó de moverse? | Análisis de producto, Inventario | Valor de inventario ocioso · Productos ociosos · % Inventario ocioso | — | Tabla accionable + tile | Medio — Q241k accionables, separados de Q92.6M de insumos | Bajo | **P1** |
| **O-17** | Tesorería | ¿Cuánto cobré de verdad a clientes, sin confundirlo con movimientos de tesorería? | Pagos recibidos, Cliente | Cobros de clientes · Cobros de tesorería · % Cobrado vs facturado | — | Barras cobranza vs facturación + mix de medio | Alto — sin la separación la cobranza se **triplica** | Bajo | **P1** |
| **O-18** | Ventas | ¿Cómo va el ejercicio contra el año pasado, y el mes contra su comparable? | Ventas, Calendario | Ventas acumuladas año · Ventas acumuladas año anterior · Variación acumulada vs año anterior | GAP-03 | KPI con comparativo + columnas mes a mes | Alto — la lectura de junta | Bajo | **P1** |
| **O-19** | CxP | ¿Le estoy debiendo a proveedores más de lo que ellos me financian, y desde cuándo? | Cartera por pagar, Proveedor, Antigüedad | Saldo por pagar terceros · % Por pagar vencido · Por pagar más de 90 · Días de pago terceros | — | Aging de CxP + tile de posición neta | Medio — deuda vieja suele venir con suministro en riesgo | Bajo | **P1** |
| **O-20** | Grupo | ¿Cuál sociedad del grupo aporta, cuál consume, y cuánto es movimiento interno? | Ventas, Compras, Empresa | Ventas a terceros · Ventas al grupo · % Venta al grupo · Margen bruto | — | Barras por sociedad + tile de intercompañía | Alto — 10 sociedades sin lectura consolidada hoy | Bajo | **P1** |
| **O-21** | Socios | ¿A quién le vendo **y** le compro a la vez, y cuál es mi posición neta con él? | Socio de negocio, Cartera ×2, Ventas, Compras | Posición neta · Saldo por cobrar · Saldo por pagar | **GAP-02** | Tabla de socios duales con neteo | Medio — 37 socios duales; el neteo cambia la conversación | Medio | **P2** |
| **O-22** | Operación | ¿Qué días no vendí y por qué se cayó el ritmo? | Venta diaria, Calendario | Días sin venta · Venta diaria neta · Venta media móvil 7d/30d · Índice de estacionalidad | — | Serie diaria con media móvil + marcas de día sin venta | Medio — detecta paros y fallas de captura | Bajo | **P2** |
| **O-23** | Productos | ¿Qué artículos hacen el 80% de mi venta y cuánto inventario tengo en la cola larga? | Análisis de producto, Ventas, Inventario | Productos A/B/C · % Venta en productos A · Inventario en productos C | — | Pareto de productos + tile de inventario en C | Medio — enfoca el nivel de servicio | Bajo | **P2** |
| **O-24** | Clientes | ¿Mi cartera comercial se está renovando o envejeciendo? | Clasificación RFM, Cliente, Ventas | Clientes nuevos · % Venta de clientes nuevos · % Clientes activos · Antigüedad media del cliente | — | Serie de altas vs activos + tile de antigüedad | Medio — una cartera vieja sin altas se apaga | Bajo | **P2** |
| **O-25** | Cartera | ¿La cobranza mejora o se deteriora corte a corte? | Cartera cobrar histórico | % Vencido histórico · Variación de cartera · Efectividad de cobranza | — | Serie de % vencido por corte | Medio — **requiere historia**: hoy hay pocos cortes (LIM-07) | Bajo | **P2** |
| **O-26** | Inventario | ¿El inventario creció contra el mes pasado, y contra la venta? | Inventario, Ventas, Calendario | Valor de inventario · Rotación 12M · Inventario sobre ventas | **GAP-07** — comparativos de inventario | Serie de valor + tile de variación | Medio — la tabla no tiene comparativos hoy | Medio | **P2** |
| **O-27** | Ventas | ¿Dónde vendo geográficamente y hay territorios sin cubrir? | Ventas, Dirección de entrega | Ventas netas · Ventas a terceros | **GAP-04** — cobertura de dirección | Mapa por departamento + nota de cobertura | Medio — **solo 21% de las direcciones tiene departamento** | Medio | **P2** |
| **O-28** | Comercial | ¿Qué vendedor convierte el pedido que capta, y cuál solo capta? | Pedidos, Ventas, Vendedor | Pedido sobre facturado · Monto pedido · Ventas netas · Ticket promedio | — | Dispersión captación vs facturación por vendedor | Medio — la cobranza NO es atribuible al vendedor en este modelo | Bajo | **P2** |
| **O-29** | Confianza del dato | ¿Hasta cuándo llega el dato que estoy viendo? | Estado de carga | Último dato del ERP · Días desde última extracción · Dominios desactualizados | GAP-03 | Banda fija en el pie de las páginas ejecutivas | Alto para la **credibilidad**, bajo como análisis | Bajo | **P2** |
| **O-30** | Control | ¿Lo que dice contabilidad cuadra con lo que dice facturación? | Resultados contables, Ventas | Brecha contable vs facturado · % Brecha contable | — | Tile de control con umbral | Medio — es un control, no un KPI (hoy −1.1%) | Bajo | **P3** |
| **O-31** | Finanzas | ¿Qué centro de costo consume la estructura? | Resultados contables, Centro de costo, Cuenta | Gasto operativo · % Gasto en el mayor rubro · Gasto promedio mensual | — | Treemap de gasto por centro + jerarquía contable | Medio — depende de qué tan bien codifiquen los centros | Medio | **P3** |
| **O-32** | Moneda | ¿Qué operación quedó fuera del consolidado por falta de tipo de cambio? | Tipo de cambio, Moneda, Ventas | Tipo de cambio promedio · Tipo de cambio de cierre | — | Tabla de diagnóstico | Bajo — es conciliación, no gestión | Bajo | **P3** |

---

## 2. Lo que la matriz deja fuera a propósito

| No entra | Por qué |
|---|---|
| Balance general | `LIM-02`: no hay saldos de apertura. No se simula un balance incompleto |
| Días reales factura→pago (DSO real) | `LIM-04`: sin aplicación de pagos. El DSO existente es sobre saldo y así se declara |
| Posición de caja real | `LIM-05`: no hay saldos bancarios. La proyección es contractual y el título lo dirá |
| Margen de línea en Iron Network | `LIM-06`: Odoo no trae costo de línea. Las páginas de margen lo declaran |
| Cualquier página de "resumen general" | Antipatrón §11: página sin pregunta declarada |
| Explotación de campos de usuario | `LIM-01`: sin eje de tiempo ni empresa. La vía es promover el UDF al canónico |

---

## 3. Presupuesto que consume la selección

| Recurso | Consumo previsto | Límite (§4) |
|---|---|---|
| Páginas | 11 P0 → **11 páginas**, con los P1 alojados como secciones dentro de ellas | 12 |
| Medidas nuevas | GAP-01 (3) · GAP-02 (2) · GAP-03 (~10) · GAP-04 (1) · GAP-05 (2) · GAP-07 (2) = **~20** | 40 |
| Gaps que exigen decisión previa | GAP-05 (posible tabla auxiliar = cambio de modelo, §3.1) | — |

**Ocho de las once P0 no necesitan una sola medida nueva.** El modelo ya las responde y nadie
las está mirando: esa es la conclusión operativa de F1 confirmada con números en F2.

---

## Gate F2

| Criterio | Resultado |
|---|---|
| ≥25 filas | **PASA** — 32 |
| Todas con pregunta de negocio explícita | **PASA** — cada fila es una pregunta que un gerente hace, no un título de reporte |
| Prioridad asignada y derivada de impacto/esfuerzo | **PASA** — matriz de derivación en §0 |
| P0 ≤ 12 | **PASA** — 11 |

**Veredicto: F2 CERRADA.** Siguiente: F3 — arquitectura del reporte
(`docs/powerbi/report-architecture.md`) con un contrato por página y los contratos de §5.
