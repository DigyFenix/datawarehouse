{% macro aplicar_rls_oro() %}
{#
  RLS de Oro para el rol de consumo gobernado `portal_lector` (agente de IA).

  Se aplica como POST-HOOK a nivel de carpeta oro (dbt_project.yml): cada `dbt build`
  recrea las tablas y sus policies con ellas — todo modelo oro futuro queda cubierto
  sin tocar nada. dbt (dueño de la tabla) NO se ve afectado: sin FORCE, el dueño
  bypassa RLS. Power BI entra con el superusuario del tenant: tampoco le aplica
  (riesgo aceptado y documentado; no se disfraza).

  Política:
    - tablas CON empresa_id  → visible solo lo que liste la variable de sesión
      `app.empresas` ('*' = todas; CSV de empresa_id). SIN variable ⇒ current_setting
      devuelve NULL ⇒ CERO filas (fail-closed).
    - tablas SIN empresa_id (dim_tiempo, dim_moneda, dim_rango_aging, dim_anio…)
      → catálogos neutros: visibles siempre (USING true).

  El agente setea la variable POR TRANSACCIÓN:
    BEGIN; SELECT set_config('app.empresas', '<csv|*>', true); <consulta>; COMMIT;
#}
{% if execute %}
  {% set relacion = this %}
  {% set columnas = adapter.get_columns_in_relation(relacion) %}
  {% set tiene_empresa = columnas | selectattr('name', 'equalto', 'empresa_id') | list | length > 0 %}

  {% set sql %}
    do $rls$
    begin
      if not exists (select 1 from pg_roles where rolname = 'portal_lector') then
        return; -- entorno sin rol de consumo (p. ej. build local minimalista): no aplica RLS
      end if;

      execute 'grant select on {{ relacion }} to portal_lector';
      execute 'alter table {{ relacion }} enable row level security';
      execute 'drop policy if exists rls_empresa on {{ relacion }}';
      {% if tiene_empresa %}
      execute $pol$
        create policy rls_empresa on {{ relacion }}
          for select to portal_lector
          using (
            current_setting('app.empresas', true) = '*'
            or empresa_id::text = any (string_to_array(current_setting('app.empresas', true), ','))
          )
      $pol$;
      {% else %}
      -- Catálogo neutro sin eje de empresa: visible para el rol de consumo.
      execute $pol$
        create policy rls_empresa on {{ relacion }}
          for select to portal_lector
          using (true)
      $pol$;
      {% endif %}
    end
    $rls$;
  {% endset %}
  {{ return(sql) }}
{% else %}
  {{ return('select 1') }}
{% endif %}
{% endmacro %}
