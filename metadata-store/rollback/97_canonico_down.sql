-- Rollback de 97_canonico.sql (campos dependen de entidad por FK: caen con CASCADE al soltar campo primero)
DROP TABLE IF EXISTS metadatos.canonico_campo;
DROP TABLE IF EXISTS metadatos.canonico_entidad;
