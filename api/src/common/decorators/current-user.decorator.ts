import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects into the controller the user the JwtAuthGuard resolved from the
 * verified token.
 *
 * If it is missing, it is a programming error (a route marked @Public() that
 * still asks for the user), not a client error: hence 500 and not 401.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new InternalServerErrorException(
        'Se pidió @CurrentUser() en una ruta sin autenticación. Revisa si lleva @Public().',
      );
    }
    return request.user;
  },
);
