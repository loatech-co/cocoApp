import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface FindOrCreateUserInput {
  firebaseUid: string;
  email: string;
  displayName: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aprovisionamiento perezoso del usuario local a partir del token de Firebase.
   *
   * Es IDEMPOTENTE: el `upsert` sobre el índice único `firebase_uid` garantiza
   * que N peticiones del mismo usuario produzcan exactamente una fila. Sin
   * esto, dos peticiones concurrentes del primer login crearían duplicados.
   *
   * En cada acceso se refresca email y nombre desde el token, porque la
   * autoridad de identidad es Firebase, no esta tabla.
   */
  async findOrCreateByFirebaseUid(input: FindOrCreateUserInput): Promise<User> {
    return this.prisma.user.upsert({
      where: { firebaseUid: input.firebaseUid },
      update: {
        email: input.email,
        displayName: input.displayName,
      },
      create: {
        firebaseUid: input.firebaseUid,
        email: input.email,
        displayName: input.displayName,
      },
    });
  }

  async findById(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
