# Escenario financiero realista — y ejecutable con la capacidad real

Versión 1.0 · 2026-08-05 · Horizonte: 24 meses (ago 2026 → jul 2028)
Tipo de cambio: Q7.70 / US$1 · Precios de [lista-precios.md](lista-precios.md)

> Este documento no proyecta el negocio que se quisiera tener. Proyecta el que cabe en
> **12 horas por semana** con **una sola persona** y **sin capital**. Todo lo que no cabe,
> está marcado como tal.

---

## 1. La restricción real: capacidad, no demanda

El error de análisis más común aquí sería asumir que el límite es conseguir clientes. No lo es.

**Presupuesto de horas.** Trabajo de tiempo completo en Grupo Cresta + vida. Sostenible sin
quemarse: **12 h/semana ≈ 45 h/mes efectivas** (descontando semanas malas, cierres de mes y
viajes) ≈ **540 h/año**.

**Consumo de horas por actividad:**

| Actividad | Horas | Nota |
|---|---|---|
| Onboarding de cliente nuevo | **45–55 h** el primer año | Runbook técnico ≤5 días, pero el total incluye reuniones de mapeo, homologar definiciones, tableros al gusto del cliente y capacitación |
| Onboarding con runbook maduro | 25–30 h | Meta a 12 meses |
| Soporte/operación por cliente | **4 h/mes** año 1 → 2.5 h/mes maduro | Refrescos fallidos, dudas, ajustes menores |
| Venta (prospección, reuniones, propuestas) | 10 h/mes | No negociable: sin esto no entra nada |
| Producto (mejoras del motor) | 8 h/mes | Lo mínimo para no acumular deuda |

**Consecuencia aritmética, con 45 h/mes:**

```
45 h − 10 (venta) − 8 (producto) = 27 h/mes disponibles
27 h ÷ 4 h por cliente           = techo de ~6-7 clientes en operación
Un onboarding de 50 h            = mes y medio de toda la capacidad libre
                                 → ~3 clientes nuevos por año, no 8
```

**Techo real de una persona sola: 6–7 clientes · MRR ~US$2,700–3,400.** Ese es el número a
evaluar, no un ARR imaginario de seis cifras.

### La conclusión que cambia la estrategia

Con capacidad limitada, **un cliente grande es estrictamente mejor que tres chicos**:

| Configuración | MRR | Horas de soporte/mes |
|---|---|---|
| 7 clientes tier Base | US$2,765 | 28 h |
| 3 clientes tier Grupo+ | US$2,850 | 12 h |

Mismo ingreso, **menos de la mitad del esfuerzo**. Por eso el objetivo comercial son grupos
multi-sociedad (Grupo / Grupo+), y el tier Base es puerta de entrada, no el producto. Un
cliente Base que exige atención de Grupo+ es una pérdida: se sube de tier o se deja ir.

## 2. Escenario realista (el caso base)

Supuestos: ciclo de venta B2B en Guatemala de 2–4 meses · cierre de 40–50% desde diagnóstico
pagado, ~10% desde contacto frío · Grupo Cresta **no genera ingreso monetario** (bono +
caso de referencia, y el riesgo de IP del §5).

| Trimestre | Qué pasa | Clientes pagando | Ingreso del trimestre |
|---|---|---|---|
| **T1** ago–oct 2026 | Iron Network productivo como cliente fundador ($1,500 setup + $250/mes). Formalización fiscal. Acuerdo de IP con Cresta. Materiales de venta | 1 | **US$2,250** |
| **T2** nov 2026–ene 2027 | 3 diagnósticos vendidos, 1 cierra → cliente #2 (tier Grupo) | 2 | **US$8,400** |
| **T3** feb–abr 2027 | Cliente #3. Primer ingreso de servicios recurrente | 3 | **US$9,800** |
| **T4** may–jul 2027 | Cliente #4. Runbook baja a ~35 h | 4 | **US$10,300** |
| **Año 1** | | **4** | **≈ US$30,000** · MRR salida **US$1,800** |
| **T5–T8** ago 2027–jul 2028 | +3 clientes (total 7 = saturado). Sube la lista 15%. Se decide canal o techo | **7** | **≈ US$52,000** · MRR salida **US$3,400** |

**Acumulado 24 meses ≈ US$82,000** (Q630,000) con ~1,100 horas invertidas
→ **≈ US$70/hora efectiva**, más un activo que produce US$3,400/mes recurrentes.

Contra la alternativa honesta: esas mismas 1,100 horas como consultor freelance de Power BI en
Guatemala a US$25–40/h serían US$27,000–44,000 **y cero activo al final**. El negocio gana,
pero gana en el año 2 — el año 1 no paga como negocio, paga como inversión.

### Estructura de costos (real, no estimada al aire)

| Concepto | USD/mes |
|---|---|
| Hetzner CPX31 + backups | 21 |
| Dominio + Google Workspace | 8 |
| Power BI Pro (propio) | 14 |
| Contabilidad / facturación en Guatemala | 50 |
| Herramientas de IA y desarrollo | 100–200 |
| **Total** | **~US$200–300/mes** (US$2,400–3,600/año) |

Impuestos (régimen opcional simplificado: 5% hasta Q30,000/mes, 7% sobre el exceso):
año 1 ≈ US$1,500 · año 2 ≈ US$2,700.

**Margen neto 2 años ≈ US$70,000** sobre US$82,000 facturados (**85%**). El costo escaso no
es la infraestructura — son las horas.

## 3. Los otros dos escenarios

| Escenario | Prob. | Qué pasa | Al mes 24 | Veredicto |
|---|---|---|---|---|
| **Pesimista** | 35% | Iron Network churnea o nunca formaliza pago; los diagnósticos no convierten (el comprador local compara contra un dashboard de $600) | 2 clientes · MRR **$900** · acumulado **~$28,000** | Ingreso lateral decente, **no es negocio**. Congelar inversión de horas y operar en mantenimiento |
| **Realista** | 45% | El caso base de arriba | 7 clientes · MRR **$3,400** · acumulado **~$82,000** | Funciona, pero **saturado**: obliga a decidir entre contratar, subir precios o estancarse |
| **Con canal** | 20% | Un partner de SAP B1 local (FCS, TuSAP, Grupo Inforum) revende con 25–30% de comisión y **hace la implementación con tu runbook** | 12–15 tenants · MRR bruto **$6,500–7,500** · neto **~$5,000** | Es la única vía a escala sin contratar. Requisito duro: onboarding entregable a un tercero |

**El canal es la palanca de mayor impacto, y no es marketing: es producto.** Un partner solo
revende si puede implementar sin ti. Eso significa portal + runbook a prueba de terceros —
exactamente el trabajo que ya vas haciendo (ensayo de `demotest`, paquetes de onboarding
parametrizados). Cada hora que baja el onboarding vale más que cada hora de prospección.

## 4. Plan ejecutable — las próximas 4 semanas

Concreto, cabe en 12 h/semana, y sin esto nada de lo anterior ocurre:

| Semana | Entregable | Horas |
|---|---|---|
| 1 | **Acuerdo de IP por escrito con Grupo Cresta.** Antes de facturar a cualquier tercero | 4 |
| 1 | Formalización fiscal: régimen, facturación FEL propia | 4 |
| 2 | Contrato de servicio (12 meses, portabilidad de datos, ajuste anual 5%) + plantilla de propuesta | 8 |
| 3 | **Iron Network firmado como cliente fundador** con su PBIP sincronizado (hoy está desincronizado del warehouse) | 12 |
| 4 | Caso de referencia de 2 páginas con cifras reales de Cresta (anonimizadas) + lista de 15 prospectos calificados con el filtro de ≥US$800/mes en ERP | 10 |

Lo que **no** entra en estas 4 semanas, por más tentador que sea: agente de IA, landing page
bonita, más dominios en el motor, segundo ERP. Nada de eso hace que alguien pague.

## 5. Puntos de decisión (fechas y umbrales, sin interpretación)

| Fecha | Umbral | Si no se cumple |
|---|---|---|
| **2026-10-31** | Acuerdo de IP firmado con Cresta + Iron Network facturando | **Parar la venta externa.** Construir con recursos del empleador y luego facturar es exposición legal real, y el producto ya vale algo |
| **2027-01-31** | ≥2 diagnósticos **pagados** por clientes externos | El problema es la oferta o el canal, no el producto. Replantear antes de invertir 200 horas más |
| **2027-07-31** (mes 12) | MRR ≥ US$1,500 · churn 0 | Congelar a mantenimiento: opera lo que hay, deja de invertir noches |
| **2028-01-31** (mes 18) | Un partner de canal firmado **o** onboarding ≤20 h | Aceptar que es ingreso lateral con techo de ~US$3,000/mes y dimensionar la vida en consecuencia. No es fracaso; es dejar de fingir que escala |

## 6. Qué no hacer (errores que matan este plan)

- **Contratar antes de US$5,000 de MRR.** Un sueldo en Guatemala (Q8,500–19,400/mes) se come
  todo el margen y agrega la obligación de venderle trabajo a alguien más.
- **Construir el agente de IA antes de 3 clientes pagando.** Se comoditiza contra Copilot y no
  es lo que compran (compran certeza en el número).
- **Aceptar el primer cliente que exija on-prem** sin cobrar el múltiplo. Rompe el modelo de
  operación y la protección de la IP.
- **Vender tier Base a empresas de Q500/mes.** Consumen más soporte que el precio del tier.
- **Bajar el precio para cerrar.** El problema nunca va a ser el precio: es que el comprador
  no distingue esto de un dashboard. Eso se arregla con el cuadre contra su ERP en la primera
  reunión, no con descuento.
- **Prometer fechas de onboarding sin haber corrido Descubrir** contra su SAP. Los nombres de
  columna cambian por versión; una promesa de 5 días que se vuelve 3 semanas mata la referencia.

## 7. La evaluación, en una línea

Como negocio de una persona con trabajo de tiempo completo: **ingreso lateral de US$2,500–3,500
al mes hacia el mes 24, con 85% de margen y un activo vendible** — no una salida del empleo.
Se convierte en negocio real solo por dos vías, y ambas son técnicas antes que comerciales:
**bajar el onboarding a menos de 20 horas** y **hacerlo entregable a un partner de canal**.
