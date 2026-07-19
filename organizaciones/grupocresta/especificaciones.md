# Grupo Cresta — Especificaciones del Proyecto (Tenant)

Proyecto de instancia de la plataforma para **Grupo Cresta**. Independiente de otras
organizaciones. Instancia el motor de la base; aquí viven sus especificaciones y configuración.

## 1. Identidad

| Campo | Valor |
|-------|-------|
| Tenant | Grupo Cresta |
| Sector | Avícola — venta de huevos |
| Multi-empresa | Sí — grupo de empresas/sociedades (≈10) |
| Modelo de aislamiento | Instancia dedicada (base + portal propios); empresas con `empresa_id` + RLS |
| Estado | En arranque — Fase 0 (fundación) |

## 2. Decisiones de infraestructura (confirmadas 2026-07-19)

> Estos valores condicionan la extracción y el motor de base. Confirmados al arrancar Fase 0.

- **ERP de origen:** ✅ **SAP Business One / HANA** (cada sociedad = una BD HANA).
- **Vía de extracción read-only:** 🔵 Vistas dedicadas read-only en HANA (recomendado) — se
  confirma al iniciar Fase 1. Alternativa: Service Layer (OData).
- **Motor del plano de datos:** ✅ **PostgreSQL** (medallion en Docker local).
- **Alojamiento:** ✅ **Local / Docker** (`infra/local/`); migrable a AWS sin cambiar el diseño.
- **Herramienta de integración:** ✅ **Python** (extractores tipados read-only → Bronze).
- **Registro de empresas del grupo:** ✅ 6 sociedades registradas en `config/empresas.md`.
  Piloto Fase 1: `proavisa` + `loreto`.

## 3. Alcance del primer corte productivo

**Order-to-cash** (facturo → cobro → cartera):

- **Dominios:** `datos_maestros`, `ventas`, `tesoreria`, `gobierno`.
- **Métricas (5):** Ventas Brutas, Devoluciones, Ventas Netas, Saldo Pendiente de Cobro, Aging.
- **Fuera de este corte:** Rentabilidad/Margen (arrastra costos), dominios `crm`, `compras`, `inventario`, `produccion`, `finanzas`.

## 4. Configuración específica del tenant

| Artefacto | Ubicación | Estado |
|-----------|-----------|--------|
| Registro de empresas | `config/empresas.md` | ✅ 6 sociedades registradas |
| Conexión read-only (referencia a secreto) | `config/conexion.md` | ✅ Definida (referencia a `.env`) |
| Mapeo ERP→canónico | `mapeo/sap_b1/` | Por construir (Fase 1) |
| Glosario del negocio | `glosario/glosario.md` | Iniciado |
| Catálogo de métricas del tenant | `metricas/` | Por construir (Fase 2) |
| Roles, grants y RLS | `gobierno/` | Por construir (Fase 3) |

## 5. Próximo paso

Fase 0 completada (fundación agnóstica: estructura + Docker/Postgres + metadata-store + modelo
canónico + esqueletos). **Próximo paso: Fase 1 (Datos)** con el par piloto `proavisa` + `loreto`
— confirmar la vía de extracción HANA (vistas vs Service Layer), implementar extractores
read-only → Bronze, modelos Silver (mapeo `sap_b1`→canónico + calidad) y Gold estrella.

## 6. Bitácora de decisiones del tenant

| Fecha | Decisión | Nota |
|-------|----------|------|
| 2026-07-19 | Proyecto inicializado | Instancia sobre la base; alcance primer corte = order-to-cash |
| 2026-07-19 | Infraestructura confirmada | ERP SAP B1/HANA · motor Postgres · alojamiento Docker local · extracción Python |
| 2026-07-19 | 6 sociedades registradas | Piloto Fase 1 = `proavisa` + `loreto`; resto para escalado |
| 2026-07-19 | Fase 0 completada | Motor en pie: estructura, Docker/Postgres, metadata-store, modelo canónico, esqueletos |
