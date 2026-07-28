/** Esquemas Zod para las entradas del módulo organizaciones (validación externa). */
import { z } from 'zod';

export const crearOrganizacionSchema = z.object({
  codigo: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'solo minúsculas, números y guion bajo'),
  nombre: z.string().min(2).max(200),
  sector: z.string().max(200).optional(),
  erpTipo: z.enum(['sap_b1', 'odoo']).default('sap_b1'),
  estado: z.enum(['activa', 'inactiva', 'en_arranque']).default('en_arranque'),
  // Solo la REFERENCIA al secreto, nunca el valor de la credencial (§12).
  secretoConexionRef: z.string().max(200).optional(),
  // Marca white-label: color primario en hex (#RRGGBB). Los demás tonos derivan.
  colorMarca: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex #RRGGBB')
    .nullable()
    .optional(),
});

export const actualizarOrganizacionSchema = crearOrganizacionSchema.partial().omit({ codigo: true });

export type CrearOrganizacionDto = z.infer<typeof crearOrganizacionSchema>;
export type ActualizarOrganizacionDto = z.infer<typeof actualizarOrganizacionSchema>;
