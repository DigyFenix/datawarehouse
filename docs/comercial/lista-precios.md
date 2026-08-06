# Lista de precios — BI gobernado para SAP B1 y Odoo

Versión 1.0 · 2026-08-05 · Mercado: Guatemala / Centroamérica
Moneda de cotización: **USD**. Presentar equivalente en GTQ a **Q7.70 / US$1**.
Todos los precios son **antes de IVA (12%)**.

> Este documento es la referencia comercial. Cambiar un precio aquí = versión nueva
> (igual que una métrica certificada: no se edita en silencio).

---

## 1. A quién se le vende (filtro de calificación)

**Regla de descarte: si el cliente no gasta ≥ US$800/mes en su ERP, no es cliente.**

El mercado guatemalteco tiene la expectativa de precio de software B2B anclada en
Q99–Q500/mes (FEL, ERPs locales). Con ese comprador se discute el precio para siempre y
consume soporte por encima de lo que paga. El cliente correcto ya demostró que paga por
software serio y no lo está aprovechando.

Perfil objetivo:
- SAP Business One (licencia Profesional ~€91/usuario/mes) o Odoo Enterprise con partner.
- 2 o más sociedades, o multi-sucursal.
- Vertical preferido: avícola, distribución, consumo masivo.
- Alguien pidiendo números que hoy salen de Excel y no cuadran entre áreas.

## 2. Ancla de precio

**El BI se vende entre 15% y 30% del gasto anual del cliente en su ERP.**

Una empresa con 15 usuarios de SAP B1 gasta ~US$22,000/año en licencias + mantenimiento
y pagó US$25,000–60,000 de implementación. Una suscripción de US$395–695/mes es 21–38% de
su gasto anual de licencias y le entrega el uso real de lo que ya compró.

Anclas secundarias, en orden de utilidad:
1. Costo del analista interno: Q8,541/mes (analista de datos) a Q19,400/mes (BI analyst).
2. Proyecto de BI con consultora local: US$10,000–30,000 y 3–6 meses.
3. Mantenimiento de dashboards con agencia: US$250–400/mes (y sin gobernanza ni ETL).

**Nunca** anclar contra "un dashboard" (US$300–600 en el mercado). Es la comparación que
te hace perder.

## 3. Implementación (pago único)

| Concepto | Precio USD | GTQ aprox. |
|---|---|---|
| **Diagnóstico de datos** — conexión read-only, 1 sociedad cargada, cuadre contra el ERP, 3 tableros. Se acredita 100% al setup si contrata en 30 días | **600** | Q4,600 |
| **Setup base** — 1 sociedad, 2 dominios (ventas + cartera), tableros base, portal de usuario, capacitación | **3,900** | Q30,000 |
| Sociedad adicional | 800 | Q6,200 |
| Dominio adicional (inventario, compras, rentabilidad, tesorería) | 1,200 | Q9,200 |
| Migración desde reportes existentes (homologar definiciones) | 900 | Q6,900 |

El setup se cobra **50% al firmar, 50% al aceptar el cuadre**. El cuadre contra el ERP es
el hito de aceptación — es objetivo y verificable, no opinable.

**US$3,900 no es casualidad:** cae por debajo del umbral que un gerente general o
financiero en Guatemala aprueba sin comité. Subir a US$5,000 no agrega 28% de ingreso;
agrega 6 semanas de ciclo de venta.

## 4. Suscripción (recurrente — el activo)

Se factura por **sociedad + dominios**, nunca por usuario (con Publish to Web no se
controlan usuarios, y cobrar por usuario penaliza la adopción, que es lo que evita el churn).

| Tier | Alcance | Mensual | Anual anticipado (10 meses) |
|---|---|---|---|
| **Base** | 1 sociedad · 2 dominios · refresco diario | **US$395** | **US$325/mes** — Q30,000/año |
| **Grupo** | ≤4 sociedades · 4 dominios · refresco 2×/día | **US$695** | **US$575/mes** — Q53,000/año |
| **Grupo+** | 5–10 sociedades · todos los dominios · refresco 4×/día · soporte prioritario | **US$1,150** | **US$950/mes** — Q88,000/año |

Incluye: hosting, refrescos programados, monitoreo del cuadre, actualizaciones del motor,
soporte por correo/WhatsApp en horario hábil (respuesta ≤1 día hábil), portal de usuario
con perfiles y auditoría.

**No incluye:** licencias de Power BI (Pro US$14/usuario/mes, lo paga el cliente directo a
Microsoft — decirlo en la primera reunión, siempre), ni desarrollo de reglas propias.

### Add-ons

| Add-on | Precio |
|---|---|
| Acceso privado (Power BI Embedded, sin URL pública) | +US$400/mes |
| Refresco intradía cada hora | +US$150/mes |
| On-prem (solo si el cliente lo exige) | setup ×2.5 · suscripción ×1.8 |
| Agente de IA en lenguaje natural (cuando exista) | +US$250/mes |

**Anual anticipado = 10 meses al precio de 12.** Financia la caja y baja el churn; ofrecerlo
siempre primero. El precio mensual está deliberadamente alto para empujar al anual.

## 5. Servicios (bajo demanda)

**Vender por entregable, no por hora.** El mercado guatemalteco tiene consultores de Power BI
publicando US$25/hora; en una comparación de tarifa se pierde. En una comparación de
entregable certificado, no hay con quién comparar.

| Entregable | Precio USD |
|---|---|
| Métrica nueva certificada (definición + implementación + prueba + documentación) | 450 |
| Tablero a medida | 900 |
| UDF promovido a campo canónico gobernado | 350 |
| Integración de fuente extra (Excel, CRM, planilla) | 1,200 |
| Bloque de 10 horas prepagadas (para trabajo no tipificado) | 600 |

Si el cliente insiste en tarifa horaria: **US$60/hora**, justificado por especialización en
SAP B1 a nivel de tablas. No bajar de ahí.

**Regla de alcance:** todo lo que no esté en el paquete se cotiza por escrito antes de
tocarlo. Es donde mueren los márgenes de este tipo de producto.

## 6. Descuentos permitidos

| Situación | Descuento | Qué se pide a cambio (obligatorio) |
|---|---|---|
| Cliente fundador (#1 y #2) | setup US$1,500 · suscripción US$250/mes por 12 meses | Caso documentado + referencia por escrito + derecho a citarlo. Al año 1 pasa a lista (en el contrato) |
| Clientes #3 a #5 | hasta 30% | Pago anual anticipado o referencia activa |
| Cliente #6 en adelante | 0% | — y subir la lista 15–20% |
| Multi-año (24 meses) | 15% | Pago anual anticipado |

Nunca descontar sin contraprestación. Un descuento regalado enseña al cliente que el precio
era ficticio.

## 7. Calculadora de cotización

```
SETUP     = 3,900
          + 800   × (sociedades − 1)
          + 1,200 × (dominios − 2)
          + 900   si hay reportes previos que homologar
          − 600   si pagó diagnóstico y contrata dentro de 30 días

MENSUAL   = tier por sociedades:  1 → 395 | 2-4 → 695 | 5-10 → 1,150
          + 400 si acceso privado
          + 150 si refresco por hora
          × 0.823 si paga anual anticipado (10 de 12 meses)
```

**Ejemplo — grupo de 6 sociedades, order-to-cash + inventario, con reportes previos:**
setup = 3,900 + 800×5 + 1,200×1 + 900 = **US$10,000** (Q77,000)
mensual = 1,150 → anual anticipado **US$950/mes** = **US$11,400/año** (Q88,000)

## 8. Forma y letra chica (Guatemala)

- Cotizar en USD, presentar equivalente en GTQ. El quetzal está estable (~Q7.65–7.70).
- **IVA 12% aparte y explícito** en la cotización.
- Las empresas retienen ISR: el piso rentable de US$325/mes es ~US$300 neto.
- **Se vende como servicio, nunca como licencia de software.** Protege la IP (el repo no se
  entrega) y evita discusiones de propiedad del código.
- Contrato: 12 meses, renovación automática, salida con 60 días de aviso, y cláusula de
  **portabilidad de datos** (el cliente se lleva su Gold en Postgres si se va). Esa cláusula
  cierra ventas: elimina el miedo al secuestro de datos y a ti no te cuesta nada.
- Ajuste anual de precio por inflación indexado (5%) escrito en el contrato desde el inicio.

## 9. Lo que NO se cobra por volumen

Tentador (el mercado GT acepta pricing por consumo: FEL cobra Q0.25–1.50 por factura), pero
no aplica: el cliente no puede presupuestar una factura variable de BI y cada conversación de
renovación se convierte en una auditoría de consumo. Sociedades + dominios es predecible para
él y está alineado con tu costo real.

---

Ver [escenario-financiero.md](escenario-financiero.md) para la proyección y los puntos de
decisión.
