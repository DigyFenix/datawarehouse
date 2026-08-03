{#
  Plan de cuentas canónico. PIEZA OBLIGATORIA DEL PIPELINE DE CARTERA: `tipo_cuenta` es lo
  que decide qué partida del mayor es cuenta por cobrar o por pagar.

  Sin esta clasificación la cartera sale mal: el mayor incluye inventario y producción
  (en Proavisa, 1,043,823 de 1,732,253 partidas tienen saldo y la mayoría NO es cartera).

  SAP B1 no marca las cuentas de cartera, así que se DEDUCEN de las cuentas de control de
  los socios (OCRD.DebPayAcct): si una cuenta es la de control de clientes → por cobrar; de
  proveedores → por pagar. Así el paquete funciona en cualquier instalación sin hardcodear
  códigos, que cambian de empresa a empresa.

  JERARQUÍA MULTINIVEL (canónica): el plan de cuentas es un árbol y el negocio filtra por
  nivel ("todo Activo", "todos los gastos de administración"). Cada ERP la trae distinto y
  aquí se homologa a columnas planas nivel_1..nivel_5 (código y nombre) + `nivel` + `ruta`:
    · SAP B1  → árbol real vía OACT.FatherNum (en Cresta: 5 niveles exactos, 471 cuentas).
    · Odoo    → no extrae grupos: los niveles se derivan de los SEGMENTOS del código visible
      ('1.0.01.01' → 1 / 1.0 / 1.0.01 / 1.0.01.01). Los niveles intermedios no tienen nombre
      propio (viven en account.group, no ingestado) y usan el prefijo como etiqueta.
  Los niveles por debajo de la profundidad de la cuenta se RELLENAN con la hoja (jerarquía
  "ragged" aplanada): así el drill-down de Power BI nunca cae en (En blanco).
#}
{{ config(materialized='table') }}

{%- set erp = erp_actual() | trim -%}

{% if erp == 'sap_b1' %}

with recursive control_socios as (
    -- Cuentas de control usadas por los socios, y para qué tipo de socio.
    select
        cuenta_control_codigo                                        as cuenta_codigo,
        max(case when es_cliente   then 1 else 0 end)                as usada_por_cliente,
        max(case when es_proveedor then 1 else 0 end)                as usada_por_proveedor
    from {{ ref('plata_socio_negocio') }}
    where cuenta_control_codigo is not null
    group by 1
),

cuentas as (
    select
        a.empresa_id,
        a.datos->>'AcctCode'                              as cuenta_codigo,
        nullif(trim(a.datos->>'FormatCode'), '')          as cuenta_codigo_visible,
        trim(a.datos->>'AcctName')                        as nombre,
        a.datos->>'ActType'                               as act_type,
        coalesce(a.datos->>'Postable', 'Y') = 'Y'         as postable,
        -- Padre en el árbol. La raíz (cajón) se apunta a sí misma en FatherNum.
        nullif(a.datos->>'FatherNum', a.datos->>'AcctCode') as cuenta_padre_codigo,
        a.fuente_origen,
        a.extraido_en
    from {{ source('bronce', 'oact') }} a
),

-- Camino raíz→cuenta. El tope de nivel corta cualquier ciclo defensivamente.
jerarquia as (
    select
        c.empresa_id,
        c.cuenta_codigo,
        1                                                       as nivel,
        array[coalesce(c.cuenta_codigo_visible, c.cuenta_codigo)] as ruta_codigos,
        array[c.nombre]                                          as ruta_nombres
    from cuentas c
    where c.cuenta_padre_codigo is null

    union all

    select
        c.empresa_id,
        c.cuenta_codigo,
        j.nivel + 1,
        j.ruta_codigos || coalesce(c.cuenta_codigo_visible, c.cuenta_codigo),
        j.ruta_nombres || c.nombre
    from cuentas c
    join jerarquia j
      on j.empresa_id = c.empresa_id and j.cuenta_codigo = c.cuenta_padre_codigo
    where j.nivel < 8
),

enriquecido as (
    select
        c.empresa_id,
        c.cuenta_codigo,
        c.cuenta_codigo_visible,
        c.nombre,
        case
            when s.usada_por_cliente   = 1 then 'por_cobrar'
            when s.usada_por_proveedor = 1 then 'por_pagar'
            when c.act_type = 'I' then 'ingreso'
            when c.act_type = 'E' then 'gasto'
            else 'otro'
        end                                               as tipo_cuenta,
        coalesce(s.usada_por_cliente, 0)   = 1            as es_cartera_cobrar,
        coalesce(s.usada_por_proveedor, 0) = 1            as es_cartera_pagar,
        c.postable                                        as permite_conciliacion,
        -- Cuenta de título = no imputable: agrupa, no recibe partidas.
        not c.postable                                    as es_titulo,
        true                                              as activa,
        c.cuenta_padre_codigo,
        coalesce(j.nivel, 1)                              as nivel,
        coalesce(j.ruta_codigos,
                 array[coalesce(c.cuenta_codigo_visible, c.cuenta_codigo)]) as ruta_codigos,
        coalesce(j.ruta_nombres, array[c.nombre])         as ruta_nombres,
        c.fuente_origen,
        c.extraido_en
    from cuentas c
    left join control_socios s on s.cuenta_codigo = c.cuenta_codigo
    left join jerarquia j
           on j.empresa_id = c.empresa_id and j.cuenta_codigo = c.cuenta_codigo
)

{% else %}

with base as (
    select
        empresa_id,
        datos->>'id'                                      as cuenta_codigo,
        -- Odoo 18: el código vive en `code_store`, un jsonb con una clave por compañía.
        -- No hay columna `code`. Se toma el primer valor disponible.
        (select v from jsonb_each_text(datos->'code_store') as t(k, v) limit 1)
                                                          as cuenta_codigo_visible,
        {{ odoo_texto('datos', 'name') }}                 as nombre,
        case datos->>'account_type'
            when 'asset_receivable'  then 'por_cobrar'
            when 'liability_payable' then 'por_pagar'
            when 'asset_cash'        then 'banco'
            when 'income'            then 'ingreso'
            when 'income_other'      then 'ingreso'
            when 'expense'           then 'gasto'
            when 'expense_direct_cost' then 'costo'
            when 'asset_current'     then 'activo'
            when 'asset_non_current' then 'activo'
            when 'asset_fixed'       then 'activo'
            when 'liability_current' then 'pasivo'
            when 'liability_non_current' then 'pasivo'
            when 'equity'            then 'patrimonio'
            when 'equity_unaffected' then 'patrimonio'
            when 'off_balance'       then 'orden'
            else 'otro'
        end                                               as tipo_cuenta,
        datos->>'account_type' = 'asset_receivable'        as es_cartera_cobrar,
        datos->>'account_type' = 'liability_payable'       as es_cartera_pagar,
        coalesce((datos->>'reconcile')::boolean, false)    as permite_conciliacion,
        not coalesce((datos->>'deprecated')::boolean, false) as activa,
        fuente_origen,
        extraido_en
    from {{ source('bronce', 'account_account') }}
),

enriquecido as (
    select
        b.empresa_id,
        b.cuenta_codigo,
        b.cuenta_codigo_visible,
        b.nombre,
        b.tipo_cuenta,
        b.es_cartera_cobrar,
        b.es_cartera_pagar,
        b.permite_conciliacion,
        -- En Odoo toda cuenta es imputable; los títulos viven en account.group (no ingestado).
        false                                             as es_titulo,
        b.activa,
        -- Padre = prefijo del código sin el último segmento (derivado, no un id real).
        case when s.total > 1
             then array_to_string((s.segs)[1:s.total - 1], '.')
             else null end                                as cuenta_padre_codigo,
        s.total                                           as nivel,
        p.ruta_codigos,
        -- El nombre real solo existe en la hoja; los intermedios usan su prefijo.
        (p.ruta_codigos)[1:s.total - 1] || b.nombre       as ruta_nombres,
        b.fuente_origen,
        b.extraido_en
    from base b
    cross join lateral (
        select segs, coalesce(array_length(segs, 1), 1) as total
        from (select string_to_array(coalesce(b.cuenta_codigo_visible, b.cuenta_codigo), '.') as segs) x
    ) s
    cross join lateral (
        select array_agg(array_to_string((s.segs)[1:g.n], '.') order by g.n) as ruta_codigos
        from generate_series(1, s.total) g(n)
    ) p
)

{% endif %}

select
    e.empresa_id,
    e.cuenta_codigo,
    e.cuenta_codigo_visible,
    e.nombre,
    e.tipo_cuenta,
    e.es_cartera_cobrar,
    e.es_cartera_pagar,
    e.permite_conciliacion,
    e.es_titulo,
    e.activa,
    e.cuenta_padre_codigo,
    e.nivel,

    -- Niveles aplanados para filtrar/drill-down. Por debajo de la profundidad real de la
    -- cuenta se repite la hoja (jerarquía ragged aplanada): sin (En blanco) en Power BI.
    {% for n in range(1, 6) %}
    coalesce((e.ruta_codigos)[{{ n }}], (e.ruta_codigos)[e.nivel]) as nivel_{{ n }}_codigo,
    coalesce((e.ruta_nombres)[{{ n }}], (e.ruta_nombres)[e.nivel]) as nivel_{{ n }}_nombre{{ ',' }}
    {% endfor %}

    array_to_string(e.ruta_nombres, ' > ')            as ruta_cuenta,
    e.fuente_origen,
    e.extraido_en,
    '{{ this.name }}'::text                           as proceso_transformacion,
    '{{ var("version_proceso", "2.0") }}'::text       as version_proceso
from enriquecido e
