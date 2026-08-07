import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let upsert: jest.Mock;

  beforeEach(async () => {
    upsert = jest.fn().mockImplementation(({ where }: { where: { firebaseUid: string } }) =>
      Promise.resolve({
        id: BigInt(1),
        firebaseUid: where.firebaseUid,
        email: 'dueño@coco.app',
        displayName: 'Dueño',
      }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { user: { upsert, findUnique: jest.fn() } } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('aprovisiona el usuario con un upsert sobre firebase_uid', async () => {
    await service.findOrCreateByFirebaseUid({
      firebaseUid: 'uid-abc',
      email: 'dueño@coco.app',
      displayName: 'Dueño',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { firebaseUid: 'uid-abc' },
      update: { email: 'dueño@coco.app', displayName: 'Dueño' },
      create: {
        firebaseUid: 'uid-abc',
        email: 'dueño@coco.app',
        displayName: 'Dueño',
      },
    });
  });

  it('es idempotente: N accesos del mismo firebase_uid no crean filas nuevas', async () => {
    const input = {
      firebaseUid: 'uid-abc',
      email: 'dueño@coco.app',
      displayName: 'Dueño',
    };

    const primero = await service.findOrCreateByFirebaseUid(input);
    const segundo = await service.findOrCreateByFirebaseUid(input);
    const tercero = await service.findOrCreateByFirebaseUid(input);

    // Siempre el mismo usuario, y nunca se usó `create` a secas: el upsert
    // sobre el índice único es lo que evita duplicados si dos peticiones del
    // primer login llegan a la vez.
    expect(primero.id).toBe(segundo.id);
    expect(segundo.id).toBe(tercero.id);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls.every(([arg]) => arg.where.firebaseUid === 'uid-abc')).toBe(true);
  });

  it('refresca correo y nombre desde el token: la autoridad es Firebase, no la tabla', async () => {
    await service.findOrCreateByFirebaseUid({
      firebaseUid: 'uid-abc',
      email: 'nuevo@coco.app',
      displayName: 'Nombre Nuevo',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { email: 'nuevo@coco.app', displayName: 'Nombre Nuevo' },
      }),
    );
  });
});
