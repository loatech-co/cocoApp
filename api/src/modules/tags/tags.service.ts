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

  async listar(userId: bigint): Promise<Tag[]> {
    return (await this.repository.findByUser(userId)).map(tagOf);
  }

  /**
   * Get-or-create idempotente sobre el unique (user_id, name).
   *
   * El PRD es explícito: un nombre repetido NO es un error, devuelve la
   * etiqueta existente. La UI las crea al vuelo mientras el usuario escribe, y
   * un 409 ahí sería fricción sin ningún beneficio.
   */
  async obtenerOCrear(userId: bigint, name: string, color?: string): Promise<Tag> {
    const nombre = name.trim();
    const existente = await this.repository.findByName(userId, nombre);

    if (existente) {
      if (!color) return tagOf(existente);
      return tagOf(await this.repository.updateColor(userId, existente.id, color));
    }

    const creada = await this.repository.createUnlessTaken(userId, nombre, color ?? null);
    if (creada) return tagOf(creada);

    // Entre el SELECT y el INSERT, otra petición creó la misma etiqueta. No es
    // un error para quien pide —el PRD dice que un nombre repetido devuelve la
    // existente—, así que se vuelve a buscar y se devuelve la que ganó la
    // carrera.
    return tagOf(await this.repository.findByNameOrThrow(userId, nombre));
  }

  /** Resuelve una lista de nombres a ids, creando las que falten. */
  async resolverNombres(userId: bigint, nombres: readonly string[]): Promise<bigint[]> {
    const unicos = [...new Set(nombres.map((n) => n.trim()).filter(Boolean))];
    const tags = await Promise.all(unicos.map((nombre) => this.obtenerOCrear(userId, nombre)));
    return tags.map((tag) => tag.id);
  }

  async actualizar(userId: bigint, id: bigint, dto: UpsertTagDto): Promise<Tag> {
    const count = await this.repository.update(userId, id, {
      name: dto.name.trim(),
      color: dto.color,
    });
    if (count === 0) throw new NotFoundError('La etiqueta no existe.');

    return tagOf(await this.repository.findOneOrThrow(userId, id));
  }

  /** Borrar una etiqueta se lleva sus vínculos por CASCADE, no los movimientos. */
  async eliminar(userId: bigint, id: bigint): Promise<void> {
    if ((await this.repository.delete(userId, id)) === 0) {
      throw new NotFoundError('La etiqueta no existe.');
    }
  }
}

function tagOf(tag: TagRow): Tag {
  return { id: tag.id, name: tag.name, color: tag.color };
}
