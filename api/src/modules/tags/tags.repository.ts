import { Injectable } from '@nestjs/common';
import { Prisma, type Tag } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: bigint): Promise<Tag[]> {
    return this.prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  /**
   * La comparación ignora mayúsculas A PROPÓSITO. MariaDB lo hacía solo por
   * su colación; Postgres distingue, y sin esto "Comida" y "comida" serían
   * dos etiquetas. La UI las crea al vuelo mientras la persona escribe, así
   * que los duplicados por mayúscula aparecerían enseguida y en silencio.
   *
   * El nombre se GUARDA tal cual se escribió: solo la búsqueda es
   * insensible. Quien escribió "Comida" la sigue viendo así.
   */
  findByName(userId: bigint, name: string): Promise<Tag | null> {
    return this.prisma.tag.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
    });
  }

  /** Same lookup, for a row that must exist (it just won a race). */
  findByNameOrThrow(userId: bigint, name: string): Promise<Tag> {
    return this.prisma.tag.findFirstOrThrow({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
    });
  }

  findOneOrThrow(userId: bigint, id: bigint): Promise<Tag> {
    return this.prisma.tag.findFirstOrThrow({ where: { id, userId } });
  }

  updateColor(id: bigint, color: string): Promise<Tag> {
    return this.prisma.tag.update({ where: { id }, data: { color } });
  }

  /**
   * The new tag, or `null` when the unique (user_id, name) index rejected it:
   * between the SELECT and the INSERT another request created the same tag.
   */
  async createUnlessTaken(userId: bigint, name: string, color: string | null): Promise<Tag | null> {
    try {
      return await this.prisma.tag.create({ data: { userId, name, color } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  /** `updateMany` with the owner in the where: 0 when it is not theirs. */
  async update(
    userId: bigint,
    id: bigint,
    data: { name: string; color?: string | undefined },
  ): Promise<number> {
    const { count } = await this.prisma.tag.updateMany({
      where: { id, userId },
      data: { name: data.name, ...(data.color !== undefined && { color: data.color }) },
    });
    return count;
  }

  async delete(userId: bigint, id: bigint): Promise<number> {
    const { count } = await this.prisma.tag.deleteMany({ where: { id, userId } });
    return count;
  }
}
