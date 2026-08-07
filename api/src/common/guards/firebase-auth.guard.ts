import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as admin from 'firebase-admin';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { FIREBASE_ADMIN } from '../firebase/firebase-admin.provider';
import { UsersService } from '../../modules/users/users.service';

/**
 * Barrera de autenticación de toda la API.
 *
 * Se registra como guard GLOBAL (APP_GUARD) a propósito: si la protección
 * fuera opt-in, tarde o temprano un controlador nuevo se publicaría sin
 * querer. Aquí es al revés — abrir una ruta exige marcarla con @Public().
 *
 * `verifyIdToken` valida criptográficamente firma RS256, `aud` (project id),
 * `iss` y `exp` contra las llaves públicas de Google. No se implementa nada de
 * eso a mano.
 *
 * De aquí sale el `user_id` que usa TODA la aplicación para scopear consultas.
 * Jamás se acepta un `user_id` que venga del cliente: sería trivial cambiarlo
 * en el body o la URL para leer datos ajenos (IDOR).
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);
  private readonly checkRevoked: boolean;

  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebase: admin.app.App,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    // checkRevoked hace una llamada extra a Firebase por petición para detectar
    // sesiones revocadas. Es el default seguro; se puede apagar por entorno si
    // esa latencia llegara a pesar.
    this.checkRevoked = config.get<string>('FIREBASE_CHECK_REVOKED', 'true') !== 'false';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Autenticación requerida.');
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await this.firebase.auth().verifyIdToken(token, this.checkRevoked);
    } catch (error) {
      // El motivo real se registra en el log interno; al cliente solo le llega
      // un 401 genérico, para no darle pistas a quien esté probando tokens.
      this.logger.warn(
        `Token rechazado: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    if (!decoded.email) {
      throw new UnauthorizedException('El token no incluye un correo verificable.');
    }

    // Aprovisionamiento perezoso: la primera vez que llega un token válido, se
    // crea la fila en `users`. Es idempotente (upsert por firebase_uid).
    const user = await this.users.findOrCreateByFirebaseUid({
      firebaseUid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name ?? null,
    });

    request.user = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
    };

    return true;
  }

  private extractBearer(header: string | undefined): string | null {
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
