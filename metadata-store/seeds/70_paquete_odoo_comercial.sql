-- =====================================================================
-- Propósito : EXTENSIÓN del paquete Odoo — DIMENSIONES COMERCIALES que los tableros
--             de ventas (réplica Kraken 360, sesión 28) necesitan con NOMBRE:
--               · categoría de producto  (product_category)  → línea
--               · vendedor               (res_users)         → vendedor con nombre
--               · equipo de ventas       (crm_team)          → canal
--               · condición de pago      (account_payment_term) → sector (crédito/contado)
--             Y los campos del documento que las referencian (account_move.team_id,
--             invoice_payment_term_id) + partner_shipping_id, que el seed 69 sembró bajo
--             el objeto 'ventas_factura' (nombre del paquete SAP) y por eso nunca se
--             extrajo para un tenant Odoo (su objeto es 'movimientos').
-- Ejecución : psql -d quilate_control -v org=<codigo> -f 70_paquete_odoo_comercial.sql
--             (después de 59_paquete_odoo.sql)
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Idempotente: sí.
-- Validado  : columnas verificadas con `descubrir` contra el Odoo 18 de Iron Network
--             (2026-10-17): product_category 22 col, res_users 26, crm_team 18,
--             account_payment_term 15.
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- políticas
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  ('categorias_producto', 'Categorías de producto', 'datos_maestros', 'maestro', 'full_replace',
   'product_category', NULL::text, NULL::integer, NULL::text, 'id', '{}'::text[],
   'data_steward', 'plata_producto+', NULL::text),
  ('vendedores', 'Vendedores (usuarios)', 'datos_maestros', 'maestro', 'full_replace',
   'res_users', NULL, NULL, NULL, 'id', '{}'::text[],
   'data_steward', 'plata_vendedor+', NULL),
  ('equipos_venta', 'Equipos de venta (canal)', 'ventas', 'maestro', 'full_replace',
   'crm_team', NULL, NULL, NULL, 'id', '{}'::text[],
   'data_owner_ventas', 'plata_canal+', NULL),
  ('condiciones_pago', 'Condiciones de pago', 'finanzas', 'maestro', 'full_replace',
   'account_payment_term', NULL, NULL, NULL, 'id', '{}'::text[],
   'data_owner_finanzas', 'plata_condicion_pago+', NULL)
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, clave_natural = EXCLUDED.clave_natural,
       modelos_dbt = EXCLUDED.modelos_dbt, actualizado_en = now();

-- `descubrir --tabla` registra las columnas bajo el objeto con el que se invocó; si se
-- exploraron estas tablas desde 'productos', esas filas sobran (el objeto correcto es el
-- de arriba).
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
DELETE FROM metadatos.campo_ingesta c USING org
 WHERE c.organizacion_id = org.id
   AND c.objeto NOT IN ('categorias_producto', 'vendedores', 'equipos_venta', 'condiciones_pago')
   AND c.tabla_origen IN ('product_category', 'res_users', 'crm_team', 'account_payment_term');

-- ---------------------------------------------------------------- mapeo de campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.* FROM org, (VALUES
  -- ============ product_category → producto.grupo ============
  ('categorias_producto','product_category','id',           false,'int','Identificador de la categoría','producto','grupo_codigo','directo',true,true,'paquete_base',NULL::text,NULL::text),
  ('categorias_producto','product_category','name',         false,'text','Nombre de la categoría','producto','grupo_nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('categorias_producto','product_category','complete_name',false,'text','Ruta completa (Padre / Hija)','producto',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('categorias_producto','product_category','parent_id',    false,'int','Categoría padre','producto',NULL,'directo',false,true,'paquete_base',NULL,NULL),

  -- ============ res_users → vendedor ============
  -- El nombre del usuario vive en su res_partner (partner_id); Plata hace el join.
  ('vendedores','res_users','id',          false,'int','Identificador del usuario = invoice_user_id del documento','vendedor','vendedor_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','res_users','login',       false,'text','Login (respaldo del nombre)','vendedor',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','res_users','partner_id',  false,'int','Partner del usuario → nombre','vendedor',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','res_users','sale_team_id',false,'int','Equipo de ventas por defecto del usuario','vendedor',NULL,'directo',false,true,'paquete_base',NULL,NULL),
  ('vendedores','res_users','active',      false,'bool','Activo','vendedor','activo','directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','res_users','share',       false,'bool','true = usuario portal/externo, no vendedor','vendedor',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','res_users','company_id',  false,'int','Compañía','vendedor',NULL,'directo',true,true,'paquete_base',NULL,NULL),

  -- ============ crm_team → canal ============
  ('equipos_venta','crm_team','id',        false,'int','Identificador del equipo = team_id del documento','canal','canal_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('equipos_venta','crm_team','name',      false,'jsonb','Nombre TRADUCIDO (jsonb por idioma)','canal','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('equipos_venta','crm_team','active',    false,'bool','Activo','canal','activo','directo',true,true,'paquete_base',NULL,NULL),
  ('equipos_venta','crm_team','company_id',false,'int','Compañía (NULL = compartido)','canal',NULL,'directo',false,true,'paquete_base',NULL,NULL),

  -- ============ account_payment_term → condicion_pago ============
  ('condiciones_pago','account_payment_term','id',        false,'int','Identificador = invoice_payment_term_id del documento','condicion_pago','condicion_pago_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('condiciones_pago','account_payment_term','name',      false,'jsonb','Nombre TRADUCIDO (jsonb por idioma)','condicion_pago','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('condiciones_pago','account_payment_term','active',    false,'bool','Activa','condicion_pago','activo','directo',true,true,'paquete_base',NULL,NULL),
  ('condiciones_pago','account_payment_term','company_id',false,'int','Compañía (NULL = compartida)','condicion_pago',NULL,'directo',false,true,'paquete_base',NULL,NULL),

  -- ============ product_template: precio de lista (tablero de existencias) ============
  ('productos','product_template','list_price',false,'num','Precio de venta de lista','producto','precio_lista','cast_numeric',true,true,'paquete_base',NULL,NULL),

  -- ============ account_move: referencias del documento ============
  ('movimientos','account_move','team_id',                false,'int','Equipo de ventas del documento → canal','documento_comercial','canal_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','invoice_payment_term_id',false,'int','Condición de pago DEL DOCUMENTO (más exacta que la del cliente)','documento_comercial','condicion_pago_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','partner_shipping_id',    false,'int','Dirección de entrega (partner hijo) → mapa','documento_comercial','direccion_entrega_codigo','directo',true,true,'paquete_base',NULL,NULL),

  -- ============ sale_order: referencias del pedido ============
  ('pedidos_venta','sale_order','team_id',        false,'int','Equipo de ventas del pedido → canal','pedido',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('pedidos_venta','sale_order','payment_term_id',false,'int','Condición de pago del pedido','pedido',NULL,'directo',true,true,'paquete_base',NULL,NULL)
) AS v(objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
       canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
       filtro_op, filtro_valor)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen)
DO UPDATE SET incluido = true, campo_canonico = EXCLUDED.campo_canonico,
              descripcion = EXCLUDED.descripcion, actualizado_en = now();
