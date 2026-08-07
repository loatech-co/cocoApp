import type { UserRole } from '@prisma/client';

/**
 * Usuario resuelto por el JwtAuthGuard a partir del access token verificado.
 *
 * `id` es el user_id interno y es el ÚNICO valor que la aplicación usa para
 * scopear consultas. Nunca proviene del cliente.
 */
export interface AuthenticatedUser {
  /** PK interna en `users`. Todo `where` la usa para scopear. */
  id: bigint;
  email: string;
  role: UserRole;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
