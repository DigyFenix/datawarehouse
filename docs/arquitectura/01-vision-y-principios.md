# 01 · Visión y Principios

## 1. Qué es

Una plataforma de Inteligencia de Negocios **gobernada** y **agnóstica al ERP** de origen,
con un **agente de IA** que traduce preguntas en lenguaje natural a consultas sobre métricas
certificadas. Es un **producto de producción** — primero para la operación propia (avícola de
venta de huevos, multi-empresa), con vocación de producto/emprendimiento para otras
organizaciones.

La tesis de maestría "Arquitectura de BI habilitada por Agentes de IA y Gobernanza de Datos"
es la **base conceptual** del diseño. El proyecto no existe para la tesis; la tesis nació del
proyecto. Los principios de gobernanza se conservan porque producen un **buen producto**, no
por requisito académico.

## 2. El problema que resuelve

En organizaciones con un ERP (SAP Business One, Odoo) y reportes dispersos, el mismo indicador
(p. ej. "ventas netas") se calcula distinto según el área. Poner un agente de IA encima de
datos fragmentados **amplifica** la inconsistencia. La solución no es la IA: es la **base
gobernada** debajo — definiciones únicas, calidad, control de acceso y linaje. La IA es la
capa de consulta; la gobernanza es lo que la hace confiable.

**Regla mental de todo el diseño:** la facilidad de preguntar no debe romper el control
analítico. Si una decisión facilita la consulta pero abre la puerta a respuestas no
verificables o fuera de política, es la decisión incorrecta.

## 3. Objetivos

- Consultar datos en lenguaje natural con respuestas **verificables** (métrica + período + estado).
- **Consistencia:** la misma métrica da el mismo resultado para dos usuarios distintos.
- **Seguridad:** cada usuario ve solo lo que su rol y su alcance (empresa/cartera) permiten.
- **Trazabilidad:** reconstruir, ante cualquier respuesta, qué fuente, transformación y versión de métrica la sustentó.
- **Agnóstico:** que la misma arquitectura sirva para distintos ERPs cambiando solo el mapeo.
- **Administrable:** que el dueño configure organizaciones, mapeos, métricas y accesos desde un portal, sin tocar la base.

## 4. No-objetivos (alcance controlado)

- No es un generador de SQL libre ni un "chat con la base de datos" sin control.
- No busca cobertura funcional total del ERP: cubre dominios de negocio priorizados.
- No escribe nunca en el ERP de origen: la extracción es **solo lectura**.
- No monta Lakehouse (Delta/Iceberg + S3) salvo requisito real de datos semiestructurados a volumen.

## 5. Principios rectores

1. **Gobernanza primero.** El control (definiciones, calidad, acceso, linaje) precede a la conveniencia de consulta.
2. **Agnóstico al ERP.** Un modelo canónico universal; cada ERP se conecta con un mapeo. Cambiar de ERP = cambiar el mapeo, no el resto.
3. **Dos planos.** Plano de control (portal, administra metadatos) separado del plano de datos (pipelines + semántica + agente, ejecutan). Unidos por el `metadata-store`.
4. **Un solo dueño por dato.** Cada dato pertenece a un dominio; muchos lo consultan con su permiso. Nada se duplica.
5. **Definición única de métrica.** Cada métrica se define una sola vez en la capa semántica. Nadie la recalcula en Power BI, en el agente ni en un reporte.
6. **Sin SQL libre.** El agente consulta métricas tipadas sobre la capa semántica; nunca genera ni ejecuta SQL arbitrario contra la base.
7. **RLS siempre.** Toda consulta lleva el contexto de seguridad del usuario autenticado. El agente no puede ampliar su alcance.
8. **Trazabilidad total.** Cada tabla y cada métrica llevan metadatos de origen y versión.
9. **Metadata-driven.** El comportamiento del sistema se configura por metadatos administrados en el portal, no por código disperso.
10. **Nada desechable.** Es producción desde el día uno; todo lo que se escribe se queda.

## 6. Decisiones y trade-offs

| Decisión | Alternativa descartada | Por qué |
|----------|------------------------|---------|
| Medallion sobre RDBMS (Postgres/SQL Server) | Lakehouse (Delta/Iceberg + S3) | Suficiente y mucho más rápido de operar; sin requisito de semiestructurados a volumen. |
| ELT (crudo entra a Bronze, reglas dentro del repo) | ETL (transformar antes de cargar) | Preserva trazabilidad y permite recalcular cuando cambia una definición. |
| Extracción **solo lectura** (Service Layer / vistas) | Consultar/escribir tablas base del ERP | Integridad, licenciamiento y soporte del ERP. |
| Capa semántica gobernada + tools tipadas | Text-to-SQL libre por el LLM | Text-to-SQL rompe consistencia, salta RLS y anula trazabilidad. |
| **Instancia por tenant** (base + portal por organización) | Base compartida multi-tenant | Aislamiento fuerte entre clientes, despliegue simple, vendible. |
| Evolución de schema **Nivel 2** (migración versionada + rollback) | Nivel 3 (auto-DDL en caliente) | Nivel 3 viola trazabilidad y la regla de "nada en silencio, siempre rollback". |
| Certificación de métrica **multi-aprobador** | Certificación por una sola persona | La métrica es consenso de negocio; requiere aprobación de sus dueños. |

Ver detalle técnico en [02 · Arquitectura Técnica](02-arquitectura-tecnica.md) y de control en
[03 · Gobernanza y Seguridad](03-gobernanza-y-seguridad.md).
