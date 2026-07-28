-- =====================================================================
-- Seed: entornos de ejecución soportados (§2, §5). Idempotente.
-- =====================================================================
INSERT INTO metadatos.entornos_ejecucion (clave, nombre, erp, motor, driver, puerto_default)
VALUES
  ('sap_b1_hana',      'SAP Business One · HANA',       'sap_b1', 'hana',      'hdbcli', 30015),
  ('sap_b1_sqlserver', 'SAP Business One · SQL Server', 'sap_b1', 'sqlserver', 'pyodbc', 1433),
  ('odoo',             'Odoo · PostgreSQL',             'odoo',   'postgres',  'psycopg', 5432)
ON CONFLICT (clave) DO NOTHING;
