# CLAUDE.md — Plataforma de BI Gobernada con Agente de IA

Archivo de contexto para Claude Code. Léelo completo antes de generar o modificar código.
Es la fuente de verdad de decisiones de arquitectura, convenciones y restricciones de este repo.

> La documentación de arquitectura detallada vive en `docs/arquitectura/` (fuente de verdad
> ampliada). Este archivo es el resumen operativo.

---

## 1. Qué es este proyecto

Un **producto de producción**: una plataforma **multi-tenant, gobernada y agnóstica al ERP** que
permite a un usuario de negocio consultar datos en lenguaje natural y recibir respuestas basadas
**únicamente en métricas certificadas y datos gobernados**, con control de acceso y trazabilidad.

- Se implementa primero para la operación propia (**Grupo Cresta**, avícola de venta de huevos,
  multi-empresa) y tiene vocación de **producto/emprendimiento** para otras organizaciones.
- La tesis de maestría "Arquitectura de BI habilitada por Agentes de IA y Gobernanza de Datos"
  (E. Chacón) es la **base conceptual** del diseño — el proyecto no existe para la tesis; la
  tesis nació del proyecto.
- Es producción desde el día uno: **nada desechable**. Se construye por fases, cada una deja
  artefactos que se quedan.

Los principios de gobernanza (definiciones únicas, sin SQL libre, RLS, trazabilidad) se
conservan porque hacen un **buen producto**, no por requisito académico.

---

## 2. Contexto del dominio

El problema: en organizaciones con un ERP (SAP Business One, Odoo) + reportes dispersos, el
mismo indicador (p. ej. "ventas netas") se calcula distinto según el área. Poner un agente de IA
encima de datos fragmentados **amplifica** la inconsistencia. La solución no es la IA: es la base
gobernada debajo.

**Regla mental de todo el código:** la facilidad de preguntar no debe romper el control
analítico. Si una decisión facilita la consulta pero abre la puerta a respuestas no verificables
o fuera de política, es la decisión incorrecta.

ERPs principales objetivo: **SAP Business One** y **Odoo**. El diseño es agnóstico: cambiar de
ERP = cambiar el mapeo, no el resto.

---

## 3. Repositorio: base + instancias

Este repo es la **base (motor común, agnóstico)**. Cada organización-cliente (**tenant**) se
instancia como proyecto **independiente** bajo `organizaciones/`.

```
/
├── docs/arquitectura/     # documentación (fuente de verdad)
│   ── BASE (motor común) ──
├── control-plane/         # PORTAL (plano de control): portal/ + api/
├── metadata-store/        # contrato entre planos: catálogo, mapeos, glosario, políticas
├── data-plane/            # plano de datos
│   ├── canonico/          #   modelo canónico agnóstico
│   ├── mapeos/            #   plantillas por ERP: sap_b1/ , odoo/
│   ├── dominios/          #   ventas/ inventario/ tesoreria/ ... (nombres claros)
│   ├── semantico/         #   catalogo/ metricas/ glosario/
│   ├── agente/            #   tools tipadas + guardas + api
│   └── gobierno/          #   roles, RLS, políticas
│   ── INSTANCIAS (una por tenant, independientes) ──
├── organizaciones/
│   └── grupocresta/       # specs + config + metadatos del tenant
└── infra/                 # IaC por tenant
```

**Base vs instancia:** el motor es igual para todos. Lo propio de cada organización (conexión,
ERP elegido, mapeo, glosario, valores de métricas, RLS, empresas) vive en su carpeta bajo
`organizaciones/`. Dar de alta o cambiar una organización **no toca el motor**.

---

## 4. Los dos planos

- **Plano de control (portal):** donde se **administran** los metadatos (organizaciones, mapeos,
  glosario, métricas, roles, RLS). No mueve datos.
- **Plano de datos:** **lee** los metadatos y actúa (extrae, transforma, responde).
- **Metadata-store:** la frontera. El portal escribe; el plano de datos lee.

---

## 5. Stack y mapeo arquitectura → herramientas

| Capa conceptual | Implementación |
|-----------------|----------------|
| Fuentes transaccionales | SAP Business One / Odoo (CRM/Excel opcional) |
| Extracción (ELT, read-only) | Orquestador (n8n / SSIS / Python — **por confirmar por tenant**); Service Layer (OData) o vistas read-only |
| Repositorio corporativo | Postgres o SQL Server, esquemas medallion (**motor por confirmar por tenant**) |
| Transformación / modelado | dbt (Bronze→Silver→Gold, tests, docs, linaje) |
| Capa semántica + métricas | Vistas Gold materializadas en dbt (`oro.metrica_valor`) + catálogo de metadatos — ver §7 |
| Calidad de datos | dbt tests + tabla de cuarentena |
| Consumo (dashboards) | Power BI conectado a Gold / capa semántica |
| Agente de IA (NL→consulta) | Node.js + TypeScript + Anthropic API, contra capa semántica |
| Portal (plano de control) | Node/TS (frontend admin + API) |
| Infraestructura | Local/Docker o AWS por tenant (**alojamiento por confirmar**) |

Las herramientas marcadas "por confirmar" se deciden por tenant en su `especificaciones.md`; el
contrato entre capas es lo fijo. No cambiar el resto sin motivo técnico explícito.

---

## 6. Decisiones técnicas tomadas

- **Medallion sobre RDBMS**, no Lakehouse. Suficiente y más rápido de operar; sin requisito de
  semiestructurados a volumen.
- **ELT, no ETL.** Crudo entra a Bronze; reglas dentro del repo (dbt). Preserva trazabilidad y
  permite recalcular al cambiar una definición.
- **Extracción read-only.** Service Layer (OData) o vistas. **Nunca** escribir en el ERP ni
  consultar sus tablas base sin la vía aprobada.
- **Silver es la costura agnóstica.** Bronze es distinto por ERP; de Silver hacia arriba todo es
  idéntico. Ahí ocurre el mapeo ERP→canónico, la homologación y la calidad. **No se salta.**
- **Instancia por tenant.** Cada organización-cliente tiene su base y su portal (aislamiento
  fuerte). Las empresas del grupo comparten tablas con `empresa_id` + RLS.
- **El agente no genera SQL arbitrario.** Ver §11 (decisión de seguridad central).
- **Evolución de schema Nivel 2:** metadato → migración versionada + revisión + rollback. Nunca
  Nivel 3 (auto-DDL en caliente).

---

## 7. Capa semántica y catálogo de metadatos

**Decisión (2026-08-08): no se adopta motor semántico dedicado.** La capa semántica del
producto son las vistas Gold materializadas en dbt (`oro.metrica_valor`, 28 métricas en 6
dominios) más el catálogo de metadatos. Es lo que consume el agente vía tools tipadas y lo que
alimenta Power BI. Migrar a Cube.dev o al dbt Semantic Layer sigue siendo directo desde aquí,
y se hará cuando un tenant lo exija — no antes.

La capa semántica gobierna **tres ejes por métrica**: **definición** (fórmula única),
**certificación** (`borrador`→`en_revision`→`certificada`→`deprecada`; más `exploratoria`) y
**autorización** (por rol/dominio/métrica).

El agente **nunca lee nombres físicos de tabla**: razona sobre el **catálogo de metadatos**
(`catalogo_metricas`, `catalogo_dimensiones`, `catalogo_hechos`, `glosario_negocio`, `linaje`).
El glosario traduce el vocabulario del negocio sin ensuciar el canónico genérico.

---

## 8. Modelo dimensional (Gold, esquema estrella)

**Grano del hecho = línea de documento.**

**Hechos:** `fct_ventas_facturacion`, `fct_cobros_cxc`, `fct_compras_inventario`,
`fct_rentabilidad`.

**Dimensiones:**
- `dim_tiempo`, `dim_cliente`, `dim_producto`, `dim_vendedor`
- `dim_organizacion` = **empresa → sucursal** (sucursal a nivel línea, con **miembro default**)
- `dim_centro_costo` y `dim_cuenta` = dimensiones **aparte**, a nivel línea (finanzas)

Reglas: **toda dimensión tiene miembro default/desconocido** para que el hecho siempre cruce.
Nombres en snake_case, prefijos `fct_`/`dim_`. No renombrar sin justificar y avisar.

---

## 9. Catálogo de métricas certificadas

Fuente única de definiciones. Toda métrica se implementa **una sola vez** y se reutiliza. Ninguna
se recalcula en Power BI, en el agente ni en un reporte suelto.

| Métrica | Definición | Hecho origen |
|---------|------------|--------------|
| Ventas Brutas | Suma de facturas activas del período | fct_ventas_facturacion |
| Devoluciones | Suma de notas de crédito por devolución | fct_ventas_facturacion |
| Ventas Netas | Ventas Brutas − Devoluciones | fct_ventas_facturacion |
| Margen Bruto | Ventas Netas − Costo de Ventas | fct_rentabilidad |
| Rentabilidad por Cliente | Margen atribuible al cliente | fct_rentabilidad |
| Saldo Pendiente de Cobro | Saldo de documentos abiertos en CxC | fct_cobros_cxc |
| Aging / Antigüedad de Saldos | Saldo por rangos: corriente, 1-30, 31-60, 61-90, +90 | fct_cobros_cxc |

Atributos obligatorios: `nombre_oficial`, `definicion_negocio`, `formula`, `hecho_origen`,
`filtros`, `periodicidad`, `owner`, `estado`, `roles_autorizados`, `aprobadores`,
`version_definicion`.

**El agente solo usa métricas `certificada`.** Certificación = **multi-aprobador**: entra en
funcionamiento cuando **todos** los aprobadores aprueban en el portal. Cambiar una fórmula
certificada = **nueva versión + recertificar** (nunca editar en silencio).

---

## 10. Calidad de datos (dbt tests, en Silver antes de Gold)

- **Completitud** — claves no nulas: fecha, cliente, monto.
- **Validez** — formatos; signo del monto por tipo de documento; códigos existentes (`relationships`).
- **Consistencia** — integridad referencial (nota de crédito referencia factura existente).
- **Unicidad** — sin duplicados por clave de documento (`unique`).

Los registros que fallan **no bloquean**: se desvían a `quarantine_<modelo>` con regla violada y
timestamp.

---

## 11. Agente de IA — diseño y RESTRICCIONES DURAS

Flujo con **guía proactiva**: NL → clarifica intención → usuario confirma → ¿rol autorizado? (si
no, orienta qué SÍ puede consultar) → construye consulta gobernada sobre la capa semántica → RLS
+ ejecuta → responde con **dato + métrica + período + estado** (certificado/exploratorio).

**Restricciones no negociables (guardas, no sugerencias):**

1. **Sin SQL libre contra la base.** El agente elige una **tool tipada** con parámetros validados
   `{métrica, dimensiones, filtros, período}`. Nunca concatena ni ejecuta SQL generado por el LLM.
2. **Solo métricas `certificada`.** Las `en_revision`/`deprecada` quedan fuera. Las
   `exploratoria` se responden **marcadas y visualmente distintas**, nunca como certificadas.
3. **RLS siempre.** Toda consulta lleva el contexto de seguridad del usuario. El agente no amplía
   su alcance.
4. **Ambigüedad → pedir aclaración.** No asume una interpretación.

Implementación: métricas como *tools* tipadas; el LLM elige tool + parámetros; el **código valida
y ejecuta**.

---

## 12. Gobernanza

- **Trazabilidad / linaje.** Cada tabla: `source_origen`, `extraido_en`, `proceso_transformacion`,
  `version_proceso`. Cada métrica: `version_definicion`, `fecha_certificacion`, `certificada_por`.
- **Roles.** Data Owner (certifica su dominio) / Data Steward (calidad + catálogo + glosario) /
  Data Engineer (pipelines, capas, mapeos) / BI Architect (semántica + agente) / Admin del portal
  (organizaciones, usuarios, RLS, secretos).
- **Acceso — dos controles independientes:**
  - **Autorización:** grants por rol / dominio / métrica (qué puede invocar).
  - **RLS:** scoping por empresa / sucursal / región / cartera (qué filas ve). Cambios de RLS =
    responsabilidad del admin **con auditoría** (sin aprobación múltiple).
- **Portal (plano de control).** Auditoría de todo cambio + versionado de metadatos. Es el
  objetivo de mayor valor: gobierna a la gobernanza; exige autorización fuerte.
- **Secretos por tenant.** Credenciales de conexión read-only en secrets manager por
  organización, **nunca** en el `metadata-store` ni en código.

---

## 13. Convenciones

- **No renombrar** tablas, columnas, endpoints, variables o métricas sin motivo técnico
  explícito; si lo haces, justifícalo en el PR.
- SQL/dbt: snake_case. TypeScript: camelCase para variables, PascalCase para tipos; modo strict,
  sin `any`, Zod para entradas externas.
- Toda métrica nueva o modificada pasa por el catálogo (§9) con su `estado`, `owner` y `aprobadores`.
- Nada de credenciales en código. Variables de entorno / secrets manager desde el inicio.
- Cambios en definiciones de métricas versionados — nunca editar en silencio una fórmula
  certificada; nueva versión y recertificación.
- Migraciones o cambios de schema: siempre con rollback (Nivel 2), nunca en silencio.

---

## 14. Prohibido (resumen de seguridad)

- Generar y ejecutar SQL arbitrario del LLM contra la base.
- Que el agente acceda a hechos crudos, staging o fuentes fuera de la capa semántica.
- Escribir en el ERP de origen o consultar sus tablas base fuera de la vía read-only aprobada.
- Recalcular una métrica fuera del catálogo.
- Devolver una respuesta sin la métrica y el período que la sustentan.
- Saltar o ampliar el RLS del usuario.
- Evolución de schema en Nivel 3 (auto-DDL sin revisión ni rollback).

---

## 15. Roadmap por fases (validar cada fase antes de avanzar)

0. **Fundación agnóstica** — estructura del repo + modelo canónico + esqueleto del metadata-store.
1. **Datos** — extracción read-only → Bronze; Silver (canónico + calidad + cuarentena); Gold.
2. **Semántica** — capa semántica + catálogo de metadatos + métricas del primer corte.
3. **Gobernanza** — linaje, roles, certificación multi-aprobador, RLS, tenencia.
4. **Agente** — tools tipadas + las 4 restricciones + guía proactiva.
5. **Portal (Etapa A)** — registrar org + editar mapeos/glosario/métricas + aprobaciones + RLS + auditoría.
6. **Consumo** — Power BI + demo NL end-to-end.
7. **Validación** — consistencia, confiabilidad/explicabilidad, seguridad/RLS, trazabilidad.

**Primer corte productivo:** order-to-cash (dominios `datos_maestros`, `ventas`, `tesoreria`,
`gobierno`; 5 métricas: Ventas Brutas, Devoluciones, Ventas Netas, Saldo CxC, Aging).

Avanza fase por fase y espera validación antes de continuar, salvo instrucción explícita de
entregar una fase completa de una vez.
