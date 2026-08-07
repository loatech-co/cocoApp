import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type * as admin from 'firebase-admin';

import { FirebaseAuthGuard } from './firebase-auth.guard';
import type { UsersService } from '../../modules/users/users.service';

/**
 * La barrera de seguridad de toda la API. Si estas pruebas se ponen en rojo,
 * cualquier ruta queda expuesta, así que se cubren los cuatro caminos de
 * rechazo además del feliz.
 */
describe('FirebaseAuthGuard', () => {
  let guard: FirebaseAuthGuard;
  let verifyIdToken: jest.Mock;
  let findOrCreateByFirebaseUid: jest.Mock;
  let reflector: Reflector;
  let request: { headers: Record<string, string | undefined>; user?: unknown };

  const buildContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    request = { headers: {} };
    verifyIdToken = jest.fn();
    findOrCreateByFirebaseUid = jest.fn().mockResolvedValue({
      id: BigInt(7),
      firebaseUid: 'uid-abc',
      email: 'dueño@coco.app',
    });

    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const firebaseApp = {
      auth: () => ({ verifyIdToken }),
    } as unknown as admin.app.App;

    guard = new FirebaseAuthGuard(
      firebaseApp,
      reflector,
      { findOrCreateByFirebaseUid } as unknown as UsersService,
      new ConfigService({ FIREBASE_CHECK_REVOKED: 'true' }),
    );
  });

  it('deja pasar una ruta marcada @Public() sin mirar el token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rechaza cuando no hay header Authorization', async () => {
    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rechaza un esquema que no sea Bearer', async () => {
    request.headers.authorization = 'Basic dXNlcjpwYXNz';

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rechaza un token con la firma alterada', async () => {
    request.headers.authorization = 'Bearer token-con-firma-rota';
    verifyIdToken.mockRejectedValue(new Error('Firebase ID token has invalid signature.'));

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token expirado', async () => {
    request.headers.authorization = 'Bearer token-vencido';
    verifyIdToken.mockRejectedValue(new Error('Firebase ID token has expired.'));

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token verificado que no trae correo', async () => {
    request.headers.authorization = 'Bearer token-sin-correo';
    verifyIdToken.mockResolvedValue({ uid: 'uid-abc' });

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findOrCreateByFirebaseUid).not.toHaveBeenCalled();
  });

  it('acepta un token válido y adjunta el user_id derivado del token', async () => {
    request.headers.authorization = 'Bearer token-bueno';
    verifyIdToken.mockResolvedValue({
      uid: 'uid-abc',
      email: 'dueño@coco.app',
      name: 'Dueño',
    });

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);

    expect(verifyIdToken).toHaveBeenCalledWith('token-bueno', true);
    expect(request.user).toEqual({
      id: BigInt(7),
      firebaseUid: 'uid-abc',
      email: 'dueño@coco.app',
    });
  });

  it('nunca toma el user_id del cliente: siempre sale del token verificado', async () => {
    // Aunque el atacante inyecte un usuario en la request, el guard lo pisa.
    request.user = { id: BigInt(999), firebaseUid: 'ajeno', email: 'atacante@mal.com' };
    request.headers.authorization = 'Bearer token-bueno';
    verifyIdToken.mockResolvedValue({ uid: 'uid-abc', email: 'dueño@coco.app' });

    await guard.canActivate(buildContext());

    expect(request.user).toEqual({
      id: BigInt(7),
      firebaseUid: 'uid-abc',
      email: 'dueño@coco.app',
    });
  });
});
