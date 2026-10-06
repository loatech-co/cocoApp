import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { UserRole } from '../../generated/prisma/client';

const ROLES_KEY = 'roles';

/** Restringe una ruta a ciertos roles. Sin él, cualquier usuario autenticado pasa. */
export const Roles = (...roles: UserRole[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);

/**
 * Autorización por rol.
 *
 * Corre DESPUÉS del JwtAuthGuard, así que `request.user.role` ya viene de la
 * base y no del token: degradar a alguien tiene efecto en la siguiente
 * petición, no cuando expire su sesión.
 *
 * Responde 404 y no 403 en las rutas de administración, para no confirmarle a
 * un usuario común que ese panel existe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.user?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException('No tienes permiso para esta operación.');
    }

    return true;
  }
}
