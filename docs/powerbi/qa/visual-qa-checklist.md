# QA visual — F6.3 · Ola 1 (00 · Inicio, 01 · Dirección, 09 · Cartera y cobranza)

ESTADO: **PENDIENTE DE CAPTURAS** — el agente no renderiza el reporte y no puede evaluar
legibilidad, jerarquía visual ni densidad percibida (§F6.3 del contrato: declararlo, no
simularlo). Esta acta se completa solo con capturas reales de las 3 páginas.

> Nunca se marca aprobada sin haber visto capturas. Bloqueo B5.

## Capturas requeridas

1. `00 · Inicio` — página completa a 1280×720, con el mes en curso seleccionado.
2. `01 · Dirección` — ídem, verificando que los 5 focos muestran texto con cifras.
3. `09 · Cartera y cobranza` — ídem, con la tabla de agenda de cobro poblada.
4. Una captura del panel de páginas (para confirmar orden y nombres de pestañas).

## Checklist por página (se llena al revisar las capturas)

| # | Verificación | 00 | 01 | 09 |
|---|---|---|---|---|
| 1 | El título de página muestra `NN · Nombre · período` desde la medida | ☐ | ☐ | ☐ |
| 2 | El pie de frescura es legible y dice la fecha correcta (2026-08-08, no 2027) | ☐ | ☐ | ☐ |
| 3 | Los tres segmentadores están alineados en su banda y el período arranca en el mes en curso | ☐ | ☐ | ☐ |
| 4 | Ningún visual se ve cortado, vacío ni con "(En blanco)" inesperado | ☐ | ☐ | ☐ |
| 5 | Tipografía consistente (Segoe UI; tarjetas 30px azul; ejes 9px) | ☐ | ☐ | ☐ |
| 6 | El tema de marca se aplicó (banda azul #0043af, tablas con cabecera azul, fondo #f4f6f9) | ☐ | ☐ | ☐ |
| 7 | El rojo aparece SOLO en estado crítico (KPI vencido, alertas), nunca como serie | ☐ | ☐ | ☐ |
| 8 | Densidad: la página se lee en <10 segundos sin hacer zoom | ☐ | ☐ | ☐ |

## Verificaciones específicas

- **00**: los 2 botones activos navegan (01 y 09); los 4 inertes se ven pero no confunden
  (¿necesitan estado deshabilitado visible?). La tabla de dominios muestra los 11 dominios.
- **01**: los 5 focos muestran su cifra viva; el foco de vencido navega a 09. El KPI
  `Proyección de cierre de mes` muestra valor (no BLANK) con el mes en curso seleccionado.
- **09**: las 4 tarjetas muestran la foto de hoy aunque el período sea agosto; la agenda de
  cobro lista clientes con documento y fecha; la tendencia declara "serie en formación".

## Defectos encontrados (ronda 1 de máximo 2)

_(vacío hasta recibir capturas)_
