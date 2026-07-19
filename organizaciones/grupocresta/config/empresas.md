# Grupo Cresta — Registro de Empresas (Sociedades)

Las empresas del grupo **no** son proyectos separados: comparten las mismas tablas de hechos y
dimensiones, distinguidas por `empresa_id` y controladas por RLS. Este es su registro.

En SAP Business One cada sociedad es una **base de datos HANA independiente** (`codigo_sociedad`
= nombre del schema HANA). La extracción conecta a cada BD por separado y etiqueta cada fila con
su `empresa_id` canónico al aterrizar en Bronze.

## Empresas

| empresa_id | codigo_sociedad (BD HANA) | Sociedad | NIT | Piloto Fase 1 |
|------------|---------------------------|----------|-----|:-------------:|
| `proavisa`  | `SBOPROAVISA_` | Productos Avícolas, S.A.            | 1230263   | ✅ |
| `loreto`    | `SBOLORETO_`   | Avícola Loreto, S.A.               | 109967739 | ✅ |
| `organicos` | `SBOORGANICOS` | Orgánicos El Paraíso, S.A.         | 90738772  | — |
| `sepesa`    | `SBOSEPESA`    | Servicios Pecuarios, S.A.          | 4733851   | — |
| `seragro`   | `SBOSERAGRO`   | Servicios Agropecuarios, S.A.      | 4733843   | — |
| `inavisa`   | `SBOINAVISA`   | Industrias Avícolas Integradas, S.A. | 5333814 | — |

> El grupo tiene **más sociedades**; se arranca con estas 6 registradas. El pipeline end-to-end
> (Fase 1) se integra y valida primero con el **par piloto `proavisa` + `loreto`**; luego se
> escala a las demás agregando su fila aquí + su secreto de conexión (sin tocar el motor).

## Notas

- El `empresa_id` es canónico (surrogate propio), no el código del ERP. El `codigo_sociedad`
  (schema HANA) se conserva como clave natural en el mapeo y **nunca** se expone al agente.
- Sucursales: se resuelven a nivel línea en `dim_organizacion` (empresa → sucursal). Si una
  empresa/línea no trae sucursal, usa el miembro **default** de la dimensión.
- El aislamiento entre empresas se aplica vía RLS por `empresa_id` (ver `../gobierno/`), no por
  separación física.
