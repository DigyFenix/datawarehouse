# Modelos Power BI

Un proyecto por organización, generado desde el esquema `oro` de su base:

| Proyecto | Base | Organización |
|---|---|---|
| `PulsoCresta.pbip` | `dw_grupocresta` | Grupo Cresta (SAP B1 / HANA) |
| `PulsoIronNetwork.pbip` | `dw_ironnetwork` | Iron Network (Odoo 18) |

Cada uno trae **32 tablas, 92 relaciones y 180 medidas DAX** ya definidas, más el grupo de
cálculo **«Moneda de análisis»** (Quetzales ↔ moneda original del documento). Además de las
dimensiones por rol (Cliente / Proveedor), el modelo incluye **`DM_Socio de negocio`**: la
vista consolidada de la maestra (unificada por NIT vía `socio_unificado`) relacionada a los
hechos por `socio_clave`, para el análisis 360° de un socio sin perder los rieles del rol.

Las tablas llevan **prefijo de rol** para que el usuario identifique en el panel de campos qué
tabla filtra y qué tabla mide: `DM_` dimensión · `FC_` hecho · `MD_` solo medidas (el grupo de
cálculo). Los prefijos los aplica `generar_pbip.py`; las expresiones DAX del generador se
mantienen con los nombres legibles y las referencias se renombran al generar.
*PulsoCresta ya está regenerado con esta convención; PulsoIronNetwork la toma en su próxima
regeneración.*

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

**Hechos:** Ventas · Compras · Cartera por cobrar · Cartera por pagar · los dos históricos
diarios · Pagos recibidos · Pagos efectuados · Inventario.

**Dimensiones:** Calendario · Cliente · Proveedor · Producto · Vendedor · Empresa · Bodega ·
Moneda · Cuenta contable · Centro de costo · Tipo de documento · Antigüedad · Clasificación ABC
(clientes y proveedores).

**Medidas** repartidas en su hecho (Ventas 36, Compras 22, Cartera 18+9, Pagos 6+7, Inventario 5,
ABC 10+9), en carpetas `01 Importes` … `06 Comparativos`. Todas las de importe llevan formato
**Q sin decimales**; los comparativos de tiempo (mes anterior, año anterior, acumulados MTD/QTD/YTD,
acumulado del año anterior, 12 meses móviles) existen para ventas, compras y pagos.

**«Moneda de análisis»** (grupo de cálculo, se usa como segmentación): *Quetzales (local)* deja
todo como está; *Moneda original* conmuta las medidas base de importe a la moneda del documento —
tiene sentido leyéndolo **con un filtro de Moneda activo** (sumar USD con GTQ no es un número).

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

Cinco páginas, 99 visuales. El hilo es el mismo del análisis: **la cartera no se puede leer sin
separar el saldo del grupo**.

### 1 · Pulso (portada)

La página de venta. Banda hero marina con los segmentadores de **Trimestre** (abre
preseleccionado en el **trimestre en curso** — la selección se recalcula al regenerar, sin
fechas quemadas) y **Empresa**. Debajo, cinco tarjetas compuestas construidas en capas con
visuales nativos (panel + acento de color + valor + variación): venta del trimestre vs año
anterior, acumulado del año, margen de terceros, por cobrar a terceros y posición neta.

- Las tarjetas de cartera usan las medidas **«hoy»** (`REMOVEFILTERS` del calendario): el saldo
  es una **foto**, no un flujo — recortarlo al trimestre ocultaría la mora vieja.
- **¿Quién debe la cartera?** — columnas agrupadas por antigüedad, azul (terceros) vs naranja
  (grupo): el visual que revela de un golpe que la mora se concentra en el saldo de casa.
- **El ritmo del trimestre** — venta por día con su media móvil de 30 días.
- Abajo: dona terceros vs grupo, top 7 clientes del trimestre y resultado por sociedad.

### 2 · Ventas y rentabilidad — 3 · Clientes ABC — 4 · Cartera — 5 · Compras

Las páginas de análisis: venta mensual con media móvil y desempeño por vendedor; el catálogo
ABC con el Pareto de clientes; antigüedad de cobrar/pagar con deudores y acreedores; y compras
por proveedor, producto y centro de costo.

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

## Flujo recomendado: modelo publicado + tableros aparte

El modelo semántico se **publica al servicio de Power BI** (abrir el PBIP en Desktop → Publicar)
y los dashboards se construyen en **otro archivo** conectado en vivo a ese modelo publicado
(Obtener datos → *Modelos semánticos de Power BI*). Así, cuando el modelo se regenere y se
vuelva a publicar, los tableros toman las medidas nuevas **sin perder ningún análisis**: el
análisis vive en un archivo que nadie regenera.

## Publish to Web (portal de usuario) — reglas verificadas

Los dashboards se publican con **Publish to Web** y se dan de alta en el portal admin
(módulo Portal usuario) para que el portal de usuario los muestre por perfil. **Riesgo
aceptado:** la URL es pública y sin RLS; el portal solo controla quién la ve y audita cada
apertura. Restricciones de Microsoft que condicionan el flujo:

1. **Modelo y dashboards en el MISMO workspace.** Un informe conectado a un modelo semántico
   de otro workspace NO se puede publicar a la web.
2. **Toda medida vive en el MODELO** (regenerar PBIP), nunca en el archivo del dashboard —
   los informes con medidas a nivel de informe no son compatibles con Publish to Web.
3. No usar: RLS, DirectQuery, visuales R/Python, informes paginados.
4. **Validar con un embed code de prueba** antes de construir todos los dashboards.
5. Requisitos: licencia **Pro** de quien publica + tenant setting *Publish to web* habilitado
   (admin de Fabric). Un embed code por informe.
6. **Refresco:** el modelo importado contra Postgres requiere un **on-premises data gateway**
   (Windows, gratuito, con salida al Postgres del VPS) para el refresco programado; al
   refrescar, el caché público (~1 h) se limpia solo. No abusar de la frecuencia.

---

## Si algo falla al abrir

El modelo se generó y validó automáticamente (sintaxis TMDL, relaciones y referencias de medidas),
pero **no se pudo probar la apertura real en Power BI Desktop** desde el entorno de desarrollo.
Si Desktop reporta un error, dice el archivo y la línea exactos — mandámelo y lo corrijo.

Camino alternativo mientras tanto: Obtener datos → PostgreSQL → esquema `oro`, seleccionar las
tablas y crear las relaciones a mano siguiendo `data-plane/semantico/MODELO-POWER-BI.md`.
