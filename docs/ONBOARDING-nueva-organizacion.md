# Onboarding de una organización nueva (portal → capa oro → Power BI)

Runbook verificado con un ensayo real (2026-08-01). Tiempo estimado: < 1 día con acceso
read-only al ERP del cliente.

## 0. Prerrequisitos

- Credenciales **read-only** del ERP en el `.env` del stack (`<REF>_USER` / `<REF>_PASSWORD`);
  en `gobierno.conexiones` solo va la **referencia** (`secreto_ref`), nunca la credencial.
- Stack arriba: `docker compose --env-file ../../.env --profile portal up -d` (el `.env` vive
  en la RAÍZ del repo, no junto al compose).

## 1. Plano de control (portal)

1. **Organización** (Organizaciones → Nueva): código en minúsculas (`micliente`). El API asigna
   `base_datos_dw = dw_<codigo>` automáticamente; puede sobreescribirse.
2. **Conexión** (Conexiones): host/puerto/base del ERP + `secreto_ref`.
3. **Sociedad** (Sociedades): `empresa_id` (único GLOBAL — es la etiqueta de trazabilidad en
   Bronce), NIT, conexión y `esquema_origen` (`SBOXXX_` en HANA; `public` en Odoo).

## 2. Base del plano de datos (infraestructura, una vez)

```bash
docker exec cresta-postgres createdb -U $POSTGRES_USER dw_<codigo>
docker exec cresta-postgres psql -U $POSTGRES_USER -d dw_<codigo> -f /ruta/101_esquemas_tenant.sql
```

## 3. Paquete base + extensión (config de ingesta completa)

```bash
# SAP B1
psql -d cresta_dw -v org=<codigo> -f seeds/58_paquete_sap_b1.sql
psql -d cresta_dw -v org=<codigo> -f seeds/58b_paquete_sap_b1_documentos.sql
psql -d cresta_dw -v org=<codigo> -f seeds/64_paquete_sap_b1_extension.sql   # pagos, inventario, TC, series

# Odoo
psql -d cresta_dw -v org=<codigo> -v company=<id> -f seeds/59_paquete_odoo.sql
psql -d cresta_dw -v org=<codigo> -v company=<id> -f seeds/65_paquete_odoo_extension.sql
```

Después, en el portal se AJUSTA encima (filtros de fecha del tenant, campos extra, UDFs).
Los seeds 60–63 son historia aplicada a los dos primeros tenants: el onboarding usa 64/65.

## 4. Descubrir → ajustar → Extraer (portal, por objeto)

1. **Descubrir** cada objeto (obligatorio en SAP para validar nombres de columna por versión y
   detectar los UDF `U_*`; el perfilado marca cuáles tienen datos).
2. Revisar en Campos: incluir los UDF que interesen — **el API solo permite incluir/mapear
   UDFs CON DATOS** (regla dura; el perfilado de Descubrir decide). Van a `oro.campo_usuario`
   automáticamente. Confirmar filtros (`Canceled='N'` en pagos, `state='posted'` +
   `company_id` en Odoo).
3. **Extraer** todos los objetos (el orden no importa para Bronce).

## 5. Primera carga: BUILD COMPLETO (no por objeto)

**Verificado en el ensayo (2026-08-01): la primera corrida NO puede ser por objeto.** Los
selectores del portal (`modelo+`) construyen los hechos hacia abajo, y los hechos cruzan TODAS
las dimensiones: con el warehouse vacío fallan por dependencias que otro objeto aún no
construyó. La primera vez se corre el proyecto completo:

```bash
docker exec cresta-worker /tmp/correr.sh <codigo> <sap_b1|odoo> "plata oro" '<json nits_grupo o []>'
```

A partir de ahí, el botón **Transformar** del portal funciona por objeto en cualquier orden
(verificado: segunda corrida de `movimientos` = 67 nodos OK).

Verificar: `plata.plata_control_cuadre` con `cuadra = true` en TODOS los conceptos.
⚠ El botón Transformar aún no pasa `nits_grupo`: para tenants con intercompañía usar
`correr.sh` para las corridas completas hasta cerrar ese gap.

## 6. Power BI

```bash
POSTGRES_HOST=localhost python consumo/powerbi/generar_pbip.py dw_<codigo> <Proyecto> consumo/powerbi
python consumo/powerbi/generar_reporte.py consumo/powerbi/<Proyecto>.Report "<Nombre>"
python consumo/powerbi/validar_reporte.py consumo/powerbi
```

Publicar el modelo al servicio; los dashboards viven en un archivo aparte conectado en vivo.

## Huecos conocidos (estado 2026-08-01)

- `base_datos_dw`: el API la deriva al crear (fix 2026-08-01); la BD física sigue siendo el
  paso 2 manual.
- `nits_grupo` no viaja por el botón Transformar (ver paso 5).
- Las tasas nuevas de `filtro_origen` con fecha fija (2026-01-01) deben ajustarse por tenant.
