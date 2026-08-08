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

## 2 y 3. Provisionar (un botón en el portal)

En **Organizaciones → Provisionar**. En una sola operación, auditada e idempotente:

1. crea la base del plano de datos (`dw_<codigo>`),
2. le aplica el DDL de tenant (`101` esquemas, `110` portal de usuario, `119` rol de lectura
   del agente, `120` alcance por empresa, `121` chat),
3. siembra el paquete de ingesta completo del ERP de la organización.

Solo Odoo pide un dato extra: el **id de compañía** (`res_company`) con el que se filtran sus
objetos. La **fecha de corte** de los flujos es, por defecto, el 1 de enero del año en curso;
se puede indicar otra para arrastrar más historia.

Se puede repetir cuantas veces haga falta: la base se conserva, el DDL usa `IF NOT EXISTS` y
los seeds `ON CONFLICT`. Si el rol `portal_lector` aún no existe en el clúster, el paso `119`
sale como **advertencia** y el tenant queda usable — solo el agente de IA espera a que se cree.

> Requiere que el contenedor del API tenga montado `metadata-store` (ya está en el compose).
> Se aplican los MISMOS archivos versionados del repo: no hay una segunda copia del esquema.

<details>
<summary>Equivalente manual por consola (si el portal no está disponible)</summary>

```bash
docker exec quilate-postgres createdb -U $POSTGRES_USER dw_<codigo>
for f in 101_esquemas_tenant 110_portal_tenant 119_rol_lector_tenant 120_alcance_empresa_tenant 121_portal_chat_tenant; do
  docker exec quilate-postgres psql -U $POSTGRES_USER -d dw_<codigo> -f /opt/metadata-store/schema/$f.sql
done

# SAP B1 — `corte` es la fecha desde la que se traen los flujos (YYYY-01-01 del año en curso)
psql -d quilate_control -v org=<codigo> -v corte=2026-01-01 -f seeds/58_paquete_sap_b1.sql
psql -d quilate_control -v org=<codigo> -v corte=2026-01-01 -f seeds/58b_paquete_sap_b1_documentos.sql
psql -d quilate_control -v org=<codigo> -v corte=2026-01-01 -f seeds/64_paquete_sap_b1_extension.sql
psql -d quilate_control -v org=<codigo> -v corte=2026-01-01 -f seeds/66_paquete_sap_b1_pedidos_mayor.sql
psql -d quilate_control -v org=<codigo> -v corte=2026-01-01 -f seeds/68_paquete_sap_b1_direcciones_retencion.sql  # OBLIGATORIO: sin él, plata_direccion falla en el primer build

# Odoo
psql -d quilate_control -v org=<codigo> -v company=<id> -v corte=2026-01-01 -f seeds/59_paquete_odoo.sql
psql -d quilate_control -v org=<codigo> -v company=<id> -v corte=2026-01-01 -f seeds/65_paquete_odoo_extension.sql
psql -d quilate_control -v org=<codigo> -v company=<id> -v corte=2026-01-01 -f seeds/67_paquete_odoo_pedidos_mayor.sql
psql -d quilate_control -v org=<codigo> -v corte=2026-01-01 -f seeds/69_paquete_odoo_direcciones.sql
```

</details>

Después, en el portal se AJUSTA encima (filtros extra, campos, UDFs). Los seeds 60–63 son
historia aplicada a los dos primeros tenants y viven en `seeds/historicos/`: el onboarding usa
58/58b/59 y 64–69.

En **Sociedades** capturar también `moneda` y `moneda de presentación` (se leen de OADM /
res_company al dar de alta; si difieren, ver la regla multi-moneda del paso 5) y los **NITs
de compañías afiliadas** para la intercompañía.

**SAP sobre SQL SERVER** (mismo ERP, otro motor — soportado desde 2026-08-03): la conexión
usa el entorno `sap_b1_sqlserver` con `secreto_ref = MSSQL` (el worker resuelve
`MSSQL_USER`/`MSSQL_PASSWORD` del .env). En SQL Server cada sociedad es una BASE (`SBO_XXX`):
va en el campo **Esquema de origen** de la sociedad y el worker consulta `[base].dbo.[tabla]`.
Los seeds, la política y todo dbt son los MISMOS que HANA (nombres SAP canónicos); las
instalaciones SQL Server suelen ser versiones SAP más viejas con menos columnas — la
extracción intersecta contra lo que la base realmente tiene, así que no truena.

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
docker exec quilate-worker python3 /dbt/herramientas/correr.py <codigo>      # proyecto COMPLETO (seeds incluidos)
docker exec quilate-worker python3 /dbt/herramientas/correr.py <codigo> "plata_socio_negocio+"  # selección puntual
```

`correr.py` vive en el repo (data-plane/transformacion/herramientas, montado en /dbt) y lee
TODO de la base de control igual que el worker: erp, base del tenant, `nits_grupo` y
`sociedades` (nombre/NIT/moneda/presentación). Sustituye al viejo `/tmp/correr.sh`, que
recibía los NIT a mano y se perdía al recrear el contenedor.

A partir de ahí, el botón **Transformar** del portal funciona por objeto en cualquier orden
(verificado: segunda corrida de `movimientos` = 67 nodos OK).

Verificar: `plata.plata_control_cuadre` con `cuadra = true` en TODOS los conceptos.

**Intercompañía (cerrado 2026-08-02):** los NIT de compañías afiliadas se administran en el
portal (**Sociedades → NITs de compañías afiliadas**, tabla `gobierno.nits_afiliados`) y el
worker los pasa solo a dbt en cada Transformar. La coincidencia es por NIT **normalizado**
(mayúsculas, solo `[0-9K]`): guiones, espacios y prefijos no rompen el match. El 4º argumento
de `correr.sh` queda solo para corridas manuales sin portal.

**Multi-moneda (2026-08-02):** cada sociedad declara en el portal su `moneda` local y su
`moneda_presentacion` (migraciones 113/114; se leen de OADM al dar de alta). Si difieren, Oro
convierte con la serie de tipo de cambio de la **propia** sociedad (`plata_tasa_presentacion`).
Guardas: tasas atípicas se descartan (rango vs mediana); una serie capturada al revés se
detecta por **reciprocidad** contra la serie espejo del grupo y se corrige con 1/tasa
(`estado_serie = 'invertida_corregida'` — la orientación queda probada, no asumida); la tasa
se arrastra hasta 92 días. **Sin serie válida los montos `_grupo` quedan NULL** y la sociedad
solo se lee en su moneda — quien quiera consolidar captura su tasa en el ERP. Verificar
`estado_serie` en `plata.plata_tasa_presentacion` ('ok' | 'sin_tasa' | 'invertida_corregida').

## 6. Power BI

```bash
POSTGRES_HOST=localhost python consumo/powerbi/generar_pbip.py dw_<codigo> <Proyecto> consumo/powerbi
python consumo/powerbi/generar_reporte.py consumo/powerbi/<Proyecto>.Report "<Nombre>"
python consumo/powerbi/validar_reporte.py consumo/powerbi
```

Publicar el modelo al servicio; los dashboards viven en un archivo aparte conectado en vivo
(**mismo workspace** que el modelo — requisito de Publish to Web; ver consumo/powerbi/README.md).

## 7. Portal de usuario

1. En el portal admin (Organizaciones): copiar la **URL de ingreso** del tenant (hash) y subir
   el **logo** (el color de marca ya existe). Esa URL es la que se entrega al cliente.
2. En Tableros (organización activa): dar de alta cada dashboard con su URL de Publish to Web.
3. En la ficha de la organización: **Sembrar admin** del portal de usuario (email + contraseña
   temporal; el sistema fuerza el cambio al primer ingreso).
4. El admin de la organización entra a `portal/<hash>/admin`, crea sus usuarios y perfiles, y
   asigna tableros (y alcances futuros del chatbot) a cada perfil.

## Huecos conocidos (estado 2026-08-01)

- `base_datos_dw`: el API la deriva al crear (fix 2026-08-01); la BD física sigue siendo el
  paso 2 manual.
- ~~`nits_grupo` no viaja por el botón Transformar~~ — cerrado 2026-08-02 (migración 112:
  el portal administra los NIT afiliados y el worker los pasa en cada corrida).
- Las tasas nuevas de `filtro_origen` con fecha fija (2026-01-01) deben ajustarse por tenant.
