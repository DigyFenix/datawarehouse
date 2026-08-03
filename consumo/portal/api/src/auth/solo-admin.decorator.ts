import { SetMetadata } from '@nestjs/common';

export const SOLO_ADMIN = 'soloAdmin';
/** Exige que el usuario sea admin de SU organización (es_admin fresco de la BD). */
export const SoloAdmin = () => SetMetadata(SOLO_ADMIN, true);
