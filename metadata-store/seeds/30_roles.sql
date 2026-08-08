-- =====================================================================
-- Seed: roles del PLANO DE CONTROL. Idempotente (ON CONFLICT sobre clave).
--
-- Sólo dos, y es deliberado: este portal lo usan el operador del producto y, si
-- acaso, un administrador designado de una organización. Los accesos por área
-- —quién ve ventas, quién ve cartera— NO se configuran aquí: viven en los
-- PERFILES del portal de cada organización, con su alcance por dominio y empresa.
--
-- La CLAVE es el identificador del que dependen las guardas y no cambia nunca.
-- =====================================================================
INSERT INTO gobierno.roles (clave, nombre, descripcion) VALUES
  ('admin_portal',       'Administrador de la plataforma',
   'Da de alta empresas, configura la ingesta y certifica indicadores. Control total del producto.'),
  ('admin_organizacion', 'Administrador de organización',
   'Administra una empresa concreta: sus conexiones, su ingesta y sus indicadores. No ve las demás.')
ON CONFLICT (clave) DO NOTHING;
