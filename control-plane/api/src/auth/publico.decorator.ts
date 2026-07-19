/** Marca una ruta como pública (sin autenticación). El guard global la deja pasar. */
import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'es_publico';
export const Publico = () => SetMetadata(ES_PUBLICO, true);
