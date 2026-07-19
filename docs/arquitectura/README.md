# Arquitectura — Plataforma de BI Gobernada con Agente de IA

Documentación de arquitectura del proyecto. Es la **fuente de verdad** de las decisiones de
diseño. Todo cambio estructural se refleja aquí antes de implementarse.

## Qué es este proyecto (en una línea)

Una plataforma **multi-tenant, gobernada y agnóstica a ERP** que permite a un usuario de
negocio consultar datos en lenguaje natural, recibiendo respuestas basadas **únicamente en
métricas certificadas, con control de acceso y trazabilidad completa**. Producto de
producción para la empresa; base conceptual tomada de la tesis de maestría de E. Chacón.

## Cómo leer esta documentación

| Documento | Contenido |
|-----------|-----------|
| [01 · Visión y Principios](01-vision-y-principios.md) | Qué es, alcance, no-objetivos, principios rectores, decisiones y trade-offs |
| [02 · Arquitectura Técnica](02-arquitectura-tecnica.md) | Dos planos, capas de datos, modelo canónico, dominios, semántica, agente, mapeo ERP |
| [03 · Gobernanza y Seguridad](03-gobernanza-y-seguridad.md) | Roles, certificación, acceso, RLS, tenencia, portal, auditoría |
| [04 · Roadmap](04-roadmap.md) | Fases de construcción, primer corte productivo, criterios de aceptación |

## Estructura del repositorio (objetivo)

Este repositorio es la **base (plantilla y motor común)**. Cada organización-cliente (tenant)
se instancia como un **proyecto independiente** bajo `organizaciones/`, con sus propias
especificaciones, mapeos, glosario, métricas y políticas. La base provee el motor; cada
organización aporta su configuración. Los proyectos son **independientes entre sí**.

```
/
├── docs/arquitectura/         # esta documentación (base)
│
│   ── BASE (motor común, agnóstico) ──
├── control-plane/             # PORTAL (plano de control)
│   ├── portal/                #   frontend de administración
│   └── api/                   #   API: escribe metadatos, genera migraciones (Nivel 2)
├── metadata-store/            # CONTRATO entre planos: estructura del catálogo, mapeos, glosario, políticas
├── data-plane/                # SISTEMA DE DATOS (plano de datos)
│   ├── canonico/              #   modelo canónico agnóstico (entidades + contratos)
│   ├── mapeos/                #   plantillas de mapeo por ERP: sap_b1/ , odoo/
│   ├── dominios/              #   ventas/ inventario/ tesoreria/ ... (nombres claros)
│   ├── semantico/             #   catalogo/ metricas/ glosario/  (motor)
│   ├── agente/                #   tools tipadas + guardas + API
│   └── gobierno/              #   roles, RLS, políticas (motor)
│
│   ── INSTANCIAS (una por organización-cliente, independientes) ──
├── organizaciones/
│   └── grupocresta/           # proyecto del tenant: specs + config + metadatos propios
│       ├── especificaciones.md
│       ├── config/            #   conexión, registro de empresas del grupo
│       ├── mapeo/             #   mapeo ERP→canónico específico del tenant
│       ├── glosario/          #   vocabulario del tenant (avícola)
│       ├── metricas/          #   catálogo de métricas del tenant (estados, owners, aprobadores)
│       └── gobierno/          #   roles, grants y políticas RLS del tenant
│
└── infra/                     # IaC por tenant (base + portal por organización)
```

> **Base vs instancia:** el motor (canónico, pipelines genéricos, semántica, agente, portal)
> vive en la base y es igual para todos. Lo que cambia por organización —conexión, ERP elegido,
> mapeo, glosario, valores del catálogo de métricas, RLS, empresas— vive en su carpeta bajo
> `organizaciones/`. Cambiar o dar de alta una organización no toca el motor.

## Glosario de términos clave

| Término | Significado en este proyecto |
|---------|------------------------------|
| **Tenant / Organización** | Cliente o grupo (holding). Frontera de instalación: base y portal propios. |
| **Empresa / Sociedad** | Entidad legal dentro de un tenant. Comparte tablas, se distingue por `empresa_id` + RLS. |
| **Plano de control** | El portal: donde se administran los metadatos. No mueve datos. |
| **Plano de datos** | Pipelines + semántica + agente: leen los metadatos y actúan. |
| **Metadata-store** | Almacén de metadatos que sirve de contrato entre ambos planos. |
| **Modelo canónico** | Modelo de datos genérico, independiente del ERP. |
| **Métrica certificada** | Definición de negocio única, aprobada, que el agente puede usar. |
| **Nivel 1 / Nivel 2** | Evolución de schema: config-driven (1) / migración gobernada con rollback (2). |

## Estado y versionado

- **Versión:** 1.0 (línea base de arquitectura)
- Los cambios de arquitectura se versionan aquí. Las definiciones de métricas y schemas se
  versionan en el `metadata-store`, no en silencio.
