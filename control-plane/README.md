# control-plane — Plano de control (Portal)

Administra los metadatos (organizaciones, mapeos, glosario, métricas, roles, RLS). **No mueve
datos.** Escribe en el `metadata-store`; el plano de datos lo lee.

- `portal/` — frontend admin (Node/TS). Se llena en **Fase 5**.
- `api/` — API del portal sobre el `metadata-store` (Node/TS). Se llena en **Fase 5**.

Estado actual: esqueleto. Ver `docs/arquitectura/03-gobernanza-y-seguridad.md`.
