/**
 * Usuario resuelto por el FirebaseAuthGuard a partir del ID token verificado.
 *
 * `id` es el user_id interno de la tabla `users`, y es el ÚNICO valor que la
 * aplicación usa para scopear consultas. Nunca proviene del cliente.
 */
export interface AuthenticatedUser {
  /** PK interna en `users`. Todo `where` la usa para scopear. */
  id: bigint;
  /** `sub` del ID token. Llave estable del proveedor de identidad. */
  firebaseUid: string;
  email: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
