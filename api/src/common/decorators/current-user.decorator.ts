import { createParamDecorator, InternalServerErrorException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Inyecta en el controlador el usuario que el FirebaseAuthGuard resolvió a
 * partir del token verificado.
 *
 * Si falta, es un error de programación (una ruta marcada @Public() que aun así
 * pide el usuario), no un error del cliente: por eso 500 y no 401.
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
