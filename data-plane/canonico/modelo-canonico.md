# Modelo canónico agnóstico — v2

Contrato **agnóstico al ERP** que la capa **Plata** debe cumplir (la costura agnóstica,
`CLAUDE.md` §6). Bronce es distinto por ERP; de Plata hacia arriba todo es idéntico.

**Ningún nombre de este modelo proviene de un ERP.** El mapeo ERP→canónico vive en los paquetes
base (`../mapeos/sap_b1/`, `../mapeos/odoo/`) y en los seeds del metadata-store.

- Diseño completo con campos y mapeo por ERP: [`DISENO-plata-oro.md`](DISENO-plata-oro.md)
- Decisiones, evidencia y validación en vivo: [`PROPUESTA-canonico-v2.md`](PROPUESTA-canonico-v2.md)
- Canónico v1 (retirado, solo referencia): [`_retirado_v1/`](_retirado_v1/)

---

## Alcance

**Order-to-cash + procure-to-pay.** Dominios `datos_maestros`, `ventas_compras`, `tesoreria`,
`finanzas`, `gobierno`.

Validado contra dos ERPs reales con perfiles opuestos: **SAP Business One / HANA** (Grupo Cresta,
~2.5M filas) y **Odoo 18** (Iron Network, ~5k filas).

---

## Entidades (13)

### Maestros

| Entidad | Rol | Contrato |
|---|---|---|
| `socio_negocio` | Cliente **y** proveedor unificados | [`socio_negocio.yml`](entidades/socio_negocio.yml) |
| `producto` | Producto / artículo | [`producto.yml`](entidades/producto.yml) |
| `vendedor` | Vendedor (opcional, con default) | [`vendedor.yml`](entidades/vendedor.yml) |
| `organizacion` | Empresa (sociedad) | [`organizacion.yml`](entidades/organizacion.yml) |
| `almacen` | Bodega | [`almacen.yml`](entidades/almacen.yml) |
| `cuenta` | Plan contable — **clasifica la cartera** | [`cuenta.yml`](entidades/cuenta.yml) |
| `centro_costo` | Centro de costo (nivel línea) | [`centro_costo.yml`](entidades/centro_costo.yml) |
| `moneda` | Monedas de la empresa | [`moneda.yml`](entidades/moneda.yml) |
| `tipo_cambio` | Tasas (**informativo**, no se reconvierte) | [`tipo_cambio.yml`](entidades/tipo_cambio.yml) |
| `tiempo` | Calendario | [`tiempo.yml`](entidades/tiempo.yml) |

### Hechos

| Entidad | Rol | Contrato |
|---|---|---|
| `documento_comercial` | Cabecera de factura/NC, **venta y compra** | [`documento_comercial.yml`](entidades/documento_comercial.yml) |
| `documento_linea` | **Grano del hecho** — línea de documento | [`documento_linea.yml`](entidades/documento_linea.yml) |
| `partida_cartera` | Partida del mayor — **CxC y CxP** | [`partida_cartera.yml`](entidades/partida_cartera.yml) |

### Control

| Entidad | Rol | Contrato |
|---|---|---|
| `control_cuadre` | Verificación canónico vs ERP | [`control_cuadre.yml`](entidades/control_cuadre.yml) |

---

## Reglas del contrato

**Plata unificada, Oro separada.** Plata junta venta+compra y CxC+CxP porque su trabajo es
absorber la diferencia entre ERPs sin duplicar el mapeo (SAP B1 trae 4 tablas de documentos, Odoo
1 sola). Oro las separa por proceso de negocio para que Power BI, la capa semántica y el agente no
puedan mezclar totales. Ver `DISENO-plata-oro.md` §3.

**La cartera sale del mayor, filtrada por tipo de cuenta.** Nunca de la factura. Demostrado:
18.1% de diferencia en Odoo, 0.07% en SAP B1. Y el mayor **no es todo cartera** — incluye
inventario y producción, así que `cuenta.tipo_cuenta` es filtro obligatorio.

**Todos los montos se conservan.** Sin impuesto, impuesto y con impuesto; en moneda del documento
y en moneda local; más descuento, costo y margen. La capa de datos no decide por el analista.
Los importes se toman **ya convertidos del ERP**; no se recalculan con tasas propias.

**Ventana incremental por fecha de creación/actualización**, nunca por fecha de documento: en
Grupo Cresta las facturas con fecha futura son operación normal.

**Multi-empresa:** toda fila lleva `empresa_id` (tenencia + RLS). En SAP B1 viene de la conexión
(una base por sociedad); en Odoo de una columna de la fila.

**Miembro default:** toda dimensión define `DESCONOCIDO` (clave sustituta `-1`) para que el hecho
siempre cruce. Es lo que permite que el mismo modelo sirva a clientes con perfiles opuestos —
centro de costo se usa en 99.8% de las líneas en Cresta y casi en ninguna en Iron Network.

**Tipos:** montos `numeric(18,4)`, tasas `numeric(18,6)`, fechas `date`, identificadores `text`.
Signo del monto según tipo de documento (factura +, nota de crédito −), normalizado en Plata.

**Trazabilidad:** cada tabla Plata/Oro arrastra `fuente_origen`, `extraido_en`,
`proceso_transformacion`, `version_proceso` (§12). Son columnas técnicas de toda tabla, no se
declaran por entidad.

**Exclusiones duras:** borradores y cancelados nunca entran. En Odoo viven en la misma tabla que
los contabilizados; en SAP B1 los borradores están en tabla aparte y los cancelados se marcan.

---

## Convención de nombres

Español, sin mezcla. Esquemas `bronce` · `plata` · `oro` · `metadatos` · `gobierno`.

- Entidades y campos en `snake_case`.
- Claves naturales del origen: `<algo>_codigo` (texto). Claves sustitutas de Oro:
  `<entidad>_clave` (numéricas), asignadas en la transformación.
- Prefijos de modelo: `plata_` (Plata) · `hecho_` y `dim_` (Oro) · `metrica_` · `cuarentena_` ·
  `version_` (SCD2) · `reporte_`.
- Vigencia SCD2: `valido_desde` / `valido_hasta` / `es_vigente`.
