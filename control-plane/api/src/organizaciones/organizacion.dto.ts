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
  // Base del plano de datos del tenant. Si no se envía, el servicio la deriva (dw_<codigo>).
  baseDatosDw: z
    .string()
    .max(63)
    .regex(/^[a-z0-9_]+$/, 'solo minúsculas, números y guion bajo')
    .optional(),
});

export const actualizarOrganizacionSchema = crearOrganizacionSchema.partial().omit({ codigo: true });

// Logo del tenant (white-label del portal de usuario). Se sube como base64 en JSON
// (validable con Zod, sin multipart); el servicio verifica el tamaño real decodificado
// Y los magic bytes. SVG queda EXCLUIDO a propósito: puede llevar <script> y se sirve
// same-origin en el portal de usuario (XSS almacenado).
export const subirLogoSchema = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  datosBase64: z.string().min(1).max(600_000), // ~450 KB de binario máx. antes del límite duro
});

export type CrearOrganizacionDto = z.infer<typeof crearOrganizacionSchema>;
export type ActualizarOrganizacionDto = z.infer<typeof actualizarOrganizacionSchema>;
export type SubirLogoDto = z.infer<typeof subirLogoSchema>;
