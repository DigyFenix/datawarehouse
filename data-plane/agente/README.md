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
├── prompt.ts             system prompt por request (2 bloques cacheados; la fecha va en el mensaje)
├── compuerta.ts          clasificador barato: intención, métricas candidatas, período, empresa, ambigüedad
├── agente.ts             turno completo: repetición → compuerta → loop → anclaje → sugerencias/contexto
├── grounding.ts          anclaje de cifras: todo número del texto debe salir de las tools; si no, plantilla
├── acciones.ts           botones, sugerencias y repeticiones: ejecutan la tool SIN modelo
├── formato.ts            moneda del tenant, 0/1 decimales, «marzo 2026», delimitador <dato>
├── unidades.ts           unidad (moneda/porcentaje/número) y corte (dato más reciente) por métrica
├── guardada.ts           reejecución de consultas guardadas (sin modelo) + validación de la especificación
├── descargas.ts          descarga a Excel (derivadas por mes vía sus operandos)
└── *.spec.ts             restricciones de CLAUDE.md §11, anclaje, compuerta e integración del loop
eval/
├── casos.json            20 casos del informe de auditoría (con guion para el modo determinista)
├── laboratorio.ts        warehouse falso + cliente de Anthropic guionado (también lo usan los tests)
├── eval.ts               `npm run eval` — métricas y umbrales; resultados en eval/resultados/
└── tsconfig.json         compila eval + src a eval/.dist (ignorado por git)
```

## Las restricciones y dónde viven

| Restricción (CLAUDE.md §11) | Dónde se cumple | Cómo se prueba |
|---|---|---|
| 1. Sin SQL libre | `tools/consultas.ts` (constantes) + `esquemas.ts` (Zod `.strict()`, regex en claves) | test estático de que ninguna plantilla interpola; inyección en `metrica_clave` rechazada por Zod |
| 2. Solo métricas certificadas | `SQL_METRICAS_CONSUMIBLES` es el único punto que lee estado | una métrica en borrador no entra al prompt ni se puede consultar |
| 3. RLS siempre | `alcances.ts` + `empresa_id = any($n)` en toda consulta | pedir una empresa ajena se deniega antes de tocar la base; sin alcance, cero filas |
| 4. Ambigüedad → aclarar | `compuerta.ts` (`es_ambigua`) + `acciones.ts`: el CÓDIGO pregunta con botones; `prompt.ts` como respaldo | la compuerta ambigua no llama al modelo principal y devuelve ≥ 2 opciones validadas |
| 5. Dato + métrica + período + estado | `TarjetaDato`/`ConjuntoDatos` del catálogo y del SQL, con `empresas`, `unidad` y `corte` | toda tarjeta lleva los campos |
| Anti-alucinación | `grounding.ts`: cada cifra del texto (miles/decimales es-GT, %, años, YYYY-MM, fechas) debe existir en tarjetas/filas/períodos, ser un entero ≤ 50 o la diferencia/suma/razón de dos valores devueltos | una cifra inventada se reemplaza por la plantilla y se audita `respuesta_regenerada` con el original (`textoRegenerado: true`) |

El **RLS de Postgres es el piso** debajo de la guarda 3: el host ejecuta cada consulta con el
rol `portal_lector` (NOBYPASSRLS) dentro de una transacción que fija `app.empresas`. Si un bug
de este paquete dejara pasar una empresa no autorizada, la base igual no la devuelve.

## Tools (5)

| Tool | Devuelve | Lee |
|---|---|---|
| `listar_metricas_disponibles` | catálogo autorizado | alcance |
| `consultar_metrica` | serie mensual (+ empresa) | `oro.metrica_valor` |
| `consultar_metrica_por_dimension` | ranking por cliente/producto/línea/vendedor/canal/sector/proveedor | `oro.metrica_valor_dimension` (solo métricas «desglosables»: `oro.metrica_dimension_catalogo`) |
| `consultar_aging` | antigüedad por rango o por socio | `oro.metrica_aging` |
| `explicar_metrica` | ficha de gobierno | catálogo de control |

Toda respuesta con dato trae, además del texto y las tarjetas, `conjuntos` (tabla tipada:
serie / ranking / aging) y `consultas` (tool + parámetros YA validados). Eso último es lo que el
portal guarda como **consulta guardada**: nunca el resultado. Al abrirla, `ejecutarGuardada`
vuelve a pasar por Zod, catálogo, alcance de QUIEN la abre y RLS; si la métrica dejó de ser
consumible, no se ejecuta y dice por qué.

## Turno del chat

1. **Repetición** — si el mensaje repite una pregunta ya respondida con datos (o dice «repite»,
   «actualiza»), se reejecutan sus consultas sin modelo. El host pasa `turnosPrevios`
   (`SQL_TURNOS_CON_CONSULTAS` + `turnosDesdeFilas`).
2. **Compuerta** (`AGENTE_MODELO_COMPUERTA`) — salida estructurada `{intencion, metricas_candidatas[],
   periodo_detectado, empresa_detectada, es_ambigua}`, intersectada con el alcance. Saludo, tema
   ajeno o manipulación → texto fijo. Ambigua → `PREGUNTA_AMBIGUA` + `opciones` (botones).
3. **Loop** — tools estrictas; `listar_metricas_disponibles` con enum de dominios del alcance;
   rankings y socios al modelo solo top 5 + total (la UI recibe todo); datos del ERP/glosario
   delimitados `<dato>…</dato>` (80 caracteres, una línea). El modelo solo registra solicitudes
   `fuera_catalogo` y `frescura`. Sin `temperature`: Opus 5/5.5 y Haiku 5.5 responden 400 a
   cualquier parámetro de muestreo.
4. **Anclaje** — claves técnicas → nombre oficial; verificación de cifras; plantilla si falla.
5. **Sugerencias** (2-3, código) y **contexto** `{empresa_id, periodo}` actualizado; el host lo
   persiste en `portal.chat_conversaciones.contexto` (migración 142) y lo devuelve en
   `config.contexto` para el bloque dinámico del prompt.

Un clic en una opción o sugerencia va a `ejecutarAccion` (host: `POST
/agente/conversaciones/:id/accion`): valida con el Zod de la tool, ejecuta con las mismas
guardas y redacta con la plantilla, sin modelo.

## Evaluación

```bash
npm run eval                 # determinista (guion por caso, sin red): pipeline completo
EVAL_REAL=1 npm run eval     # modelo real (ANTHROPIC_API_KEY) contra el warehouse falso; 3 corridas por caso
EVAL_CASOS=D1,AM1 npm run eval
```

Mide exactitud tool+params, aclaraciones, rechazos, alucinaciones (cifras sin respaldo que llegan
al usuario; las regeneradas se cuentan aparte), tokens y latencia. Umbrales del gate: ≥ 90 %
tool/params, 100 % rechazos, 0 alucinaciones, p95 < 8 s; sale con código 1 si alguno falla.
Variables: `EVAL_CORRIDAS`, `EVAL_MODELO` (default `claude-opus-5`), `EVAL_MODELO_COMPUERTA`.
El modo determinista prueba el código (guardas, anclaje, botones), no la puntería del modelo:
antes de desplegar un cambio de prompt o de modelo hay que correr el modo real.

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
npx jest        # guardas, anclaje, compuerta, integración
npm run eval    # evaluación determinista
```

En Docker lo compila la primera etapa del `Dockerfile` del portal de usuario; el `file:` obliga
a preservar la estructura de carpetas del repo dentro de la imagen (ver el comentario del
Dockerfile).
