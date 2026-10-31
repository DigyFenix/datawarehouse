# DESIGN.md — Portal de usuario (Quilate Analytics)

Sistema visual «Espacio de trabajo» (sesión 36, 2026-10-31). Reemplaza al anterior «Mesa de
gobierno» (barra lateral oscura, Space Grotesk + Inter + JetBrains Mono, etiquetas en mono y
mayúsculas), que Edwin describió como arcaico y complicado.

## Modo y tesis
- **Operate.** La herramienta desaparece detrás de la tarea: patrones que cualquier usuario
  de software moderno reconoce (barra lateral clara, contenido centrado, tablas aireadas).
- El color de marca del tenant (`--marca`, lo fija el runtime) aparece solo en selección,
  acciones primarias, avatar y acentos de estado. Nunca de decoración ni como fondo de bloque.

## Tipografía
- **Una familia:** Geist (variable 300–800, self-hosted en `src/assets/fonts/geist-variable.woff2`).
  `--display` es un alias de `--sans`: no hay fuente de títulos aparte.
- **Geist Mono** solo para `code` y celdas de datos; los metadatos (fechas, períodos) van en
  sans con `font-variant-numeric: tabular-nums`.
- Escala fija: 11 / 12 / 13 / 14 / 16 px; h1 28, h2 22. Pesos 500 (UI) y 600 (títulos).
- Sin mayúsculas con tracking: `.eyebrow`, `th`, `h4` y los rótulos de grupo van en caja normal.

## Color y superficies
- Lienzo `#f6f7f9`, superficie `#fff`, hairlines `#e6e8ee` / `#d5d9e2`, texto `#0f172a`.
- Elevación una sola vez: hairline en reposo; sombra (`--sh-pop`) solo en lo que flota
  (menús, drawer, diálogo, toasts).
- Radios 8 (controles), 10 (botones/inputs), 12 (tarjetas), 16 (diálogos), 20 (login).
- Modo oscuro con los mismos tokens, por sistema o por toggle (`[data-theme]`).

## Componentes
- Barra lateral 256 px, blanca, con logo del cliente, menú por grupos (Explorar, Autoservicio,
  Organización) y la cuenta al pie con botón de salir.
- Franja superior 56 px, translúcida, con «Organización / Sección» y el selector de tema.
- Pestañas = control segmentado (`app-tabs`). Botones 38 px (min-height), inputs 38 px,
  botones pequeños 32 px. Badges sin borde, con punto de estado.
- Tablas: encabezado en superficie blanca, filas de 44 px, hover suave, sin zebra.
- Chat: burbuja del usuario en tinte de marca (`--brand-100`), compositor en tarjeta con foco.

## Reglas
- No reintroducir mono como «costume técnico»; tampoco bordes laterales gruesos de color.
- Todo color nuevo nace como token en `styles.css` (claro + oscuro), nunca fijo en un componente.
- Los componentes usan los nombres de token existentes: cambiar la paleta es tocar `:root`.
