import { z } from 'zod';

// --- Política de ingesta (por objeto) ---------------------------------------

const tipoObjeto = z.enum(['hecho', 'maestro']);
const estrategia = z.enum(['incremental_ventana', 'abiertos', 'full_replace', 'versionado']);
const lookbackUnidad = z.enum(['dias', 'meses']);

// Toda la configuración de ingesta cuelga de una organización (§4 base vs instancia).
// Un id de organización siempre presente y explícito: el portal no adivina el tenant.
export const organizacionIdSchema = z.coerce
  .number({ invalid_type_error: 'Falta la organización (organizacionId) o no es un número' })
  .int()
  .positive('El id de organización debe ser positivo');

export const filtroOrganizacionSchema = z.object({ organizacionId: organizacionIdSchema });

export type FiltroOrganizacionDto = z.infer<typeof filtroOrganizacionSchema>;

export const filtroCamposSchema = z.object({
  organizacionId: organizacionIdSchema,
  objeto: z.string().min(1).max(100),
});

export type FiltroCamposDto = z.infer<typeof filtroCamposSchema>;

const politicaBase = z.object({
  organizacionId: organizacionIdSchema,
  objeto: z.string().min(1).max(100),
  nombreNegocio: z.string().min(1).max(200),
  dominio: z.string().min(1).max(100),
  tipoObjeto,
  estrategia,
  fuenteObjeto: z.string().min(1).max(200),
  campoFecha: z.string().max(100).optional(),
  lookbackValor: z.number().int().positive().optional(),
  lookbackUnidad: lookbackUnidad.optional(),
  claveNatural: z.string().min(1).max(200),
  columnasVersionado: z.array(z.string().min(1)).default([]),
  modelosDbt: z.string().max(500).nullable().optional(),
  // Condición extra aplicada EN EL ORIGEN sobre la tabla principal (se une con AND a la
  // ventana). Escotilla del paquete base para lo que no se expresa como campo/valor:
  // p. ej. `"DocDate" >= '2026-01-01'` o la apertura de cartera `"BalDueDeb" <> "BalDueCred"`.
  filtroOrigen: z.string().max(500).nullable().optional(),
  activo: z.boolean().default(true),
  owner: z.string().min(1).max(100),
});

// Coherencia espejo de los CHECK del DDL (90_politica_ingesta.sql): estrategia por tipo y
// ventana completa. Se valida en la API para dar error claro antes de tocar la BD.
function coherenciaPolitica(
  d: {
    tipoObjeto?: 'hecho' | 'maestro';
    estrategia?: z.infer<typeof estrategia>;
    campoFecha?: string;
    lookbackValor?: number;
    lookbackUnidad?: 'dias' | 'meses';
  },
  ctx: z.RefinementCtx,
): void {
  const deHecho = ['incremental_ventana', 'abiertos'];
  const deMaestro = ['full_replace', 'versionado'];
  if (d.tipoObjeto && d.estrategia) {
    const ok =
      (d.tipoObjeto === 'hecho' && deHecho.includes(d.estrategia)) ||
      (d.tipoObjeto === 'maestro' && deMaestro.includes(d.estrategia));
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estrategia'],
        message: `Estrategia '${d.estrategia}' no es válida para tipo '${d.tipoObjeto}'`,
      });
    }
  }
  if (d.estrategia === 'incremental_ventana') {
    if (!d.campoFecha)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['campoFecha'], message: 'Requerido para ventana móvil' });
    if (d.lookbackValor == null)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lookbackValor'], message: 'Requerido para ventana móvil' });
    if (!d.lookbackUnidad)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lookbackUnidad'], message: 'Requerido para ventana móvil' });
  }
}

export const crearPoliticaSchema = politicaBase.superRefine(coherenciaPolitica);
// Ni el objeto ni la organización se reasignan: eso sería otra política, no una edición.
export const actualizarPoliticaSchema = politicaBase
  .omit({ objeto: true, organizacionId: true })
  .partial()
  .superRefine(coherenciaPolitica);

export type CrearPoliticaDto = z.infer<typeof crearPoliticaSchema>;
export type ActualizarPoliticaDto = z.infer<typeof actualizarPoliticaSchema>;

// --- Plan de ingesta (corrida) ----------------------------------------------

const planBase = z.object({
  organizacionId: organizacionIdSchema,
  nombre: z.string().min(1).max(100),
  descripcion: z.string().max(500).optional(),
  cron: z.string().min(1).max(100),
  empresas: z.array(z.string().min(1)).min(1),
  objetos: z.array(z.string().min(1)).min(1),
  encadenaTransformacion: z.boolean().default(true),
  activo: z.boolean().default(true),
});

export const crearPlanSchema = planBase;
export const actualizarPlanSchema = planBase
  .omit({ nombre: true, organizacionId: true })
  .partial();

export type CrearPlanDto = z.infer<typeof crearPlanSchema>;
export type ActualizarPlanDto = z.infer<typeof actualizarPlanSchema>;

// --- Dominio (catálogo administrable) ---------------------------------------

export const crearDominioSchema = z.object({
  clave: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'Solo minúsculas, dígitos y guion bajo; empieza por letra'),
  nombre: z.string().min(1).max(100),
  descripcion: z.string().max(300).optional(),
});

export type CrearDominioDto = z.infer<typeof crearDominioSchema>;

// --- Campo de ingesta (columna de origen → canónico) ------------------------

const transformacion = z.enum([
  'directo', 'booleano_yn', 'signo_nc', 'cast_fecha', 'cast_numeric', 'region',
]);

// Actualización desde el portal: el usuario ajusta inclusión y mapeo del campo.
export const actualizarCampoSchema = z.object({
  incluido: z.boolean().optional(),
  sugerido: z.boolean().optional(),
  campoCanonico: z.string().max(100).nullable().optional(),
  transformacion: transformacion.optional(),
  descripcion: z.string().max(300).nullable().optional(),
});

export type ActualizarCampoDto = z.infer<typeof actualizarCampoSchema>;

// --- Descubrir (introspección) ----------------------------------------------

// La organización viaja junto a la sociedad: el servicio verifica que la sociedad
// pertenezca a esa organización antes de mandar la orden al worker (§12 aislamiento).
export const descubrirSchema = z.object({
  organizacionId: organizacionIdSchema,
  objeto: z.string().min(1).max(100),
  sociedad: z.string().min(1).max(50),
  tablas: z.array(z.string().min(1)).optional(),
});

export type DescubrirDto = z.infer<typeof descubrirSchema>;

export const extraerSchema = z.object({
  organizacionId: organizacionIdSchema,
  objeto: z.string().min(1).max(100),
  sociedad: z.string().min(1).max(50),
});

export type ExtraerDto = z.infer<typeof extraerSchema>;

// --- Transformar (dbt build Bronze→Gold) ------------------------------------

export const transformarSchema = z.object({
  organizacionId: organizacionIdSchema,
  objeto: z.string().min(1).max(100),
  sociedad: z.string().min(1).max(50).optional(),
});

export type TransformarDto = z.infer<typeof transformarSchema>;
