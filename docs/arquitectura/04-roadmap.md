# 04 · Roadmap

Construcción por fases. Cada fase se valida antes de avanzar, salvo instrucción explícita de
entregar una fase completa de una vez. El proyecto es de producción: cada fase deja artefactos
que se quedan, no prototipos desechables.

## Fases

| Fase | Nombre | Entrega | Demuestra |
|------|--------|---------|-----------|
| **0** | Fundación agnóstica | Modelo canónico + contratos entre capas + estructura del repo + `metadata-store` base | El diseño no depende de ningún ERP |
| **1** | Datos | Extracción read-only → Bronze; Silver (canónico + calidad + cuarentena); Gold (estrella) | Datos entran gobernados y trazables |
| **2** | Semántica | Capa semántica + catálogo de metadatos + las 5 métricas del primer corte, documentadas | Definición única = consistencia |
| **3** | Gobernanza | Linaje, roles, certificación multi-aprobador, RLS, tenencia | Seguridad y control |
| **4** | Agente | Tools tipadas sobre la semántica + las 4 restricciones duras + guía proactiva | La IA no rompe el control |
| **5** | Portal (Etapa A) | Registrar org + conexión + editar mapeos/glosario/métricas + aprobaciones + RLS + auditoría | Administración sin tocar la base |
| **6** | Consumo | Power BI sobre Gold/semántica + demo NL end-to-end | Todo junto funciona |
| **7** | Validación | Prueba de los 4 criterios (abajo) | El producto es confiable |

### Fases posteriores (diseñadas, construidas después)

- **Portal Etapa B:** motor de evolución de schema Nivel 2 (metadato → migración versionada + rollback).
- **Portal Etapa C:** delegación de roles, multi-usuario admin, más ERPs.
- **Dominios adicionales:** `crm`, `compras`, `inventario`, `produccion`, `finanzas`.

## Primer corte productivo (alcance concreto)

**Order-to-cash** en la operación propia (avícola, multi-empresa):

- **Dominios:** `datos_maestros`, `ventas`, `tesoreria`, `gobierno`.
- **Métricas (5 de 7):** Ventas Brutas, Devoluciones, Ventas Netas, Saldo Pendiente de Cobro, Aging.
  - Rentabilidad/Margen queda como *stretch* (arrastra costos de compras/producción).
- **ERP inicial:** el de la operación propia (SAP B1 u Odoo, según conexión disponible), con el mapeo correspondiente.
- **Multi-empresa:** las empresas del grupo sobre las mismas tablas, con `empresa_id` + RLS.

Este corte prueba el flujo más visible para negocio (facturo → cobro → cartera) y ejercita las
cuatro propiedades sin construir de más.

## Criterios de aceptación (calidad del producto)

Tomados de la tesis, usados aquí como criterios de calidad:

1. **Consistencia** — la misma métrica da el mismo resultado para dos usuarios distintos.
2. **Confiabilidad / explicabilidad** — toda respuesta incluye métrica, período y estado, y su linaje es reconstruible.
3. **Seguridad / RLS** — cada usuario ve solo su alcance (empresa/cartera); el agente no lo amplía.
4. **Trazabilidad** — se puede reconstruir fuente, transformación y versión de métrica de cualquier respuesta.

## Decisiones abiertas (a resolver en su fase, no bloquean el diseño)

- **Motor de capa semántica:** Cube.dev vs dbt Semantic Layer. Hasta confirmar, modelar métricas como vistas/tablas Gold materializadas en dbt, de forma que migrar a cualquiera sea directo.
- **Alojamiento:** local/Docker para iterar vs AWS (RDS + cómputo) por tenant. No decidido; no bloquea el diseño.
- **Herramienta de integración:** n8n / SSIS / Python u otro para la extracción. No decidido; el contrato de la capa 0 es lo fijo.
- **Modelo de despliegue del portal:** instalado por cada organización (self-managed) vs instalado por el proveedor por organización. Ambos compatibles con "instancia por tenant".
