# data-plane — Plano de datos

**Lee** los metadatos y actúa: extrae (read-only), transforma (medallion) y responde. No
administra metadatos (eso es el `control-plane`).

| Carpeta | Rol | Fase |
|---------|-----|------|
| `canonico/` | Modelo canónico agnóstico (contrato que Silver debe cumplir) | 0 |
| `mapeos/sap_b1/` · `mapeos/odoo/` | Plantillas de mapeo ERP→canónico | 1 (sap_b1) |
| `dominios/` | Organización por dominio de negocio (ventas, tesoreria, ...) | 1–2 |
| `extraccion/` | Extractores Python read-only ERP → Bronze | 0 (esqueleto) / 1 |
| `transformacion/` | Proyecto dbt: Bronze→Silver→Gold + tests + cuarentena | 0 (esqueleto) / 1 |
| `semantico/` | Catálogo, métricas y glosario (capa semántica) | 2 |
| `agente/` | Tools tipadas + guardas + API del agente | 4 |
| `gobierno/` | Roles, RLS y políticas | 3 |

**Silver es la costura agnóstica** (`CLAUDE.md` §6): Bronze es distinto por ERP; de Silver hacia
arriba todo es idéntico. No se salta.
