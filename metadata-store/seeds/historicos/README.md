# Seeds históricos — YA APLICADOS, no usar

Estos seeds (60–63) se aplicaron en vivo a `grupocresta` e `ironnetwork` durante las
sesiones 11–12 y quedaron **consolidados** en los paquetes parametrizados de onboarding
(`64_paquete_sap_b1_extension.sql` y `65_paquete_odoo_extension.sql`).

Se conservan solo como historia de lo aplicado. Para dar de alta una organización nueva,
usa exclusivamente los paquetes `58/58b/59/64–69` con `-v org=<codigo>` — ver
`docs/ONBOARDING-nueva-organizacion.md`.

Esta carpeta está fuera del init (`infra/local/init/02_aplicar_catalogo.sh` no baja a
subdirectorios): una instalación limpia no crea datos de ningún tenant.
