# DESIGN.md — Portal admin (plano de control)

Desde la sesión 37 (2026-10-31) el plano de control usa **el mismo sistema visual «Espacio de
trabajo» del portal de usuario**: `src/styles.css` es una copia de
`consumo/portal/web/src/styles.css` (más `.badge--ok` y `.badge--global`, propios de aquí) y los
componentes de `src/app/ui/` son copias de los del portal de usuario. La guía completa vive en
`consumo/portal/web/DESIGN.md`; este archivo solo registra lo que cambia aquí.

## Qué se retiró
- Space Grotesk, Inter y JetBrains Mono (self-hosted) → **Geist** y Geist Mono (solo datos/código).
- Barra lateral oscura y login oscuro → barra clara, login centrado.
- Eyebrows, `th` y `h4` en mono y mayúsculas → caja normal.
- `confirm()` del navegador → `ConfirmService` + `<app-confirm>` (montado en el layout).
- Pie «Instancia local · dev».

## Navegación
Cuatro grupos en el orden en que se trabaja: **Clientes** (Organizaciones, Conexiones al ERP,
Sociedades, Portal del cliente) · **Datos** (Ingesta, Modelo canónico) · **Semántica** (Métricas,
Glosario) · **Acceso** (Usuarios y roles, Autorizaciones, Auditoría). La franja superior dice qué
organización se está configurando; las pantallas de catálogo del producto lo aclaran («aplica a
todas las organizaciones»).

## Patrones de uso (aprobados por Edwin, tomados de crestacore)
Estado vacío con causa · un buscador por lista · claves técnicas generadas desde el nombre
(slug editable) · etiquetas legibles, nunca valores crudos ni jerga de consola · borrador en
memoria con «N cambios sin guardar» · toasts que dicen el siguiente paso · botón ocupado con
spinner y gerundio · todo borrado confirmado en diálogo · contraseñas temporales generadas con
Copiar.

## Reglas
- Cambiar la paleta o la tipografía es tocar `styles.css` de los DOS portales (son copia).
- No reintroducir mono como «costume técnico»; el color de marca solo en selección, acciones y
  estados.
