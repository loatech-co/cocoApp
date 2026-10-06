import type { UserRole } from '../../generated/prisma/client';

/**
 * The user the JwtAuthGuard resolved from the verified access token.
 *
 * `id` is the internal user_id and the ONLY value the app uses to scope
 * queries. It never comes from the client.
 */
export interface AuthenticatedUser {
  /** Internal primary key in `users`. Every `where` uses it to scope. */
  id: bigint;
  email: string;
  role: UserRole;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
