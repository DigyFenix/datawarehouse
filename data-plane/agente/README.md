# @quilate/agente — agente de IA gobernado

Paquete de **dominio**: tools tipadas, guardas y el loop del agente. No conoce NestJS ni
`pg` — el host le inyecta un `EjecutorSql` y una función de auditoría. Por eso las guardas se
prueban sin base de datos, y el mismo código puede montarse en otro host (hoy vive detrás del
API del portal de usuario, `consumo/portal/api/src/agente/`).

```
src/
├── tipos.ts              contratos (EjecutorSql, AlcanceEfectivo, TarjetaDato, ConfigAgente)
├── tools/
│   ├── esquemas.ts       schemas Zod estrictos + definiciones para el API de Anthropic
│   ├── consultas.ts      TODO el SQL, como constantes con placeholders $1..$n
│   └── ejecutar.ts       validar → autorizar → ejecutar → construir tarjetas
├── alcances.ts           alcance efectivo del usuario (perfil_alcances ∩ catálogo)
├── catalogo.ts           fichas de métrica y glosario (BD de control)
├── prompt.ts             system prompt construido por request desde el catálogo autorizado
├── agente.ts             loop de tool-use contra el SDK de Anthropic
└── guardas.spec.ts       las restricciones de CLAUDE.md §11, con ejecutor falso
```

## Las restricciones y dónde viven

| Restricción (CLAUDE.md §11) | Dónde se cumple | Cómo se prueba |
|---|---|---|
| 1. Sin SQL libre | `tools/consultas.ts` (constantes) + `esquemas.ts` (Zod `.strict()`, regex en claves) | test estático de que ninguna plantilla interpola; inyección en `metrica_clave` rechazada por Zod |
| 2. Solo métricas certificadas | `SQL_METRICAS_CONSUMIBLES` es el único punto que lee estado | una métrica en borrador no entra al prompt ni se puede consultar |
| 3. RLS siempre | `alcances.ts` + `empresa_id = any($n)` en toda consulta | pedir una empresa ajena se deniega antes de tocar la base; sin alcance, cero filas |
| 4. Ambigüedad → aclarar | `prompt.ts` | reforzado por diseño: las tools exigen una clave exacta |
| 5. Dato + métrica + período + estado | `TarjetaDato` se arma del catálogo y del SQL | toda tarjeta lleva los cuatro campos |

El **RLS de Postgres es el piso** debajo de la guarda 3: el host ejecuta cada consulta con el
rol `portal_lector` (NOBYPASSRLS) dentro de una transacción que fija `app.empresas`. Si un bug
de este paquete dejara pasar una empresa no autorizada, la base igual no la devuelve.

## Cómo lo usa el host

```ts
import { responder } from '@quilate/agente';

const { texto, tarjetas } = await responder({
  ejecutor,      // consultarTenant (bajo RLS) + consultarControl (catálogo)
  config,        // apiKey, modelo, empresas, glosario, frescura, fecha
  usuarioId,     // resuelve sus alcances
  historial,     // turnos previos (solo texto)
  mensaje,
  auditar,       // persiste consulta_agente / consulta_agente_denegada
});
```

## Desarrollo

```bash
npm install
npm run build   # dist/ — el API lo consume como dependencia "file:"
npx jest        # guardas
```

En Docker lo compila la primera etapa del `Dockerfile` del portal de usuario; el `file:` obliga
a preservar la estructura de carpetas del repo dentro de la imagen (ver el comentario del
Dockerfile).
