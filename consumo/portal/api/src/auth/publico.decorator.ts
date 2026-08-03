import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';
/** Marca una ruta como pública (sin JWT): branding, logo y login. */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
