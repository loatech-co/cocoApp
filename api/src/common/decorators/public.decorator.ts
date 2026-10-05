import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exime a una ruta del FirebaseAuthGuard global.
 *
 * El guard es global a propósito: así ninguna ruta queda desprotegida por
 * olvido. Abrir una ruta exige escribirlo explícitamente, que es justo lo que
 * se quiere revisar en un PR.
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
