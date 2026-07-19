# Modelo canónico agnóstico — order-to-cash

Contrato **agnóstico al ERP** que la capa **Silver** debe cumplir (la costura agnóstica,
`CLAUDE.md` §6). Bronze es distinto por ERP; de Silver hacia arriba todo es idéntico. El mapeo
ERP→canónico (SAP B1 en `../mapeos/sap_b1/`, Odoo en `../mapeos/odoo/`) traduce los objetos de
origen a estas entidades. **Ninguna entidad usa nombres de SAP** (`OINV`, `RDR1`, etc.).

## Alcance (primer corte)

Flujo **facturo → cobro → cartera**. Dominios `datos_maestros`, `ventas`, `tesoreria`.
Rentabilidad/margen y otros dominios quedan fuera de este corte.

## Entidades

| Entidad canónica | Tipo | Rol | Contrato |
|------------------|------|-----|----------|
| `documento_venta` | hecho (cabecera) | Factura / nota de crédito (cabecera) | `entidades/documento_venta.yml` |
| `linea_documento_venta` | hecho (línea) | Línea de factura/NC — **grano del hecho** | `entidades/linea_documento_venta.yml` |
| `documento_cobro` | hecho | Documento de CxC (saldo por cobrar) | `entidades/documento_cobro.yml` |
| `socio_negocio` | dimensión | Cliente | `entidades/socio_negocio.yml` |
| `item` | dimensión | Producto | `entidades/item.yml` |
| `vendedor` | dimensión | Vendedor | `entidades/vendedor.yml` |
| `organizacion` | dimensión | Empresa → sucursal (jerarquía) | `entidades/organizacion.yml` |
| `centro_costo` | dimensión | Centro de costo (nivel línea) | `entidades/centro_costo.yml` |
| `cuenta` | dimensión | Cuenta contable (nivel línea) | `entidades/cuenta.yml` |
| `tiempo` | dimensión | Calendario | `entidades/tiempo.yml` |

## Reglas del contrato

- **Grano del hecho = línea de documento** (§8). La cabecera (`documento_venta`) da contexto; la
  medición vive en `linea_documento_venta`.
- **Multi-empresa:** toda fila lleva `empresa_id` (clave de tenencia y RLS, §12). En Grupo Cresta
  cada `empresa_id` proviene de una base HANA de SAP B1 distinta (ver
  `organizaciones/grupocresta/config/empresas.md`).
- **Miembro default:** toda dimensión define un miembro `desconocido` para que el hecho siempre
  cruce (§8). Convención: clave sustituta `-1`, código `'DESCONOCIDO'`.
- **Tipos:** montos `numeric(18,4)`; fechas `date`; identificadores `text`. Signo del monto según
  tipo de documento (factura +, nota de crédito −) — se valida en calidad (§10).
- **Trazabilidad:** cada tabla arrastra `source_origen`, `extraido_en`, `proceso_transformacion`,
  `version_proceso` (§12). No se documentan por campo aquí; son columnas técnicas de toda tabla
  Silver/Gold.
- **Homologación:** códigos equivalentes entre empresas se homologan en Silver (p.ej. catálogos
  de producto distintos → `item` canónico). El glosario del tenant traduce el vocabulario.

## Convención de nombres

- Entidades y campos en `snake_case`.
- Claves naturales del origen se conservan como `<algo>_codigo` (texto); las claves sustitutas
  Gold son `<dim>_key` (numéricas), asignadas en la transformación.
- Prefijos Gold: `fct_` (hechos), `dim_` (dimensiones).
