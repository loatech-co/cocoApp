import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { Tag } from '@prisma/client';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export class UpsertTagDto {
  @IsString()
  @MinLength(1, { message: 'El nombre de la etiqueta no puede estar vacío.' })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @Matches(HEX, { message: 'El color debe ser hexadecimal, formato #RRGGBB.' })
  color?: string;
}

export interface TagView {
  id: bigint;
  name: string;
  color: string | null;
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(userId: bigint): Promise<TagView[]> {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    return tags.map(presentar);
  }

  /**
   * Get-or-create idempotente sobre el unique (user_id, name).
   *
   * El PRD es explícito: un nombre repetido NO es un error, devuelve la
   * etiqueta existente. La UI las crea al vuelo mientras el usuario escribe, y
   * un 409 ahí sería fricción sin ningún beneficio.
   */
  async obtenerOCrear(userId: bigint, name: string, color?: string): Promise<TagView> {
    const nombre = name.trim();

    const tag = await this.prisma.tag.upsert({
      where: { userId_name: { userId, name: nombre } },
      update: color ? { color } : {},
      create: { userId, name: nombre, color: color ?? null },
    });

    return presentar(tag);
  }

  /** Resuelve una lista de nombres a ids, creando las que falten. */
  async resolverNombres(userId: bigint, nombres: readonly string[]): Promise<bigint[]> {
    const unicos = [...new Set(nombres.map((n) => n.trim()).filter(Boolean))];
    const tags = await Promise.all(unicos.map((nombre) => this.obtenerOCrear(userId, nombre)));
    return tags.map((tag) => tag.id);
  }

  async actualizar(userId: bigint, id: bigint, dto: UpsertTagDto): Promise<TagView> {
    const { count } = await this.prisma.tag.updateMany({
      where: { id, userId },
      data: { name: dto.name.trim(), ...(dto.color !== undefined && { color: dto.color }) },
    });
    if (count === 0) throw new NotFoundException('La etiqueta no existe.');

    const tag = await this.prisma.tag.findFirstOrThrow({ where: { id, userId } });
    return presentar(tag);
  }

  /** Borrar una etiqueta se lleva sus vínculos por CASCADE, no los movimientos. */
  async eliminar(userId: bigint, id: bigint): Promise<void> {
    const { count } = await this.prisma.tag.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('La etiqueta no existe.');
  }
}

function presentar(tag: Tag): TagView {
  return { id: tag.id, name: tag.name, color: tag.color };
}

/** M2 — Etiquetas transversales. */
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  async listar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: TagView[]; meta: { total: number } }> {
    const tags = await this.tags.listar(user.id);
    return { data: tags, meta: { total: tags.length } };
  }

  @Post()
  crear(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertTagDto): Promise<TagView> {
    return this.tags.obtenerOCrear(user.id, dto.name, dto.color);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpsertTagDto,
  ): Promise<TagView> {
    return this.tags.actualizar(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.tags.eliminar(user.id, id);
  }
}

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
