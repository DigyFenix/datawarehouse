# SESSION — datawarehouse

## Estado actual (2026-07-19)

**Fase 0 (Fundación agnóstica) COMPLETADA.** Motor en pie: git, estructura, Docker/Postgres
(medallion), metadata-store con DDL versionado + rollback, modelo canónico agnóstico, esqueletos
extracción (Python) y dbt. Tablero de avance: `ESTADO.md` (raíz).

**Portal (Fase 5) — FUNDACIÓN COMPLETA y verificada end-to-end en Docker** (motor común,
independiente de datos). Stack: **NestJS + Drizzle + Zod (API) · Angular (frontend) · nginx · Docker**.
Entregado y probado:
- Metadata-store de administración (organizaciones/usuarios/roles/usuario_roles/autorizaciones/auditoria) con DDL versionado + rollback + seeds (6 roles, org grupocresta).
- Backend: auth JWT+argon2 (guard global, admin de arranque por bootstrap), CRUD organizaciones, usuarios + asignación de roles, autorizaciones (grants), auditoría automática de cambios, health. Respuesta {success,data,error}, validación Zod.
- Frontend Angular (standalone): login, layout, organizaciones, usuarios/roles, auditoría.
- Docker perfil `portal`: `api` (:3001) + `web` nginx (:8080, proxy /api). `docker compose --profile portal up -d --build`.
- Admin dev: admin@grupocresta.local / admin_dev_2026 (cambiar).

**Pendiente portal (Etapa A restante):** mapeos ERP→canónico, glosario, catálogo de métricas +
certificación multi-aprobador, RLS (preview con datos depende de Fase 1-2).

**Frente Datos (Fase 1-2) — pipeline probado con datos sintéticos, sin HANA.** Verificado
end-to-end en dbt (24 modelos, 12 tests calidad, métricas correctas):
- Spec mapeo SAP B1→canónico + `organizaciones/grupocresta/mapeo/sap_b1/vistas-requeridas.md` (lo que Edwin debe exponer en HANA).
- Seeds sintéticos estilo SAP B1 (proavisa+loreto) = Bronze. Silver canónico + cuarentena. Gold estrella (dims con default + fct_ventas_facturacion + fct_cobros_cxc). 5 métricas verificadas.
- Falta (requiere HANA): extractor Python read-only → Bronze; escalar a otras 4 sociedades.
- dbt 1.12 + dbt-postgres instalados; profiles.yml.example usa env_var; correr con `set -a; source .env; set +a` y `--profiles-dir`.

**Frente B — Portal Etapa A COMPLETO y verificado end-to-end (2026-07-19):**
glosario, catálogo de métricas (CRUD + versionado) y **certificación multi-aprobador** (§9).
Backend NestJS + Angular. UI rediseñada con sistema de diseño propio (verde + ámbar, mono para
datos), patrón lista + **drawer** para crear/editar (con Editar en todas las entidades), toasts.
**Auditoría mejorada:** muestra el diff antes→después y filtros por acción/entidad/usuario.

**Repositorio publicado en GitHub:** https://github.com/DigyFenix/datawarehouse.git (branch
`master`). Primer commit 6f3c90e con toda la fundación + portal + pipeline dbt (2026-07-19).

**Pendiente Portal (cuando se retome):** editor de mapeos ERP→canónico y RLS.

**Estado global de frentes:**
- (a) Datos: pipeline dbt probado con sintéticos; **falta el extractor/transporte real desde HANA** (bloqueado por vistas + credenciales read-only de Edwin).
- (b) Portal: Fundación + Etapa A COMPLETOS y en GitHub. Falta mapeos + RLS.

## Marco del proyecto

Producto de producción multi-tenant (BI gobernado + agente IA), agnóstico a ERP. La tesis es
solo la **base conceptual**. Detalle en memoria: `naturaleza-proyecto`, `decisiones-arquitectura-datawarehouse`.

El `CLAUDE.md` del repo ya representa el marco real (producto), reescrito 2026-07-19.

## Fuente de verdad

- Arquitectura completa: `docs/arquitectura/` (README + 01 visión/principios, 02 técnica, 03 gobernanza, 04 roadmap).
- Repo = **base (motor común)** + `organizaciones/<tenant>/` (instancias independientes).
- Tenant activo: `organizaciones/grupocresta/` (avícola, multi-empresa).

## Decisiones clave (resumen)

- Dos planos: control (portal) + datos (medallion), unidos por `metadata-store`.
- Agnóstico: canónico + mapeos por ERP; **Silver = costura agnóstica**.
- Grano de hecho = **línea**. `dim_organizacion` = empresa→sucursal (default). Centro de costo y cuenta = dims aparte a nivel línea.
- Semántica de 3 ejes (definición / certificación / autorización). Catálogo de metadatos = el "mapa" del agente (no lee tablas físicas).
- Agente: guía proactiva + 4 restricciones duras (sin SQL libre, solo certificadas, RLS siempre, ambigüedad→pregunta).
- Certificación multi-aprobador; RLS = admin + auditoría.
- Portal Nivel 2 (migración versionada + rollback), nunca Nivel 3.
- Tenencia: instancia por tenant + `empresa_id`/RLS para las empresas del grupo.

## Infraestructura confirmada (2026-07-19)

- **ERP:** SAP Business One / HANA (cada sociedad = una BD HANA).
- **Motor plano de datos:** PostgreSQL (medallion en Docker local, `infra/local/`).
- **Extracción:** Python (read-only → Bronze).
- **Sociedades (6):** proavisa, loreto, organicos, sepesa, seragro, inavisa. **Piloto: proavisa + loreto.**

## FOCO PRÓXIMA SESIÓN (sesión 2) — Transporte y extracción de datos

Edwin lo definió como lo principal a construir en la siguiente sesión: el **extractor/transporte
de datos read-only desde HANA → Bronze** (Fase 1). Prerrequisitos de su lado: vistas HANA según
`organizaciones/grupocresta/mapeo/sap_b1/vistas-requeridas.md` + credenciales read-only en `.env`.
El pipeline dbt (Silver→Gold→métricas) ya está probado, así que al llegar los datos solo se
implementa el extractor Python en `data-plane/extraccion/`.

## Detalle Fase 1 (Datos), par piloto proavisa + loreto

1. Confirmar vía de extracción HANA: **vistas dedicadas read-only** (recomendado) vs Service Layer.
2. Extractores Python read-only SAP B1 → Bronze (facturas/NC, CxC, maestros) para el piloto.
3. Silver: mapeo `sap_b1`→canónico (`OINV/INV1/ORCT/OCRD/OITM/...`) + `dbt tests` calidad + cuarentena.
4. Gold: estrella (`fct_ventas_facturacion`, `fct_cobros_cxc`, dims con miembro default).
5. Validado el flujo, escalar a las otras 4 sociedades.

Detalle vivo del avance en `ESTADO.md`. DoD de Fase 0 (verificación Docker) documentado ahí,
pendiente de correr por Edwin cuando levante Docker.

## Alcance primer corte

Order-to-cash: dominios `datos_maestros`, `ventas`, `tesoreria`, `gobierno`; métricas Ventas
Brutas, Devoluciones, Ventas Netas, Saldo CxC, Aging (5 de 7). Rentabilidad = stretch.

## Bloqueantes

Ninguno. Para Fase 1 se necesita: acceso read-only a HANA (host/usuario/password en `.env`,
NUNCA en repo) y confirmar la vía de extracción. El grupo tiene más sociedades que las 6
registradas; se escala después del piloto.
