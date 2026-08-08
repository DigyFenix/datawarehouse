# F0 · Matriz de capacidades del entorno

_Verificado el 2026-08-08. Cada fila cita el comando ejecutado, no la suposición._

Este documento existe para que las fases siguientes se diseñen contra lo que el
entorno **puede hacer**, no contra lo que sería cómodo que hiciera. La conclusión
que más condiciona el plan está al final, en «Consecuencias».

## Matriz

| Capacidad | Herramienta | Detectada | Verificada (comando y salida) | Gap | Uso previsto |
|---|---|---|---|---|---|
| **Lectura TMDL** | Herramientas de archivo del agente | Sí | `find . -name "*.tmdl"` → **47 archivos**; lectura directa del contenido | — | F1 (mapa de explotación), F4 (verificar que una medida no exista ya) |
| **Escritura TMDL** | Herramientas de archivo del agente | Sí | Ediciones aplicadas y verificadas en sesiones anteriores sobre este mismo modelo (294 medidas documentadas) | Sin validador sintáctico oficial: un error de TMDL se descubre al abrir Desktop | F4 (medidas nuevas) |
| **Ejecución DAX contra el modelo** | `@microsoft/powerbi-modeling-mcp` | Sí (instalado con autorización de Edwin, 2026-08-08) | `npx -y @microsoft/powerbi-modeling-mcp@latest --help` → ayuda del paquete · `claude mcp add powerbi-modeling` → registrado · Power BI Desktop presente (`PBIDesktop.exe` en Archivos de programa) · Node v22.12.0 | **Condicionado:** se conecta por XMLA a la instancia de Analysis Services que levanta Desktop, así que **exige el PBIP abierto**. Con Desktop cerrado (`Get-Process msmdsrv` sin resultado) no hay motor al que consultar | F4 y F6.2 con verificación directa mientras Edwin tenga el archivo abierto |
| **Lectura/escritura PBIR** | Herramientas de archivo (JSON) | Sí | `definition/pages/` con carpeta por página + `pages.json` legibles y editables | — | F5 (construcción de páginas) |
| **Validación de esquema PBIR** | `consumo/powerbi/validar_reporte.py` (propio) | Sí | El script cruza el reporte contra el TMDL: referencias a tablas/columnas/medidas inexistentes, visuales fuera del lienzo 1280×720 y solapamientos | Cubre 3 de las 10 comprobaciones que pide F6.1: faltan múltiplos de 8, hex literales, GUID duplicados, destinos de navegación y drill-through, títulos por defecto y literales numéricos en títulos | F6.1 — **hay que extenderlo**, no escribirlo de cero |
| **Consulta a PostgreSQL `oro`** | `docker exec … psql` | Sí | `psql -d dw_grupocresta -c "select count(*) from oro.metrica_valor"` → **1555** | — | F6.2 (cuadre de totales), F7 (hallazgos comerciales) |
| **Render/captura del reporte** | — | **No** | Playwright MCP disponible, pero opera sobre navegador: no abre Power BI Desktop ni renderiza un `.pbip` | Sin candidato viable en local | F6.3 depende de capturas que aporte Edwin, como ya prevé el contrato |
| **Inventario del modelo** | `consumo/powerbi/inventario_modelo.py` (propio) | Sí | Produce `docs/powerbi/inventario-modelo.md` desde el TMDL: 43 tablas, 662 columnas, 294 medidas, 98 relaciones | — | F1 (baseline) |

## MCPs y skills presentes

Verificado contra la sesión activa. Ninguno es de Power BI:

| Nombre | Tipo | Sirve para este producto |
|---|---|---|
| `playwright` | MCP | No — navegador, no Desktop |
| `context7` | MCP | Marginal — documentación de librerías |
| `microsoft365` | MCP | No verificado; requiere autenticación interactiva |
| `impeccable` | skill | Sí, para los portales web; no para PBIR |
| `frontend-design` | skill | Ídem |

De la lista blanca de §3.5 hay **uno instalado**: `@microsoft/powerbi-modeling-mcp`,
con autorización explícita de Edwin (2026-08-08). Los otros dos siguen sin instalar.
Sus herramientas quedan disponibles al reiniciar Claude Code.

## Consecuencias para el plan

**1. El QA de datos (F6.2) es automatizable, con una condición.** Con el MCP instalado
la comparación DAX ↔ SQL la ejecuto yo entera… **mientras el PBIP esté abierto en Power
BI Desktop**. El MCP habla XMLA con la instancia de Analysis Services que Desktop levanta
al abrir el archivo; con Desktop cerrado no hay motor y el MCP no puede hacer nada.

En la práctica: Edwin abre el archivo una vez por sesión de validación y yo hago el resto.
Eso levanta el techo de medidas nuevas viables — ya no cuesta una intervención humana por
medida, sino una por tanda. La ruta manual de §7 (exportar a Excel) queda como respaldo
si el MCP falla.

**2. El QA visual (F6.3) es enteramente humano**, como el contrato ya declara. No se
marcará como aprobado sin capturas.

**3. El validador estructural de F6.1 hay que extenderlo.** Ya existe uno propio que
cubre referencias rotas, lienzo y solapamientos —las tres comprobaciones más caras de
escribir—. Faltan siete, todas mecánicas sobre el JSON. Es trabajo de F6, no de F0.

**4. El riesgo real no es la falta de herramientas, es el desfase de cifras.** Un
producto construido sobre un baseline que dice 180 medidas cuando hay 294 tomará
decisiones de cobertura equivocadas. Por eso F1 parte del inventario real.

## Gate de F0

| Requisito | Estado |
|---|---|
| La matriz existe | Sí |
| Cada fila «Verificada» cita el comando ejecutado | Sí |
| Los gaps están listados con la herramienta candidata propuesta | Sí — `powerbi-modeling-mcp` para DAX; sin candidato para render |
| Instalaciones | Una, `@microsoft/powerbi-modeling-mcp`, con autorización explícita de Edwin. Ninguna por iniciativa propia |

**F0 CERRADA.** Siguiente: F1 (baseline del modelo) — no se ejecuta en esta sesión
(§0.1: una sola fase por sesión).
