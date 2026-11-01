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

/**
 * Desglose de una métrica por dimensión (oro.metrica_valor_dimension): suma del rango
 * de períodos por miembro, ordenado por valor. La dimensión viene de un enum cerrado
 * (Zod) y la métrica del alcance; el orden y el límite son parámetros, no texto.
 */
export const SQL_METRICA_DIMENSION = `
  select empresa_id, miembro_codigo, miembro_nombre, sum(valor) as valor, count(distinct periodo) as periodos
    from oro.metrica_valor_dimension
   where metrica_clave = $1
     and dimension = $2
     and ($3::text is null or periodo >= $3)
     and ($4::text is null or periodo <= $4)
     and empresa_id = any($5::text[])
   group by empresa_id, miembro_codigo, miembro_nombre
   order by case when $6::text = 'menor' then sum(valor) end asc,
            case when $6::text = 'menor' then null else sum(valor) end desc,
            miembro_codigo, empresa_id
   limit $7
`;

/**
 * DESCARGA tabulada de una métrica por período y miembro de una dimensión
 * (oro.metrica_valor_dimension), sin ranking: todas las filas del rango, acotadas por un
 * tope fijo de filas. Mismas guardas que el desglose: métrica del alcance, dimensión del
 * enum, empresas del usuario.
 */
export const SQL_DESCARGA_DIMENSION_MENSUAL = `
  select empresa_id, periodo, miembro_codigo, miembro_nombre, valor
    from oro.metrica_valor_dimension
   where metrica_clave = $1
     and dimension = $2
     and ($3::text is null or periodo >= $3)
     and ($4::text is null or periodo <= $4)
     and empresa_id = any($5::text[])
   order by periodo, empresa_id, valor desc, miembro_codigo
   limit $6
`;

/** Descarga del aging completo por socio (todos los socios con saldo) al último corte. */
export const SQL_DESCARGA_AGING_SOCIO = `
  select a.empresa_id, a.socio_codigo, a.socio_nombre, a.rango_aging,
         coalesce(min(r.rango_aging_nombre), a.rango_aging) as rango_nombre,
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
   group by a.empresa_id, a.socio_codigo, a.socio_nombre, a.rango_aging
   order by a.socio_nombre, min(r.rango_aging_orden)
   limit $3
`;

/** Qué métricas admiten desglose y por qué dimensiones (tabla pequeña, se lee por mensaje). */
export const SQL_METRICAS_DESGLOSABLES = `
  select metrica_clave, dimension
    from oro.metrica_dimension_catalogo
`;

/** empresa_id existentes en el warehouse (para el rango de períodos con alcance '*'). */
export const SQL_EMPRESAS_WAREHOUSE = `
  select distinct empresa_id
    from oro.metrica_valor
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
         coalesce(min(r.rango_aging_nombre), a.rango_aging) as rango_nombre,
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
// `hecho_origen` guarda la CLAVE del hecho (`hecho_venta_linea`), no su id: cruzarlo
// contra `h.id` reventaba con «operator does not exist: bigint = text» y dejaba la
// tool de explicar inservible para TODAS las métricas.
export const SQL_FICHA_METRICA = `
  select m.clave, m.nombre_oficial, m.definicion_negocio, m.formula, m.periodicidad,
         m.estado, m.version_definicion, h.nombre_negocio as hecho_nombre, h.grano
    from metadatos.catalogo_metricas m
    left join metadatos.catalogo_hechos h on h.clave = m.hecho_origen
   where m.clave = $1
`;

/** Métricas del catálogo en estado consumible por el agente (guarda 2: el ÚNICO
 *  punto donde el paquete lee estados; borrador/en_revision/deprecada quedan fuera). */
export const SQL_METRICAS_CONSUMIBLES = `
  select clave, nombre_oficial, definicion_negocio, estado
    from metadatos.catalogo_metricas
   where estado in ('certificada', 'exploratoria')
`;

/** Variante estricta (configuración del host `AGENTE_SOLO_CERTIFICADAS`): ni las exploratorias
 *  entran al alcance. El usuario no puede saltárselo porque no es una regla del prompt sino el
 *  filtro con el que se construye el catálogo autorizado. */
export const SQL_METRICAS_CERTIFICADAS = `
  select clave, nombre_oficial, definicion_negocio, estado
    from metadatos.catalogo_metricas
   where estado = 'certificada'
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

/** Indicadores compuestos por la organización sobre métricas ya certificadas. */
export const SQL_DERIVADAS = `
  select clave, nombre, definicion, operacion, operando_a, operando_b, unidad
    from portal.metricas_derivadas
   where activa
   order by nombre
`;

// ---------------------------------------------------------------- tenant (portal)

/** Contexto {empresa_id, periodo} de una conversación (migración 142). Lo ejecuta el HOST con su
 *  pool normal (no portal_lector): es estado del portal, no dato del warehouse. */
export const SQL_LEER_CONTEXTO_CONVERSACION = `
  select contexto
    from portal.chat_conversaciones
   where id = $1
`;

/** Guarda el contexto tras el turno (jsonb validado por `normalizarContexto`). */
export const SQL_GUARDAR_CONTEXTO_CONVERSACION = `
  update portal.chat_conversaciones
     set contexto = $2::jsonb
   where id = $1
`;

/** Preguntas previas de la conversación con las consultas que las respondieron (detección de
 *  repetición). Empareja cada mensaje del usuario con la respuesta del asistente que le sigue. */
export const SQL_TURNOS_CON_CONSULTAS = `
  select u.contenido as pregunta,
         coalesce(a.datos->'consultas', '[]'::jsonb) as consultas
    from portal.chat_mensajes u
    join lateral (
      select m.datos
        from portal.chat_mensajes m
       where m.conversacion_id = u.conversacion_id and m.id > u.id and m.rol = 'asistente'
       order by m.id
       limit 1
    ) a on true
   where u.conversacion_id = $1 and u.rol = 'usuario'
   order by u.id desc
   limit $2
`;

/** Alcances de los perfiles ACTIVOS del usuario (portal.perfil_alcances). */
export const SQL_ALCANCES_USUARIO = `
  select pa.recurso_tipo, pa.recurso_clave
    from portal.perfil_alcances pa
    join portal.perfiles p        on p.id = pa.perfil_id and p.activo
    join portal.usuario_perfiles up on up.perfil_id = pa.perfil_id
   where up.usuario_id = $1
`;
