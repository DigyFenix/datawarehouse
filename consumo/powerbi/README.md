# Modelos Power BI

Un proyecto por organización, generado desde el esquema `oro` de su base:

| Proyecto | Base | Organización |
|---|---|---|
| `PulsoCresta.pbip` | `dw_grupocresta` | Grupo Cresta (SAP B1 / HANA) |
| `PulsoIronNetwork.pbip` | `dw_ironnetwork` | Iron Network (Odoo 18) |

Cada uno trae **18 tablas, 43 relaciones y 24 medidas DAX** ya definidas.

---

## Por qué PBIP y no PBIX

`.pbix` es un formato binario propietario: solo Power BI Desktop puede escribirlo. `.pbip` es la
versión **en carpeta y texto plano** del mismo proyecto — la que Microsoft creó justamente para
control de versiones. Se abre igual en Power BI Desktop y al guardar produce el `.pbix`.

Ventaja para nosotros: el modelo vive en git, se revisa en un *pull request* y se **regenera** con
un comando cuando cambia el warehouse. Un `.pbix` sería una caja negra binaria que nadie puede
revisar ni versionar.

---

## Requisitos, una sola vez

1. **Power BI Desktop** actualizado.
2. **Habilitar proyectos PBIP:** Archivo → Opciones y configuración → Opciones →
   *Características en versión preliminar* → marcar **«Guardar el modelo semántico con formato TMDL»**
   y **«Proyectos de Power BI (.pbip)»**. Reiniciar.
3. **Conector de PostgreSQL:** Power BI usa Npgsql. Si al refrescar pide instalarlo, seguir el
   enlace que muestra el propio Power BI.

---

## Abrir

Doble clic en `PulsoCresta.pbip`. Al primer refresco pide credenciales de PostgreSQL:

- Servidor: `localhost` (o el host del servidor donde corre el warehouse)
- Base de datos: `dw_grupocresta`
- Autenticación: **Básica**, con el usuario y contraseña del `.env` (`POSTGRES_USER` / `POSTGRES_PASSWORD`)
- Cifrado: desmarcar «Usar conexión cifrada» si el Postgres es local sin TLS

El servidor y la base son **parámetros** (`Servidor`, `BaseDatos`): para apuntar a otro entorno se
cambian en Transformar datos → Administrar parámetros, sin tocar las 17 consultas.

---

## Qué trae el modelo

**Hechos:** Ventas · Compras · Cartera por cobrar · Cartera por pagar · los dos históricos diarios.

**Dimensiones:** Calendario · Cliente · Proveedor · Producto · Vendedor · Empresa · Bodega ·
Moneda · Cuenta contable · Centro de costo · Tipo de documento.

**Medidas** en la tabla `_ Métricas`, agrupadas en carpetas: `01 Ventas` · `02 Rentabilidad` ·
`03 Compras` · `04 Cartera` · `05 Riesgo` · `06 Comparativos`.

### Decisiones que ya vienen aplicadas

| Decisión | Por qué |
|---|---|
| Relaciones **1:N unidireccionales** | el filtro bidireccional crea caminos ambiguos y hace que la misma medida dé números distintos según el visual |
| `Calendario` marcada como tabla de fechas (`dataCategory: Time`) | sin esto la inteligencia de tiempo (YTD, año anterior) falla en silencio |
| `discourageImplicitMeasures` | obliga a usar las medidas declaradas; nadie arrastra una columna y obtiene una suma que nadie definió |
| `summarizeBy: none` en todas las columnas | misma razón |
| Segunda relación con el calendario por fecha de vencimiento, **inactiva** | se invoca con `USERELATIONSHIP` solo donde el aging la necesita |
| Llaves y columnas técnicas ocultas | el usuario ve nombres de negocio, no `cliente_clave` ni `version_proceso` |
| `sortByColumn` en meses y días | sin esto «Febrero» sale después de «Diciembre» |

### La medida que cambia la lectura

`Cliente[es_intercompania]` separa a las empresas del propio grupo. En Proavisa **el 72.7 % de la
cartera es intercompañía**: sin separarla, el aging reporta una crisis de cobranza que no existe.
Por eso hay pares de medidas — `Saldo por cobrar` / `Saldo por cobrar terceros`,
`% Margen` / `% Margen terceros`.

---

## Las páginas

Tres páginas, 35 visuales. El hilo es el mismo del análisis: **la cartera no se puede leer sin
separar el saldo del grupo**.

### 1 · Pulso

Ocho tarjetas y dos gráficos. Arriba las cifras del período (ventas, margen, compras, posición
neta); debajo la fila que importa: **por cobrar a terceros** contra **por cobrar al grupo**, los
días de cartera reales y el margen de terceros.

- **Antigüedad de la cartera** — barras agrupadas por rango, partidas en azul (terceros) y naranja
  (grupo). Es el visual que hace evidente de un golpe que la mora se concentra en el saldo de casa.
- **Venta neta por día** — deja ver el patrón semanal y el disparo del cierre de mes.

### 2 · Cartera

Quién debe y desde cuándo. Tabla de saldo por cliente ordenada de mayor a menor (con la columna
que dice si es del grupo), saldo por antigüedad, y **mayor saldo vencido por cliente en rojo** —
ahí aparecen los dos clientes con el saldo íntegramente vencido.

### 3 · Ventas y rentabilidad

Ventas a terceros contra ventas al grupo, y los dos márgenes lado a lado: el total y el de
terceros. Abajo, venta por producto, margen por cliente y venta por día de semana.

**Segmentadores** en las tres páginas: período (`anio_mes`) y **¿Es empresa del grupo?**. Ese
segundo filtro es el que permite ver el negocio con y sin intercompañía en un clic.

> Las páginas se generan con `generar_reporte.py`. Un `report.json` son miles de líneas de JSON
> anidado y escapado (el `config` de cada visual es un JSON *dentro* del JSON): escribirlo a mano
> es garantía de error, así que se genera y se valida por código.

---

## Regenerar cuando cambie el warehouse

```bash
# modelo semántico (tablas, relaciones, medidas)
POSTGRES_HOST=localhost python consumo/powerbi/generar_pbip.py dw_grupocresta PulsoCresta consumo/powerbi

# páginas y visuales
python consumo/powerbi/generar_reporte.py consumo/powerbi/PulsoCresta.Report "Grupo Cresta"
```

**Cuidado:** `generar_reporte.py` **sobrescribe** `report.json`, así que se lleva los visuales que
hayas hecho a mano. Regenerá el modelo solo (el primer comando) cuando cambie el warehouse; corré
el segundo únicamente si querés volver al diseño base.

El generador **introspecciona la base**: tipos, columnas y relaciones salen del modelo real, así
que el PBIP no puede quedar desincronizado. Regenera el modelo; **no toca los visuales** que ya
hayas hecho (viven en la carpeta `.Report`).

> Al agregar tablas o columnas en Oro, regenerar y volver a abrir. Power BI Desktop no detecta
> cambios hechos por fuera mientras está abierto.

---

## Si algo falla al abrir

El modelo se generó y validó automáticamente (sintaxis TMDL, relaciones y referencias de medidas),
pero **no se pudo probar la apertura real en Power BI Desktop** desde el entorno de desarrollo.
Si Desktop reporta un error, dice el archivo y la línea exactos — mandámelo y lo corrijo.

Camino alternativo mientras tanto: Obtener datos → PostgreSQL → esquema `oro`, seleccionar las
tablas y crear las relaciones a mano siguiendo `data-plane/semantico/MODELO-POWER-BI.md`.
