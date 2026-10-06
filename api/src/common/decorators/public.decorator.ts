import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exempts a route from the global JwtAuthGuard.
 *
 * The guard is global on purpose: that way no route is left unprotected by
 * oversight. Opening a route requires writing it explicitly, which is exactly
 * what one wants to review in a PR.
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
