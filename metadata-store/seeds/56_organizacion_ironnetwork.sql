-- =====================================================================
-- Propósito : Alta del segundo tenant — IRON NETWORK S.A. (Odoo 18 / PostgreSQL).
-- Tablas    : gobierno.organizaciones, gobierno.conexiones, gobierno.sociedades
-- Impacto   : bajo; solo configuración. No mueve datos.
-- Seguridad : el host/puerto/base llegan por variables psql desde el .env; las
--             credenciales NUNCA se guardan aquí (van por secreto_ref → ODOO_USER
--             / ODOO_PASSWORD en el .env).
-- Ejecución : psql -d cresta_dw \
--               -v odoo_host="$ODOO_HOST" -v odoo_puerto="$ODOO_PORT" \
--               -v odoo_base="$ODOO_DB" -f 56_organizacion_ironnetwork.sql
-- Idempotente: sí (ON CONFLICT sobre las claves naturales).
-- Ref       : DISENO-plata-oro.md §5
-- =====================================================================

-- 1) Organización-cliente (tenant). Su plano de datos vive en la base dw_ironnetwork.
INSERT INTO gobierno.organizaciones (codigo, nombre, sector, erp_tipo, estado, base_datos_dw, color_marca)
VALUES ('ironnetwork', 'Iron Network, S.A.', 'tecnologia', 'odoo', 'activa', 'dw_ironnetwork', '#c0392b')
ON CONFLICT (codigo) DO UPDATE
   SET nombre         = EXCLUDED.nombre,
       sector         = EXCLUDED.sector,
       erp_tipo       = EXCLUDED.erp_tipo,
       base_datos_dw  = EXCLUDED.base_datos_dw,
       actualizado_en = now();

-- 2) Conexión al origen (Odoo sobre PostgreSQL, lectura directa).
INSERT INTO gobierno.conexiones (nombre, entorno_clave, host, puerto, base_datos, secreto_ref, activo, notas)
VALUES ('Odoo IronNetwork', 'odoo', :'odoo_host', :odoo_puerto, :'odoo_base', 'ODOO', true,
        'Odoo 18.0.1.3 con l10n_gt_fel. Acceso read-only directo a PostgreSQL.')
ON CONFLICT DO NOTHING;

-- 3) Sociedad. En Odoo la empresa NO viene de la conexión sino de una columna
--    (company_id) de cada fila: `esquema_origen` es el schema Postgres ('public')
--    y el filtro por compañía lo aplica la política de ingesta.
--    Validado en vivo: de las 4 compañías de la base, solo la 1 tiene movimiento.
INSERT INTO gobierno.sociedades (empresa_id, nombre, nit, conexion_id, esquema_origen, organizacion_id, activo, orden)
SELECT 'ironnetwork', 'IRON NETWORK S.A.', '118149822',
       (SELECT id FROM gobierno.conexiones WHERE nombre = 'Odoo IronNetwork'),
       'public',
       (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork'),
       true, 1
ON CONFLICT (empresa_id) DO UPDATE
   SET nombre          = EXCLUDED.nombre,
       nit             = EXCLUDED.nit,
       conexion_id     = EXCLUDED.conexion_id,
       esquema_origen  = EXCLUDED.esquema_origen,
       organizacion_id = EXCLUDED.organizacion_id,
       actualizado_en  = now();
