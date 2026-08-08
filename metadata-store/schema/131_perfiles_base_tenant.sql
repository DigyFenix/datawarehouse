-- =============================================================================
-- 131 · Perfiles base de la organización  (SE APLICA EN LA BASE DEL TENANT)
-- =============================================================================
-- PROPÓSITO
--   Una organización recién dada de alta nacía sin un solo perfil, así que su
--   admin abría el portal y no había nada que asignar: había que inventar los
--   perfiles desde cero antes de poder dar acceso a nadie. Y como el alcance es
--   fail-closed, hasta entonces el chat respondía «no tienes métricas
--   autorizadas», que se lee como producto roto en el primer contacto.
--
--   Estos seis perfiles salen de cruzar los dominios de la capa Oro con las áreas
--   que existen en cualquier empresa con un ERP. Son un PUNTO DE PARTIDA editable,
--   no una imposición: el admin los renombra, ajusta o borra.
--
--   El eje de empresa se deja en `*` (todas las sociedades) porque una empresa de
--   una sola sociedad es el caso común, y en un grupo el admin lo acota. Lo que NO
--   se abre por defecto es el dominio: cada perfil ve lo suyo.
--
-- OBJETOS AFECTADOS
--   `portal.perfiles` y `portal.perfil_alcances` del tenant. Idempotente: si el
--   admin ya creó perfiles con esas claves, no se tocan.
--
-- IMPACTO ESTIMADO
--   6 perfiles con sus alcances. Nadie los tiene asignados todavía: no conceden
--   acceso hasta que el admin se los dé a una persona.
--
-- APLICACIÓN
--   Por cada base `dw_*`:  psql -U <admin> -d dw_<codigo> -f 131_perfiles_base_tenant.sql
--
-- ROLLBACK  →  metadata-store/rollback/131_perfiles_base_tenant_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

INSERT INTO portal.perfiles (clave, nombre, descripcion) VALUES
  ('direccion',  'Dirección',
   'Ve toda la operación: ventas, compras, cartera, inventario y resultado.'),
  ('ventas',     'Ventas',
   'Su cartera de clientes, sus pedidos y su margen. No ve compras ni proveedores.'),
  ('cobranza',   'Créditos y cobranza',
   'Saldos por cobrar, antigüedad y pagos recibidos. Sabe quién debe y desde cuándo.'),
  ('compras',    'Compras',
   'Qué se compra, a quién y a qué precio, con lo que se debe a proveedores.'),
  ('inventario', 'Inventario',
   'Existencias, valor inmovilizado y rotación de producto.'),
  ('finanzas',   'Finanzas',
   'La posición completa: resultado, cartera de los dos lados y flujo.')
ON CONFLICT (clave) DO NOTHING;

-- Alcances por perfil. `dominio` autoriza qué se consulta; `empresa` qué filas se
-- ven. Sin fila de empresa el usuario no vería NADA (fail-closed), así que todos
-- la llevan.
INSERT INTO portal.perfil_alcances (perfil_id, recurso_tipo, recurso_clave)
SELECT p.id, x.tipo, x.clave
  FROM portal.perfiles p
  JOIN (VALUES
    -- Dirección: todo el catálogo.
    ('direccion',  'metrica',  '*'),
    ('direccion',  'empresa',  '*'),

    ('ventas',     'dominio',  'ventas'),
    ('ventas',     'dominio',  'pedidos'),
    ('ventas',     'dominio',  'rentabilidad'),
    ('ventas',     'empresa',  '*'),

    -- Cobranza necesita tesorería para ver el pago que cancela la deuda.
    ('cobranza',   'dominio',  'tesoreria'),
    ('cobranza',   'dominio',  'ventas'),
    ('cobranza',   'empresa',  '*'),

    ('compras',    'dominio',  'compras'),
    ('compras',    'dominio',  'tesoreria'),
    ('compras',    'empresa',  '*'),

    ('inventario', 'dominio',  'inventario'),
    ('inventario', 'dominio',  'compras'),
    ('inventario', 'empresa',  '*'),

    ('finanzas',   'metrica',  '*'),
    ('finanzas',   'empresa',  '*')
  ) AS x(perfil, tipo, clave) ON x.perfil = p.clave
 WHERE NOT EXISTS (
   SELECT 1 FROM portal.perfil_alcances a
    WHERE a.perfil_id = p.id AND a.recurso_tipo = x.tipo AND a.recurso_clave = x.clave
 );

DO $$
DECLARE perfiles int; alcances int;
BEGIN
  SELECT count(*) INTO perfiles FROM portal.perfiles;
  SELECT count(*) INTO alcances FROM portal.perfil_alcances;
  RAISE NOTICE 'Perfiles base: % perfiles, % alcances', perfiles, alcances;
END $$;
