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

/** Restricts a route to certain roles. Without it, any authenticated user gets through. */
export const Roles = (...roles: UserRole[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);

/**
 * Authorization by role.
 *
 * It runs AFTER the JwtAuthGuard, so `request.user.role` already comes from
 * the database and not the token: demoting someone takes effect on the next
 * request, not when their session expires.
 *
 * It answers 404 and not 403 on admin routes, so as not to confirm to a
 * regular user that the panel exists.
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
