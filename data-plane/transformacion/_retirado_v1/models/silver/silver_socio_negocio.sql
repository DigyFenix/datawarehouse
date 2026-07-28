-- Silver socio_negocio (cliente) — GENERADO desde los metadatos (Modelo canónico + mapeo de
-- ingesta). Lee bronce.ocrd (jsonb real aterrizado por el extractor). Config-driven: agregar un
-- campo o cambiar un mapeo se hace en el portal, no aquí (§6, Silver = costura agnóstica).
{{ config(materialized='table') }}
{{ generar_silver('socio_negocio') }}
