/**
 * GUARDA 1 (parte b): TODO el SQL del agente vive aquí, como CONSTANTES con
 * placeholders posicionales. Ninguna función de este paquete concatena texto
 * dentro de una consulta; el LLM elige tool + parámetros y los parámetros ya
 * pasaron Zod. El test estático del paquete verifica que ninguna de estas
 * plantillas contenga interpolación de cadena.
 *
 * El filtro `empresa_id = any($n)` va SIEMPRE aunque el RLS de Postgres ya
 * proteja: defensa en profundidad y errores más claros para el usuario.
 */

/** Valores mensuales de una métrica del catálogo (oro.metrica_valor). */
export const SQL_METRICA_VALOR = `
  select empresa_id, periodo, valor
    from oro.metrica_valor
   where metrica_clave = $1
     and ($2::text is null or periodo >= $2)
     and ($3::text is null or periodo <= $3)
     and empresa_id = any($4::text[])
   order by periodo, empresa_id
`;

/** Rango de períodos con datos por métrica (para el prompt y listar_metricas). */
export const SQL_PERIODOS_METRICA = `
  select metrica_clave,
         min(periodo) as periodo_desde,
         max(periodo) as periodo_hasta
    from oro.metrica_valor
   where empresa_id = any($1::text[])
   group by metrica_clave
`;

/** Dominio canónico por clave (la fuente cuyos dominios administra la UI de alcances). */
export const SQL_DOMINIOS_METRICA = `
  select distinct metrica_clave, dominio
    from oro.metrica_valor
`;

/** Aging por rango a la última fecha de corte (oro.metrica_aging). El orden de
 *  presentación vive en dim_rango_aging (sin él, '+90' saldría antes que '1-30'). */
export const SQL_AGING_POR_RANGO = `
  select a.rango_aging,
         sum(a.saldo_local) as saldo,
         sum(a.partidas)    as partidas
    from oro.metrica_aging a
    left join oro.dim_rango_aging r on r.rango_aging = a.rango_aging
   where a.tipo_cartera = $1
     and a.empresa_id = any($2::text[])
     and a.fecha_corte = (
       select max(fecha_corte) from oro.metrica_aging
        where tipo_cartera = $1 and empresa_id = any($2::text[])
     )
   group by a.rango_aging
   order by min(r.rango_aging_orden)
`;

/** Aging por socio (top-N por saldo) a la última fecha de corte. */
export const SQL_AGING_POR_SOCIO = `
  select socio_nombre,
         sum(saldo_local) as saldo,
         sum(partidas)    as partidas
    from oro.metrica_aging
   where tipo_cartera = $1
     and empresa_id = any($2::text[])
     and fecha_corte = (
       select max(fecha_corte) from oro.metrica_aging
        where tipo_cartera = $1 and empresa_id = any($2::text[])
     )
   group by socio_nombre
   order by sum(saldo_local) desc
   limit $3
`;

/** Fecha de corte vigente del aging (se reporta junto al dato: es una foto, no un flujo). */
export const SQL_AGING_CORTE = `
  select max(fecha_corte) as fecha_corte
    from oro.metrica_aging
   where tipo_cartera = $1 and empresa_id = any($2::text[])
`;

// ---------------------------------------------------------------- BD de control

/** Ficha de gobierno de una métrica (catálogo + hecho origen). */
export const SQL_FICHA_METRICA = `
  select m.clave, m.nombre_oficial, m.definicion_negocio, m.formula, m.periodicidad,
         m.estado, m.version_definicion, h.nombre_negocio as hecho_nombre, h.grano
    from metadatos.catalogo_metricas m
    left join metadatos.catalogo_hechos h on h.id = m.hecho_origen
   where m.clave = $1
`;

/** Métricas del catálogo en estado consumible por el agente (guarda 2: el ÚNICO
 *  punto donde el paquete lee estados; borrador/en_revision/deprecada quedan fuera). */
export const SQL_METRICAS_CONSUMIBLES = `
  select clave, nombre_oficial, definicion_negocio, estado
    from metadatos.catalogo_metricas
   where estado in ('certificada', 'exploratoria')
`;

/** Glosario de negocio (global; el del tenant se administra en el portal admin). */
export const SQL_GLOSARIO = `
  select termino, definicion, equivale_a
    from metadatos.glosario_negocio
   order by termino
`;

/** Glosario propio de la organización (portal.glosario del tenant). Se superpone
 *  al base: ante un término repetido manda el de la casa. */
export const SQL_GLOSARIO_TENANT = `
  select termino, definicion, equivale_a
    from portal.glosario
   order by termino
`;

// ---------------------------------------------------------------- tenant (portal)

/** Alcances de los perfiles ACTIVOS del usuario (portal.perfil_alcances). */
export const SQL_ALCANCES_USUARIO = `
  select pa.recurso_tipo, pa.recurso_clave
    from portal.perfil_alcances pa
    join portal.perfiles p        on p.id = pa.perfil_id and p.activo
    join portal.usuario_perfiles up on up.perfil_id = pa.perfil_id
   where up.usuario_id = $1
`;
