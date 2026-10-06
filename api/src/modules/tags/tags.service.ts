import { Injectable } from '@nestjs/common';

import type { UpsertTagDto } from './tags.dto';
import { TagsRepository } from './tags.repository';
import { NotFoundError } from '../../common/errors/domain-error';
import type { Tag as TagRow } from '../../generated/prisma/client';

/** A tag, as the service hands it out (the domain). */
export interface Tag {
  id: bigint;
  name: string;
  color: string | null;
}

@Injectable()
export class TagsService {
  constructor(private readonly repository: TagsRepository) {}

  async list(userId: bigint): Promise<Tag[]> {
    return (await this.repository.findByUser(userId)).map(tagOf);
  }

  /**
   * Idempotent get-or-create on the unique (user_id, name).
   *
   * The PRD is explicit: a repeated name is NOT an error, it returns the
   * existing tag. The UI creates them on the fly while the user types, and a
   * 409 there would be friction with no benefit.
   */
  async getOrCreate(userId: bigint, name: string, color?: string): Promise<Tag> {
    const trimmed = name.trim();
    const existing = await this.repository.findByName(userId, trimmed);

    if (existing) {
      if (!color) return tagOf(existing);
      return tagOf(await this.repository.updateColor(userId, existing.id, color));
    }

    const created = await this.repository.createUnlessTaken(userId, trimmed, color ?? null);
    if (created) return tagOf(created);

    // Between the SELECT and the INSERT, another request created the same tag.
    // It is not an error for the caller —the PRD says a repeated name returns
    // the existing one—, so it is looked up again and the one that won the
    // race is returned.
    return tagOf(await this.repository.findByNameOrThrow(userId, trimmed));
  }

  /** Resolves a list of names to ids, creating the missing ones. */
  async resolveNames(userId: bigint, names: readonly string[]): Promise<bigint[]> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const tags = await Promise.all(unique.map((trimmed) => this.getOrCreate(userId, trimmed)));
    return tags.map((tag) => tag.id);
  }

  async update(userId: bigint, id: bigint, dto: UpsertTagDto): Promise<Tag> {
    const count = await this.repository.update(userId, id, {
      name: dto.name.trim(),
      color: dto.color,
    });
    if (count === 0) throw new NotFoundError('La etiqueta no existe.');

    return tagOf(await this.repository.findOneOrThrow(userId, id));
  }

  /** Deleting a tag takes its links with it by CASCADE, not the transactions. */
  async remove(userId: bigint, id: bigint): Promise<void> {
    if ((await this.repository.delete(userId, id)) === 0) {
      throw new NotFoundError('La etiqueta no existe.');
    }
  }
}

function tagOf(tag: TagRow): Tag {
  return { id: tag.id, name: tag.name, color: tag.color };
}
