# MAPA DEL REPO — Quilate Analytics

Mapa de navegación. Sirve para ir directo al archivo correcto sin explorar el repo entero.
Si algo no está aquí, probablemente no exista todavía.

> **Fuentes de verdad, por si hay contradicción:** `CLAUDE.md` (arquitectura y reglas) ·
> `ESTADO.md` (avance por fases) · `docs/powerbi/STATE.md` (producto Power BI) ·
> `.claude/SESSION.md` (bitácora, lo más reciente arriba).

---

## Quiero… → andá a…

| Quiero | Archivo / carpeta |
|---|---|
| Saber en qué va el proyecto | `ESTADO.md` |
| Saber en qué va el Power BI | `docs/powerbi/STATE.md` |
| Saber qué pasó la sesión pasada | `.claude/SESSION.md` (bloque de arriba) |
| Levantar o diagnosticar el entorno | skill `stack-local` · `infra/local/docker-compose.yml` |
| Actualizar los datos de un tenant | `data-plane/transformacion/herramientas/actualizar.py` |
| Correr solo el build dbt | `data-plane/transformacion/herramientas/correr.py` |
| Cambiar una transformación | `data-plane/transformacion/models/{plata,oro}/` |
| Cambiar el mapeo ERP→canónico | seeds `metadata-store/seeds/58*/59*/64–69` + portal |
| Agregar una medida DAX | `consumo/powerbi/generar_pbip.py` (nunca el `.tmdl` a mano) |
| Dar de alta una organización | `docs/ONBOARDING-nueva-organizacion.md` |
| Cambiar el schema del metadata-store | `metadata-store/schema/` + `metadata-store/rollback/` |
| Tocar el portal admin | `control-plane/api/` + `control-plane/portal/` |
| Tocar el portal de usuario | `consumo/portal/api/` + `consumo/portal/web/` |
| Tocar el agente de IA | `data-plane/agente/src/` |
| Entender una decisión de arquitectura | `docs/arquitectura/` |
| Ver precios / modelo de negocio | `docs/comercial/` |

---

## Estructura

### Raíz

```
CLAUDE.md                                    reglas y arquitectura (leer completo antes de codear)
CLAUDE_POWERBI_ANALYTICS_PRODUCT_MASTER_V3.md contrato del producto Power BI (fases F0–F7)
ESTADO.md                                    tablero de avance de las 7 fases
docs/MAPA-REPO.md                            este archivo
.claude/SESSION.md                           bitácora de sesiones
.claude/skills/                              skills de proyecto (stack-local, guardar-sesion)
.env                                         NO se lee, NO se versiona
```

### `metadata-store/` — el contrato entre los dos planos

```
schema/     46 migraciones numeradas (DDL versionado). La última manda.
rollback/   una por migración, simétrica. Obligatorio (§13 de CLAUDE.md).
seeds/      paquetes base por ERP, parametrizados por organización:
              58/58b/64/66/68  SAP B1     59/65/67/69  Odoo
              10 hechos · 15 dimensiones · 20 métricas · 25 glosario · 30 roles
            historicos/  aplicados a los dos primeros tenants; el onboarding no los usa
```

Esquemas en la base de control `quilate_control`: `metadatos` (catálogo, canónico, políticas de
ingesta) y `gobierno` (organizaciones, sociedades, conexiones, usuarios, roles, auditoría).

### `data-plane/` — el plano de datos

```
extraccion/src/quilate_extraccion/
    main.py            CLI: descubrir | extraer | transformar
    worker.py          servicio HTTP :3010 que consume el portal
    extraccion.py      ERP → Bronce (read-only)
    introspeccion.py   descubre columnas y UDFs del origen
    transformacion.py  dispara dbt build con las vars de la organización
    fuentes/           sap_b1 (HANA) · sap_b1_mssql · odoo_postgres

transformacion/        proyecto dbt (montado como /dbt en el worker)
    models/plata/      22 modelos: canónico agnóstico + cuarentena + plata_control_cuadre
    models/oro/        41 modelos: dimensiones, hechos, métricas y analítica
    macros/            aging · monedas · intercompania · llaves_sustitutas · generar_plata ·
                       dimensional · aplicar_rls_oro · trazabilidad · columnas_versionado
    seeds/ snapshots/ tests/
    herramientas/      actualizar.py (extracción+build) · correr.py (solo build)

canonico/              modelo canónico v2 + contratos YAML por entidad
mapeos/                plantillas por ERP: sap_b1/ · odoo/
semantico/             catálogo, métricas y glosario documentados
agente/src/            @quilate/agente: tools tipadas, guardas, catálogo, prompt
gobierno/              roles, RLS, políticas
```

**Capas:** Bronce (jsonb crudo + trazabilidad) → Plata (canónico agnóstico, calidad, cuarentena,
cuadre) → Oro (estrella + métricas). **Silver no se salta**: es la costura donde SAP B1 y Odoo
se vuelven iguales.

### `control-plane/` — portal admin (plano de control)

```
api/src/     NestJS + Drizzle + Zod. Módulos: auth · organizaciones · sociedades · conexiones ·
             usuarios · acceso · auditoria · canonico · glosario · metricas · ingesta · portal-org
portal/src/  Angular (Mesa de gobierno, color primario por organización)
```

Administra metadatos; **no mueve datos**. Puertos: API 3001, web 8080.

### `consumo/` — lo que ve el negocio

```
powerbi/
    generar_pbip.py       genera el modelo semántico (TMDL) introspeccionando la base
    generar_reporte.py    ⚠ SOBRESCRIBE los visuales hechos a mano — NO CORRER
    validar_reporte.py    valida TMDL, relaciones y referencias de medidas
    inventario_modelo.py  inventario del modelo
    theme/quilate-theme.json   tema del producto
    tests/                regresión DAX

portal/      portal de usuario: api/ (NestJS :3002) + web/ (Angular :8081)
             tableros Publish to Web por perfil, white-label, tenant por hash en URL
```

### `organizaciones/` — una carpeta por tenant

```
grupocresta/   SAP B1 / HANA · 10 sociedades · base dw_grupocresta
    powerbi/PulsoCresta.pbip        ← los visuales son trabajo MANUAL de Edwin
    config/ mapeo/ metricas/ glosario/ gobierno/ seeds/ especificaciones.md
ironnetwork/   Odoo 18 · 1 sociedad · base dw_ironnetwork
```

### `infra/`

```
local/docker-compose.yml       proyecto compose `quilate` (ver skill stack-local)
local/init/                    scripts del primer arranque de Postgres
produccion/                    compose + Caddy (TLS) + respaldo.sh + RUNBOOK.md (Hetzner)
```

---

## Comandos que se usan de verdad

```powershell
# Entorno
cd infra/local; docker compose --env-file ../../.env --profile portal up -d

# Datos de un tenant: extracción ERP → Bronce → Plata → Oro
docker exec quilate-worker python3 /dbt/herramientas/actualizar.py grupocresta
docker exec quilate-worker python3 /dbt/herramientas/correr.py grupocresta   # solo build

# Cuadre (cero filas = publica)
docker exec quilate-postgres psql -U quilate_admin -d dw_grupocresta -c "SELECT empresa_id, concepto, diferencia FROM plata.plata_control_cuadre WHERE NOT cuadra;"

# Modelo Power BI (solo el modelo; los visuales no se tocan)
$env:POSTGRES_HOST="localhost"; python consumo/powerbi/generar_pbip.py dw_grupocresta PulsoCresta organizaciones/grupocresta/powerbi
```

---

## Reglas que muerden si se olvidan

1. **`generar_reporte.py` no se corre.** Se lleva por delante los visuales que Edwin hizo a mano.
2. **`docker compose down -v` no se corre.** Borra el warehouse entero.
3. **`name:` del compose no se cambia** sin migrar el volumen: Docker crea uno vacío y parece
   pérdida total de datos.
4. **El portal es la fuente de verdad.** Lo que Edwin configura ahí no se siembra, restaura ni
   pisa desde código.
5. **Toda migración lleva rollback.** Nunca DDL en caliente sin revisión (Nivel 2, nunca 3).
6. **El `.env` no se lee.** Si hace falta un valor puntual, se pide ese valor.
7. **Si no cuadra, no se publica.** `plata_control_cuadre` con cualquier fila en `cuadra=false`
   detiene la entrega.
