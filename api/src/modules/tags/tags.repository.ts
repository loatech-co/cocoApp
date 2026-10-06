import { Injectable } from '@nestjs/common';

import { Prisma, type Tag } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';

@Injectable()
export class TagsRepository {
  constructor(private readonly db: Database) {}

  findByUser(userId: bigint): Promise<Tag[]> {
    return this.db.forUser(userId, (tx) =>
      tx.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    );
  }

  /**
   * The comparison ignores case ON PURPOSE. MariaDB did it on its own through
   * its collation; Postgres does not, and without this "Comida" and "comida"
   * would be two tags. The UI creates them on the fly while the person types,
   * so case duplicates would show up at once and silently.
   *
   * The name is STORED as it was typed: only the lookup is case-insensitive.
   * Whoever typed "Comida" keeps seeing it that way.
   */
  findByName(userId: bigint, name: string): Promise<Tag | null> {
    return this.db.forUser(userId, (tx) =>
      tx.tag.findFirst({ where: { userId, name: { equals: name, mode: 'insensitive' } } }),
    );
  }

  /** Same lookup, for a row that must exist (it just won a race). */
  findByNameOrThrow(userId: bigint, name: string): Promise<Tag> {
    return this.db.forUser(userId, (tx) =>
      tx.tag.findFirstOrThrow({ where: { userId, name: { equals: name, mode: 'insensitive' } } }),
    );
  }

  findOneOrThrow(userId: bigint, id: bigint): Promise<Tag> {
    return this.db.forUser(userId, (tx) => tx.tag.findFirstOrThrow({ where: { id, userId } }));
  }

  updateColor(userId: bigint, id: bigint, color: string): Promise<Tag> {
    return this.db.forUser(userId, (tx) => tx.tag.update({ where: { id }, data: { color } }));
  }

  /**
   * The new tag, or `null` when the unique (user_id, name) index rejected it:
   * between the SELECT and the INSERT another request created the same tag.
   */
  async createUnlessTaken(userId: bigint, name: string, color: string | null): Promise<Tag | null> {
    try {
      return await this.db.forUser(userId, (tx) =>
        tx.tag.create({ data: { userId, name, color } }),
      );
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
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.tag.updateMany({
        where: { id, userId },
        data: { name: data.name, ...(data.color !== undefined && { color: data.color }) },
      }),
    );
    return count;
  }

  async delete(userId: bigint, id: bigint): Promise<number> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.tag.deleteMany({ where: { id, userId } }),
    );
    return count;
  }
}
