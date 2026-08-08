# Convención de nombres — derivada del modelo, no impuesta

Cumple §5.3 del contrato maestro: *"Respetar la convención ya presente en las medidas
existentes. Derivarla del modelo, documentarla. **No imponer una convención nueva.**"*

Derivada por lectura de las **294 medidas** de `docs/powerbi/inventario-modelo.md`.

---

## 1. Tablas y columnas

| Elemento | Convención | Ejemplo |
|---|---|---|
| Dimensión | prefijo `DM_` + nombre de negocio en singular | `DM_Cliente`, `DM_Centro de costo` |
| Hecho | prefijo `FC_` + nombre del proceso en plural | `FC_Ventas`, `FC_Pagos recibidos` |
| Field parameter / grupo de cálculo | prefijo `MD_` | `MD_Vista de ventas` |
| Columna | `snake_case`, en español, sin prefijo | `saldo_pendiente`, `es_intercompania` |
| Clave sustituta | `<entidad>_clave` | `cliente_clave` |
| Bandera | `es_<condicion>` | `es_vencido`, `es_quiebre` |

Los prefijos ordenan el panel de campos: dimensiones, hechos y selectores quedan agrupados sin
depender de carpetas.

## 2. Medidas

**Sentence case en español, sin prefijo, sin notación húngara, sin unidad en el nombre** (la
unidad la da el `formatString`).

| Patrón | Forma | Ejemplos existentes |
|---|---|---|
| Importe base | sustantivo | `Ventas netas`, `Saldo por cobrar`, `Margen bruto` |
| Conteo | sustantivo plural | `Documentos de venta`, `Clientes con saldo` |
| Porcentaje | **empieza con `% `** | `% Margen terceros`, `% Vencido terceros` |
| Promedio | `<qué> promedio` | `Ticket promedio`, `Cobro promedio` |
| Período anterior | `<base> <período> anterior` | `Ventas mes anterior`, `Compras año anterior` |
| Acumulado | `<base> acumuladas <período>` | `Ventas acumuladas año` |
| Variación | `Variación <base> vs <comparable>` | `Variación vs año anterior` |
| Foto de hoy | sufijo ` hoy` | `Por cobrar terceros hoy`, `Posición neta hoy` |
| Alcance de grupo | sufijo ` terceros` / ` grupo` | `Ventas a terceros`, `Saldo por pagar grupo` |
| Días | `Días de <concepto>` | `Días de cartera terceros`, `Días de inventario` |

**Regla heredada y no negociable:** una medida que **declara su alcance en el nombre lo
conserva** ante el segmentador de ese eje, y respeta todos los demás filtros. `Ventas a terceros`
sigue siendo de terceros aunque alguien seleccione "intercompañía"; sigue respetando fecha,
empresa y producto.

## 3. Carpetas de visualización

Numeradas con dos dígitos para forzar el orden, con nombre temático:
`01 Importes` · `02 Conteos` · `03 Promedios` · `04 Comparativos` · `05 Rentabilidad` ·
`06 Pareto` · `07 Fugas de margen`…

**Dos carpetas nuevas obligatorias para lo que se cree en F4** (§5.3):

| Carpeta | Contenido | Visibilidad |
|---|---|---|
| `_Narrativa` | medidas que devuelven **texto** para títulos dinámicos | visible |
| `_Auxiliar` | medidas intermedias, no destinadas al usuario final | `isHidden: true` |

El guion bajo las ordena al final del panel, separadas de las medidas de negocio.

## 4. Descripciones

**Las 294 medidas tienen descripción y las nuevas también la llevan.** La convención observada
—y que se mantiene— es que la descripción explica **la regla de negocio o la trampa de lectura,
no la fórmula**:

> `Ventas a terceros` — *El mercado real. La venta al grupo no compite por precio: mezclarla
> distorsiona todo indicador comercial.*

No:

> ~~*Suma de monto_sin_impuesto donde es_intercompania = 0.*~~

La fórmula ya está en el DAX; la descripción existe para que quien lee el tablero no interprete
mal el número.

## 5. Antes de crear una medida (§3.1)

Verificar **en este orden**, y crearla solo si las cuatro respuestas son "no":

1. ¿Existe ya con otro nombre?
2. ¿Existe alguna que pueda **componerse** para obtenerla?
3. ¿Existe el cálculo a otra granularidad?
4. ¿Se resuelve con un **field parameter** en vez de N medidas? — hay 6 ya construidos.

**Y una regla operativa propia de este repo:** la medida se escribe en `generar_pbip.py`
(`MEDIDAS_POR_TABLA`), **nunca directamente en el `.tmdl`**. El generador reescribe todos los
TMDL en cada corrida; una medida escrita a mano sobrevive hasta la siguiente regeneración y
desaparece sin dejar error.
