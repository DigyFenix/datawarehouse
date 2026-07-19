# Organizaciones (instancias por tenant)

Cada subcarpeta es un **proyecto independiente** de una organización-cliente (tenant). La base
del repositorio provee el motor común; cada organización aporta aquí su configuración y
especificaciones propias.

## Regla

- **Un tenant = una carpeta = una instancia** (base + portal propios en despliegue).
- Las carpetas son **independientes entre sí**: cambiar una no afecta a las demás.
- Dentro de un tenant, sus **empresas/sociedades** (p. ej. las del grupo) **no** son carpetas:
  comparten tablas con `empresa_id` + RLS. Se registran en `config/empresas.md`.

## Contenido esperado de cada tenant

```
<tenant>/
├── especificaciones.md   # ficha, ERP, alcance, estado, pendientes
├── config/               # conexión read-only (referencia a secrets), registro de empresas
├── mapeo/                # mapeo ERP→canónico específico
├── glosario/             # vocabulario del negocio
├── metricas/             # catálogo de métricas del tenant (estados, owners, aprobadores)
└── gobierno/             # roles, grants, políticas RLS
```

> Las credenciales de conexión **nunca** se guardan aquí: van a un secrets manager por tenant.
> En `config/` solo se referencia el secreto, no su valor.

## Organizaciones registradas

| Tenant | Sector | ERP | Estado |
|--------|--------|-----|--------|
| [grupocresta](grupocresta/) | Avícola (venta de huevos) | Por confirmar | En arranque (Fase 0) |
