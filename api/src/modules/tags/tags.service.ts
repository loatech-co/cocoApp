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
   * Get-or-create idempotente sobre el unique (user_id, name).
   *
   * El PRD es explícito: un nombre repetido NO es un error, devuelve la
   * etiqueta existente. La UI las crea al vuelo mientras el usuario escribe, y
   * un 409 ahí sería fricción sin ningún beneficio.
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

    // Entre el SELECT y el INSERT, otra petición creó la misma etiqueta. No es
    // un error para quien pide —el PRD dice que un nombre repetido devuelve la
    // existente—, así que se vuelve a buscar y se devuelve la que ganó la
    // carrera.
    return tagOf(await this.repository.findByNameOrThrow(userId, trimmed));
  }

  /** Resuelve una lista de nombres a ids, creando las que falten. */
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

  /** Borrar una etiqueta se lleva sus vínculos por CASCADE, no los movimientos. */
  async remove(userId: bigint, id: bigint): Promise<void> {
    if ((await this.repository.delete(userId, id)) === 0) {
      throw new NotFoundError('La etiqueta no existe.');
    }
  }
}

function tagOf(tag: TagRow): Tag {
  return { id: tag.id, name: tag.name, color: tag.color };
}
